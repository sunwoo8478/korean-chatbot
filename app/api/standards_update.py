"""
공통표준 데이터 반자동 업데이트
새 Excel 파일 업로드 → 기존 DB와 diff → 변경분만 반영 + 임베딩 재생성
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
import io, json, requests
from typing import Optional, List
from ..core.database import db_cursor
from ..core.config import settings

router = APIRouter()

# ── 임베딩 ──────────────────────────────────────────────────────────────────
def _embed(text: str):
    try:
        r = requests.post(settings.ollama_url,
                          json={"model": settings.embed_model, "prompt": text[:2000]},
                          timeout=30)
        return r.json()["embedding"]
    except Exception:
        return None

def _vec(embedding) -> Optional[str]:
    if not embedding:
        return None
    return "[" + ",".join(map(str, embedding)) + "]"

# ── Excel 파싱 ───────────────────────────────────────────────────────────────
def _parse_excel(data: bytes) -> dict:
    """공통표준 Excel → {terms: [...], words: [...], domains: [...]}"""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)

    def read_sheet(ws, key_col: int = 1) -> list[dict]:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h).strip() if h is not None else f"col_{i}"
                   for i, h in enumerate(rows[0])]
        result = []
        for row in rows[1:]:
            if not any(row):
                continue
            item = {headers[i]: (str(v).strip() if v is not None else "")
                    for i, v in enumerate(row)}
            if item.get(headers[key_col - 1], "").strip():
                result.append(item)
        return result

    sheets = {ws.title: ws for ws in wb.worksheets}
    term_ws   = sheets.get("공통표준용어")
    word_ws   = sheets.get("공통표준단어")
    domain_ws = sheets.get("공통표준도메인")

    if not any([term_ws, word_ws, domain_ws]):
        raise HTTPException(400, "공통표준용어/단어/도메인 시트를 찾을 수 없습니다. "
                                 "올바른 공통표준 Excel 파일인지 확인하세요.")

    return {
        "terms":   read_sheet(term_ws)   if term_ws   else [],
        "words":   read_sheet(word_ws)   if word_ws   else [],
        "domains": read_sheet(domain_ws) if domain_ws else [],
    }

# ── Diff 계산 ────────────────────────────────────────────────────────────────
def _diff_terms(new_rows: list[dict]) -> dict:
    """std_term 테이블과 신규 데이터 비교"""
    # 헤더 컬럼명 정규화 (공통표준용어명, 공통표준용어설명, 영문약어 등 매핑)
    COL_MAP = {
        "공통표준용어명":    "term_name",
        "공통표준용어설명":  "term_desc",
        "공통표준용어영문약어명": "term_abbr",
        "공통표준도메인명":  "domain_name",
        "허용값":           "allowed_values",
        "저장 형식":        "storage_format",
        "표현 형식":        "display_format",
        "행정표준코드명":   "admin_code_name",
        "소관기관명":       "org_name",
    }

    def normalize(row: dict) -> dict:
        return {COL_MAP.get(k, k): v for k, v in row.items() if COL_MAP.get(k, k) in COL_MAP.values()}

    new_map = {r.get("공통표준용어명", ""): normalize(r) for r in new_rows if r.get("공통표준용어명")}

    with db_cursor() as cur:
        cur.execute("""
            SELECT term_name, term_desc, term_abbr, domain_name,
                   allowed_values, storage_format, display_format,
                   admin_code_name, org_name
            FROM std_term
        """)
        existing = {r["term_name"]: dict(r) for r in cur.fetchall()}

    added    = [v for k, v in new_map.items() if k not in existing]
    deleted  = [k for k in existing if k not in new_map]
    modified = []
    for name, new_data in new_map.items():
        if name in existing:
            old = existing[name]
            changed_fields = {k: new_data[k] for k in new_data
                              if str(new_data.get(k, "")) != str(old.get(k, ""))}
            if changed_fields:
                modified.append({**new_data, "_changed": list(changed_fields.keys())})

    return {"added": added, "modified": modified, "deleted": deleted,
            "total_new": len(new_map), "total_existing": len(existing)}

def _diff_words(new_rows: list[dict]) -> dict:
    COL_MAP = {
        "공통표준단어명":       "word_name",
        "공통표준단어영문약어명": "word_abbr",
        "공통표준단어 영문명":  "word_eng_name",
        "공통표준단어 설명":    "word_desc",
        "형식단어여부":         "is_format_word",
        "공통표준도메인분류명": "domain_class_name",
    }
    def normalize(row):
        return {COL_MAP.get(k, k): v for k, v in row.items() if COL_MAP.get(k, k) in COL_MAP.values()}

    new_map = {r.get("공통표준단어명", ""): normalize(r) for r in new_rows if r.get("공통표준단어명")}

    with db_cursor() as cur:
        cur.execute("SELECT word_name, word_abbr, word_eng_name, word_desc, domain_class_name FROM std_word")
        existing = {r["word_name"]: dict(r) for r in cur.fetchall()}

    added    = [v for k, v in new_map.items() if k not in existing]
    deleted  = [k for k in existing if k not in new_map]
    modified = []
    for name, nd in new_map.items():
        if name in existing:
            changed = {k: nd[k] for k in nd if str(nd.get(k,"")) != str(existing[name].get(k,""))}
            if changed:
                modified.append({**nd, "_changed": list(changed.keys())})
    return {"added": added, "modified": modified, "deleted": deleted,
            "total_new": len(new_map), "total_existing": len(existing)}

def _diff_domains(new_rows: list[dict]) -> dict:
    COL_MAP = {
        "공통표준도메인그룹명": "domain_group_name",
        "공통표준도메인분류명": "domain_class_name",
        "공통표준도메인명":     "domain_name",
        "공통표준도메인설명":   "domain_desc",
        "데이터타입":          "data_type",
        "데이터길이":          "data_length",
        "데이터소수점길이":     "data_decimal",
        "저장형식":            "storage_format",
        "표현형식":            "display_format",
    }
    def normalize(row):
        return {COL_MAP.get(k, k): v for k, v in row.items() if COL_MAP.get(k, k) in COL_MAP.values()}

    new_map = {r.get("공통표준도메인명", ""): normalize(r) for r in new_rows if r.get("공통표준도메인명")}

    with db_cursor() as cur:
        cur.execute("SELECT domain_name, domain_desc, data_type, data_length, storage_format, display_format FROM std_domain")
        existing = {r["domain_name"]: dict(r) for r in cur.fetchall()}

    added    = [v for k, v in new_map.items() if k not in existing]
    deleted  = [k for k in existing if k not in new_map]
    modified = []
    for name, nd in new_map.items():
        if name in existing:
            changed = {k: nd[k] for k in nd if str(nd.get(k,"")) != str(existing[name].get(k,""))}
            if changed:
                modified.append({**nd, "_changed": list(changed.keys())})
    return {"added": added, "modified": modified, "deleted": deleted,
            "total_new": len(new_map), "total_existing": len(existing)}

# ── DB 반영 ──────────────────────────────────────────────────────────────────
def _apply_terms(diff: dict) -> dict:
    added_cnt = modified_cnt = 0

    with db_cursor() as cur:
        # 신규 추가
        for item in diff["added"]:
            emb = _embed(f"{item.get('term_name','')} {item.get('term_desc','')}")
            cur.execute("""
                INSERT INTO std_term
                    (term_name, term_desc, term_abbr, domain_name,
                     allowed_values, storage_format, display_format,
                     admin_code_name, org_name, embedding, is_obsolete)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,false)
                ON CONFLICT (term_name) DO NOTHING
            """, (item.get("term_name"), item.get("term_desc"), item.get("term_abbr"),
                  item.get("domain_name"), item.get("allowed_values"),
                  item.get("storage_format"), item.get("display_format"),
                  item.get("admin_code_name"), item.get("org_name"), _vec(emb)))
            added_cnt += 1

        # 수정
        for item in diff["modified"]:
            emb = _embed(f"{item.get('term_name','')} {item.get('term_desc','')}")
            cur.execute("""
                UPDATE std_term SET
                    term_desc=%s, term_abbr=%s, domain_name=%s,
                    allowed_values=%s, storage_format=%s, display_format=%s,
                    admin_code_name=%s, org_name=%s, embedding=%s::vector
                WHERE term_name=%s
            """, (item.get("term_desc"), item.get("term_abbr"), item.get("domain_name"),
                  item.get("allowed_values"), item.get("storage_format"),
                  item.get("display_format"), item.get("admin_code_name"),
                  item.get("org_name"), _vec(emb), item.get("term_name")))
            modified_cnt += 1

        # 삭제 → is_obsolete 플래그 (이력 보존)
        for name in diff["deleted"]:
            cur.execute("UPDATE std_term SET is_obsolete=true WHERE term_name=%s", (name,))

    return {"added": added_cnt, "modified": modified_cnt, "deleted": len(diff["deleted"])}

def _apply_words(diff: dict) -> dict:
    added_cnt = modified_cnt = 0
    with db_cursor() as cur:
        for item in diff["added"]:
            emb = _embed(f"{item.get('word_name','')} {item.get('word_desc','')}")
            cur.execute("""
                INSERT INTO std_word (word_name, word_abbr, word_eng_name, word_desc,
                    domain_class_name, is_format_word, embedding, is_obsolete)
                VALUES (%s,%s,%s,%s,%s,%s,%s::vector,false)
                ON CONFLICT (word_name) DO NOTHING
            """, (item.get("word_name"), item.get("word_abbr"), item.get("word_eng_name"),
                  item.get("word_desc"), item.get("domain_class_name"),
                  item.get("is_format_word","N") == "Y", _vec(emb)))
            added_cnt += 1
        for item in diff["modified"]:
            emb = _embed(f"{item.get('word_name','')} {item.get('word_desc','')}")
            cur.execute("""
                UPDATE std_word SET word_abbr=%s, word_eng_name=%s, word_desc=%s,
                    domain_class_name=%s, embedding=%s::vector
                WHERE word_name=%s
            """, (item.get("word_abbr"), item.get("word_eng_name"), item.get("word_desc"),
                  item.get("domain_class_name"), _vec(emb), item.get("word_name")))
            modified_cnt += 1
        for name in diff["deleted"]:
            cur.execute("UPDATE std_word SET is_obsolete=true WHERE word_name=%s", (name,))
    return {"added": added_cnt, "modified": modified_cnt, "deleted": len(diff["deleted"])}

def _apply_domains(diff: dict) -> dict:
    added_cnt = modified_cnt = 0
    with db_cursor() as cur:
        for item in diff["added"]:
            emb = _embed(f"{item.get('domain_name','')} {item.get('domain_desc','')}")
            try:
                dl = int(item.get("data_length","") or 0) or None
                dd = int(item.get("data_decimal","") or 0) or None
            except: dl = dd = None
            cur.execute("""
                INSERT INTO std_domain
                    (domain_group_name, domain_class_name, domain_name, domain_desc,
                     data_type, data_length, data_decimal, storage_format, display_format,
                     embedding, is_obsolete)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,false)
                ON CONFLICT (domain_name) DO NOTHING
            """, (item.get("domain_group_name"), item.get("domain_class_name"),
                  item.get("domain_name"), item.get("domain_desc"),
                  item.get("data_type"), dl, dd,
                  item.get("storage_format"), item.get("display_format"), _vec(emb)))
            added_cnt += 1
        for item in diff["modified"]:
            emb = _embed(f"{item.get('domain_name','')} {item.get('domain_desc','')}")
            cur.execute("""
                UPDATE std_domain SET domain_desc=%s, data_type=%s,
                    storage_format=%s, display_format=%s, embedding=%s::vector
                WHERE domain_name=%s
            """, (item.get("domain_desc"), item.get("data_type"),
                  item.get("storage_format"), item.get("display_format"),
                  _vec(emb), item.get("domain_name")))
            modified_cnt += 1
        for name in diff["deleted"]:
            cur.execute("UPDATE std_domain SET is_obsolete=true WHERE domain_name=%s", (name,))
    return {"added": added_cnt, "modified": modified_cnt, "deleted": len(diff["deleted"])}

# ── 백그라운드 전체 적용 ────────────────────────────────────────────────────
def _run_update(update_id: str, parsed: dict):
    try:
        term_diff   = _diff_terms(parsed["terms"])
        word_diff   = _diff_words(parsed["words"])
        domain_diff = _diff_domains(parsed["domains"])

        term_result   = _apply_terms(term_diff)
        word_result   = _apply_words(word_diff)
        domain_result = _apply_domains(domain_diff)

        result = {
            "status": "done",
            "용어": {**term_result,   "unchanged": term_diff["total_new"]   - term_result["added"]   - term_result["modified"]},
            "단어": {**word_result,   "unchanged": word_diff["total_new"]   - word_result["added"]   - word_result["modified"]},
            "도메인": {**domain_result, "unchanged": domain_diff["total_new"] - domain_result["added"] - domain_result["modified"]},
        }

        with db_cursor() as cur:
            cur.execute("UPDATE standards_updates SET status='done', result=%s WHERE id=%s",
                        (json.dumps(result, ensure_ascii=False), update_id))
            total = sum(result[t].get("added",0)+result[t].get("modified",0)+result[t].get("deleted",0) for t in ["용어","단어","도메인"])
            cur.execute(
                "INSERT INTO notifications (title, message, type) VALUES (%s, %s, 'success')",
                ("공통표준 업데이트 완료", f"총 {total}건 변경 — 용어 {result['용어']['added']}추가/{result['용어']['modified']}수정, 단어 {result['단어']['added']}추가/{result['단어']['modified']}수정")
            )
    except Exception as e:
        with db_cursor() as cur:
            cur.execute("UPDATE standards_updates SET status='error', result=%s WHERE id=%s",
                        (json.dumps({"error": str(e)[:300]}), update_id))

# ── 업데이트 이력 테이블 ─────────────────────────────────────────────────────
def _ensure_update_table():
    with db_cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS standards_updates (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                filename    TEXT NOT NULL,
                status      TEXT DEFAULT 'processing',
                result      JSONB,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """)

_ensure_update_table()

# ── 엔드포인트 ───────────────────────────────────────────────────────────────
@router.post("/standards/preview")
async def preview_update(file: UploadFile = File(...)):
    """업로드 전 diff 미리보기 (실제 DB 변경 없음)"""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "xlsx 파일만 지원합니다.")
    data = await file.read()
    parsed = _parse_excel(data)

    term_diff   = _diff_terms(parsed["terms"])
    word_diff   = _diff_words(parsed["words"])
    domain_diff = _diff_domains(parsed["domains"])

    return {
        "file": file.filename,
        "summary": {
            "용어":  {"신규": len(term_diff["added"]),   "수정": len(term_diff["modified"]),   "삭제": len(term_diff["deleted"]),   "전체": term_diff["total_new"]},
            "단어":  {"신규": len(word_diff["added"]),   "수정": len(word_diff["modified"]),   "삭제": len(word_diff["deleted"]),   "전체": word_diff["total_new"]},
            "도메인":{"신규": len(domain_diff["added"]), "수정": len(domain_diff["modified"]), "삭제": len(domain_diff["deleted"]), "전체": domain_diff["total_new"]},
        },
        "samples": {
            "신규 용어 샘플": [r.get("term_name") for r in term_diff["added"][:5]],
            "수정 용어 샘플": [{"이름": r.get("term_name"), "변경 필드": r.get("_changed")} for r in term_diff["modified"][:5]],
            "삭제 용어 샘플": term_diff["deleted"][:5],
        }
    }

@router.post("/standards/apply")
async def apply_update(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """실제 업데이트 적용 (백그라운드)"""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "xlsx 파일만 지원합니다.")
    data = await file.read()
    parsed = _parse_excel(data)

    with db_cursor() as cur:
        cur.execute("INSERT INTO standards_updates (filename) VALUES (%s) RETURNING id",
                    (file.filename,))
        update_id = str(cur.fetchone()["id"])

    background_tasks.add_task(_run_update, update_id, parsed)
    return {"id": update_id, "status": "processing", "message": "백그라운드에서 업데이트 중입니다."}

@router.get("/standards/updates")
def list_updates():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM standards_updates ORDER BY created_at DESC LIMIT 20")
        return [dict(r) for r in cur.fetchall()]

@router.get("/standards/updates/{update_id}")
def get_update(update_id: str):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM standards_updates WHERE id=%s", (update_id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Not found")
        return dict(row)
