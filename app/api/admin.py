from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
import time, requests
from ..core.database import db_cursor
from ..core.config import settings
from ..core import runtime_config as rc

router = APIRouter()

def _log_history(cur, table: str, record_id: int, action: str, old=None, new=None):
    cur.execute(
        "INSERT INTO term_change_history (table_name, record_id, action, old_data, new_data) VALUES (%s,%s,%s,%s,%s)",
        (table, record_id, action,
         __import__('json').dumps(old, ensure_ascii=False) if old else None,
         __import__('json').dumps(new, ensure_ascii=False) if new else None)
    )

# ── 대시보드 ──────────────────────────────────────────────────────────────────
@router.get("/admin/stats")
def get_stats():
    with db_cursor() as cur:
        cur.execute("""
            SELECT 'std_term'    AS tbl, COUNT(*) AS total, COUNT(embedding) AS embedded FROM std_term
            UNION ALL SELECT 'std_word',   COUNT(*), COUNT(embedding) FROM std_word
            UNION ALL SELECT 'std_domain', COUNT(*), COUNT(embedding) FROM std_domain
            UNION ALL SELECT 'dict_senses',COUNT(*), COUNT(embedding) FROM dict_senses
            UNION ALL SELECT 'user_doc_chunks', COUNT(*), COUNT(embedding) FROM user_doc_chunks
        """)
        tables = [dict(r) for r in cur.fetchall()]
        cur.execute("SELECT COUNT(DISTINCT id) AS conv_count, (SELECT COUNT(*) FROM chat_messages WHERE role='user') AS msg_count FROM conversations")
        conv = dict(cur.fetchone())
        cur.execute("SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE status='ready') AS ready FROM user_documents")
        docs = dict(cur.fetchone())
        cur.execute("SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE is_active) AS active FROM skills")
        skills = dict(cur.fetchone())
        cur.execute("SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE rating=1) AS positive, COUNT(*) FILTER(WHERE rating=-1) AS negative FROM chat_feedback")
        feedback = dict(cur.fetchone())
        cur.execute("SELECT AVG(duration_ms) AS avg_ms, MAX(duration_ms) AS max_ms, COUNT(*) FILTER(WHERE error_msg IS NOT NULL) AS errors FROM request_logs WHERE created_at > NOW()-INTERVAL '24h'")
        perf = dict(cur.fetchone())

    models = {}
    for name, url in [("35B (vLLM)", settings.vllm_url), ("27B (Ollama)", settings.vllm_url_dense)]:
        try:
            r = requests.get(f"{url}/models", timeout=3)
            models[name] = "정상" if r.status_code == 200 else "오류"
        except:
            models[name] = "연결 불가"

    return {"tables": tables, "conversations": conv, "documents": docs,
            "skills": skills, "models": models, "feedback": feedback, "performance": perf}


# ── 공통표준 CRUD ──────────────────────────────────────────────────────────────
class TermBody(BaseModel):
    term_name: str
    term_abbr: Optional[str] = ""
    domain_name: Optional[str] = ""
    term_desc: Optional[str] = ""
    admin_code_name: Optional[str] = ""
    org_name: Optional[str] = ""

class WordBody(BaseModel):
    word_name: str
    word_abbr: Optional[str] = ""
    word_eng_name: Optional[str] = ""
    word_desc: Optional[str] = ""
    domain_class_name: Optional[str] = ""
    is_format_word: Optional[bool] = False

class DomainBody(BaseModel):
    domain_name: str
    domain_desc: Optional[str] = ""
    data_type: Optional[str] = ""
    data_length: Optional[int] = None
    data_decimal: Optional[int] = None
    storage_format: Optional[str] = ""
    display_format: Optional[str] = ""

def _embed(text: str):
    try:
        r = requests.post(settings.ollama_url, json={"model": settings.embed_model, "prompt": text[:2000]}, timeout=30)
        emb = r.json()["embedding"]
        return "[" + ",".join(map(str, emb)) + "]"
    except:
        return None

@router.get("/admin/terms")
def list_terms(q: str = Query(""), limit: int = 0, offset: int = 0):
    with db_cursor() as cur:
        if limit > 0:
            cur.execute("""
                SELECT id, term_name, term_abbr, domain_name, term_desc, admin_code_name, org_name,
                       (embedding IS NOT NULL) AS has_embedding, is_obsolete
                FROM std_term WHERE (term_name ILIKE %s OR term_abbr ILIKE %s OR domain_name ILIKE %s)
                ORDER BY term_name LIMIT %s OFFSET %s
            """, (f"%{q}%", f"%{q}%", f"%{q}%", limit, offset))
        else:
            cur.execute("""
                SELECT id, term_name, term_abbr, domain_name, term_desc, admin_code_name, org_name,
                       (embedding IS NOT NULL) AS has_embedding, is_obsolete
                FROM std_term WHERE (term_name ILIKE %s OR term_abbr ILIKE %s OR domain_name ILIKE %s)
                ORDER BY term_name
            """, (f"%{q}%", f"%{q}%", f"%{q}%"))
        return [dict(r) for r in cur.fetchall()]

@router.post("/admin/terms")
def create_term(data: TermBody):
    vec = _embed(f"{data.term_name} {data.term_desc}")
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO std_term (term_name, term_abbr, domain_name, term_desc, admin_code_name, org_name, embedding)
            VALUES (%s,%s,%s,%s,%s,%s,%s::vector) RETURNING id
        """, (data.term_name, data.term_abbr, data.domain_name, data.term_desc,
              data.admin_code_name, data.org_name, vec))
        new_id = cur.fetchone()["id"]
        _log_history(cur, "std_term", new_id, "create", new=data.dict())
        return {"id": str(new_id)}

@router.patch("/admin/terms/{term_id}")
def update_term(term_id: int, data: TermBody):
    vec = _embed(f"{data.term_name} {data.term_desc}")
    with db_cursor() as cur:
        cur.execute("SELECT term_name,term_abbr,domain_name,term_desc,admin_code_name,org_name FROM std_term WHERE id=%s", (term_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("""
            UPDATE std_term SET term_name=%s, term_abbr=%s, domain_name=%s, term_desc=%s,
            admin_code_name=%s, org_name=%s, embedding=%s::vector WHERE id=%s
        """, (data.term_name, data.term_abbr, data.domain_name, data.term_desc,
              data.admin_code_name, data.org_name, vec, term_id))
        _log_history(cur, "std_term", term_id, "update", old=old, new=data.dict())
    return {"ok": True}

@router.delete("/admin/terms/{term_id}")
def delete_term(term_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT term_name,term_abbr,domain_name,term_desc FROM std_term WHERE id=%s", (term_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("DELETE FROM std_term WHERE id=%s", (term_id,))
        if old: _log_history(cur, "std_term", term_id, "delete", old=old)
    return {"ok": True}

@router.get("/admin/words")
def list_words(q: str = Query(""), limit: int = 0, offset: int = 0):
    with db_cursor() as cur:
        if limit > 0:
            cur.execute("""
                SELECT id, word_name, word_abbr, word_eng_name, word_desc, domain_class_name,
                       is_format_word, (embedding IS NOT NULL) AS has_embedding
                FROM std_word WHERE (word_name ILIKE %s OR word_abbr ILIKE %s OR word_eng_name ILIKE %s)
                ORDER BY word_name LIMIT %s OFFSET %s
            """, (f"%{q}%", f"%{q}%", f"%{q}%", limit, offset))
        else:
            cur.execute("""
                SELECT id, word_name, word_abbr, word_eng_name, word_desc, domain_class_name,
                       is_format_word, (embedding IS NOT NULL) AS has_embedding
                FROM std_word WHERE (word_name ILIKE %s OR word_abbr ILIKE %s OR word_eng_name ILIKE %s)
                ORDER BY word_name
            """, (f"%{q}%", f"%{q}%", f"%{q}%"))
        return [dict(r) for r in cur.fetchall()]

@router.post("/admin/words")
def create_word(data: WordBody):
    vec = _embed(f"{data.word_name} {data.word_desc}")
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO std_word (word_name, word_abbr, word_eng_name, word_desc, domain_class_name, is_format_word, embedding)
            VALUES (%s,%s,%s,%s,%s,%s,%s::vector) RETURNING id
        """, (data.word_name, data.word_abbr, data.word_eng_name, data.word_desc,
              data.domain_class_name, data.is_format_word, vec))
        new_id = cur.fetchone()["id"]
        _log_history(cur, "std_word", new_id, "create", new=data.dict())
        return {"id": str(new_id)}

@router.patch("/admin/words/{word_id}")
def update_word(word_id: int, data: WordBody):
    vec = _embed(f"{data.word_name} {data.word_desc}")
    with db_cursor() as cur:
        cur.execute("SELECT word_name,word_abbr,word_eng_name,word_desc FROM std_word WHERE id=%s", (word_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("""
            UPDATE std_word SET word_name=%s, word_abbr=%s, word_eng_name=%s, word_desc=%s,
            domain_class_name=%s, is_format_word=%s, embedding=%s::vector WHERE id=%s
        """, (data.word_name, data.word_abbr, data.word_eng_name, data.word_desc,
              data.domain_class_name, data.is_format_word, vec, word_id))
        _log_history(cur, "std_word", word_id, "update", old=old, new=data.dict())
    return {"ok": True}

@router.delete("/admin/words/{word_id}")
def delete_word(word_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT word_name,word_abbr,word_eng_name,word_desc FROM std_word WHERE id=%s", (word_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("DELETE FROM std_word WHERE id=%s", (word_id,))
        if old: _log_history(cur, "std_word", word_id, "delete", old=old)
    return {"ok": True}

@router.get("/admin/domains")
def list_domains(q: str = Query(""), limit: int = 0, offset: int = 0):
    with db_cursor() as cur:
        if limit > 0:
            cur.execute("""
                SELECT id, domain_name, domain_desc, data_type, data_length, data_decimal,
                       storage_format, display_format, (embedding IS NOT NULL) AS has_embedding
                FROM std_domain WHERE (domain_name ILIKE %s OR domain_desc ILIKE %s)
                ORDER BY domain_name LIMIT %s OFFSET %s
            """, (f"%{q}%", f"%{q}%", limit, offset))
        else:
            cur.execute("""
                SELECT id, domain_name, domain_desc, data_type, data_length, data_decimal,
                       storage_format, display_format, (embedding IS NOT NULL) AS has_embedding
                FROM std_domain WHERE (domain_name ILIKE %s OR domain_desc ILIKE %s)
                ORDER BY domain_name
            """, (f"%{q}%", f"%{q}%"))
        return [dict(r) for r in cur.fetchall()]


@router.get("/admin/search-all")
def search_all(q: str = Query(""), mode: str = Query("title")):
    """
    통합 검색 (공통표준 + 표준국어대사전)
    mode=title   : 제목(이름/약어) 기준 검색
    mode=content : 내용(설명/뜻풀이) 기준 검색
    mode=all     : 제목 + 내용 모두 검색
    """
    if not q:
        return {"terms": [], "words": [], "domains": [], "dict": [], "total": 0, "mode": mode}

    with db_cursor() as cur:
        # 공통표준용어
        if mode == "title":
            term_where = "term_name ILIKE %s OR term_abbr ILIKE %s OR domain_name ILIKE %s"
            term_params = (f"%{q}%", f"%{q}%", f"%{q}%")
        elif mode == "content":
            term_where = "term_desc ILIKE %s"
            term_params = (f"%{q}%",)
        else:
            term_where = "term_name ILIKE %s OR term_abbr ILIKE %s OR domain_name ILIKE %s OR term_desc ILIKE %s"
            term_params = (f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%")

        cur.execute(f"""
            SELECT id, term_name AS name, term_abbr AS abbr, domain_name AS domain,
                   term_desc AS desc, 'term' AS type
            FROM std_term WHERE {term_where} ORDER BY term_name
        """, term_params)
        terms = [dict(r) for r in cur.fetchall()]

        # 공통표준단어
        if mode == "title":
            word_where = "word_name ILIKE %s OR word_abbr ILIKE %s OR word_eng_name ILIKE %s"
            word_params = (f"%{q}%", f"%{q}%", f"%{q}%")
        elif mode == "content":
            word_where = "word_desc ILIKE %s"
            word_params = (f"%{q}%",)
        else:
            word_where = "word_name ILIKE %s OR word_abbr ILIKE %s OR word_eng_name ILIKE %s OR word_desc ILIKE %s"
            word_params = (f"%{q}%", f"%{q}%", f"%{q}%", f"%{q}%")

        cur.execute(f"""
            SELECT id, word_name AS name, word_abbr AS abbr, word_eng_name AS domain,
                   word_desc AS desc, 'word' AS type
            FROM std_word WHERE {word_where} ORDER BY word_name
        """, word_params)
        words = [dict(r) for r in cur.fetchall()]

        # 공통표준도메인
        if mode == "title":
            domain_where = "domain_name ILIKE %s"
            domain_params = (f"%{q}%",)
        elif mode == "content":
            domain_where = "domain_desc ILIKE %s"
            domain_params = (f"%{q}%",)
        else:
            domain_where = "domain_name ILIKE %s OR domain_desc ILIKE %s"
            domain_params = (f"%{q}%", f"%{q}%")

        cur.execute(f"""
            SELECT id, domain_name AS name, data_type AS abbr, data_length::text AS domain,
                   domain_desc AS desc, 'domain' AS type
            FROM std_domain WHERE {domain_where} ORDER BY domain_name
        """, domain_params)
        domains = [dict(r) for r in cur.fetchall()]

        # 표준국어대사전
        if mode == "title":
            dict_where = "e.word ILIKE %s"
            dict_params = (f"%{q}%",)
        elif mode == "content":
            dict_where = "s.definition ILIKE %s"
            dict_params = (f"%{q}%",)
        else:
            dict_where = "e.word ILIKE %s OR s.definition ILIKE %s"
            dict_params = (f"%{q}%", f"%{q}%")

        cur.execute(f"""
            SELECT s.id, e.word AS name, s.pos AS abbr, e.origin AS domain,
                   s.definition AS desc, 'dict' AS type
            FROM dict_senses s
            JOIN dict_entries e ON e.id = s.entry_id
            WHERE {dict_where}
            ORDER BY
                CASE WHEN e.word = %s THEN 0
                     WHEN e.word ILIKE %s THEN 1
                     ELSE 2 END,
                e.word, s.id
            LIMIT 300
        """, dict_params + (q, f"{q}%"))
        dict_results = [dict(r) for r in cur.fetchall()]

    return {
        "terms": terms,
        "words": words,
        "domains": domains,
        "dict": dict_results,
        "total": len(terms) + len(words) + len(domains) + len(dict_results),
        "mode": mode,
    }

@router.post("/admin/domains")
def create_domain(data: DomainBody):
    vec = _embed(f"{data.domain_name} {data.domain_desc}")
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO std_domain (domain_name, domain_desc, data_type, data_length, data_decimal,
            storage_format, display_format, embedding)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s::vector) RETURNING id
        """, (data.domain_name, data.domain_desc, data.data_type, data.data_length,
              data.data_decimal, data.storage_format, data.display_format, vec))
        new_id = cur.fetchone()["id"]
        _log_history(cur, "std_domain", new_id, "create", new=data.dict())
        return {"id": str(new_id)}

@router.patch("/admin/domains/{domain_id}")
def update_domain(domain_id: int, data: DomainBody):
    vec = _embed(f"{data.domain_name} {data.domain_desc}")
    with db_cursor() as cur:
        cur.execute("SELECT domain_name,domain_desc,data_type,data_length FROM std_domain WHERE id=%s", (domain_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("""
            UPDATE std_domain SET domain_name=%s, domain_desc=%s, data_type=%s, data_length=%s,
            data_decimal=%s, storage_format=%s, display_format=%s, embedding=%s::vector WHERE id=%s
        """, (data.domain_name, data.domain_desc, data.data_type, data.data_length,
              data.data_decimal, data.storage_format, data.display_format, vec, domain_id))
        _log_history(cur, "std_domain", domain_id, "update", old=old, new=data.dict())
    return {"ok": True}

@router.delete("/admin/domains/{domain_id}")
def delete_domain(domain_id: int):
    with db_cursor() as cur:
        cur.execute("SELECT domain_name,domain_desc,data_type,data_length FROM std_domain WHERE id=%s", (domain_id,))
        old = dict(cur.fetchone()) if cur.rowcount else None
        cur.execute("DELETE FROM std_domain WHERE id=%s", (domain_id,))
        if old: _log_history(cur, "std_domain", domain_id, "delete", old=old)
    return {"ok": True}


# ── 자동완성 ──────────────────────────────────────────────────────────────────
@router.get("/admin/autocomplete")
def autocomplete(q: str = Query(""), limit: int = 10):
    if not q or len(q) < 1:
        return []
    with db_cursor() as cur:
        cur.execute("""
            SELECT name, type FROM (
                SELECT term_name AS name, '용어' AS type FROM std_term WHERE term_name ILIKE %s
                UNION ALL
                SELECT term_abbr, '약어' FROM std_term WHERE term_abbr ILIKE %s AND term_abbr != '' AND term_abbr != '-'
                UNION ALL
                SELECT word_name, '단어' FROM std_word WHERE word_name ILIKE %s
                UNION ALL
                SELECT domain_name, '도메인' FROM std_domain WHERE domain_name ILIKE %s
            ) t
            ORDER BY
                CASE WHEN name = %s THEN 0 WHEN name ILIKE %s THEN 1 ELSE 2 END,
                name
            LIMIT %s
        """, (f"{q}%", f"{q}%", f"{q}%", f"{q}%", q, f"{q}%", limit))
        return [dict(r) for r in cur.fetchall()]


# ── 롤백 ──────────────────────────────────────────────────────────────────────
@router.post("/admin/rollback/{history_id}")
def rollback_change(history_id: int):
    """변경 이력의 old_data로 해당 항목을 복원"""
    import json as _json
    with db_cursor() as cur:
        cur.execute("SELECT * FROM term_change_history WHERE id=%s", (history_id,))
        hist = cur.fetchone()
        if not hist:
            raise HTTPException(404, "이력을 찾을 수 없습니다.")

        hist = dict(hist)
        if not hist.get("old_data"):
            raise HTTPException(400, "복원할 이전 데이터가 없습니다. (신규 생성 항목)")

        old = _json.loads(hist["old_data"]) if isinstance(hist["old_data"], str) else hist["old_data"]
        table = hist["table_name"]
        rid   = hist["record_id"]

        if table == "std_term":
            cur.execute("""
                UPDATE std_term SET term_name=%s, term_abbr=%s, domain_name=%s,
                term_desc=%s, admin_code_name=%s, org_name=%s WHERE id=%s
            """, (old.get("term_name"), old.get("term_abbr"), old.get("domain_name"),
                  old.get("term_desc"), old.get("admin_code_name"), old.get("org_name"), rid))
        elif table == "std_word":
            cur.execute("""
                UPDATE std_word SET word_name=%s, word_abbr=%s, word_eng_name=%s,
                word_desc=%s WHERE id=%s
            """, (old.get("word_name"), old.get("word_abbr"), old.get("word_eng_name"),
                  old.get("word_desc"), rid))
        elif table == "std_domain":
            cur.execute("""
                UPDATE std_domain SET domain_name=%s, domain_desc=%s, data_type=%s,
                data_length=%s WHERE id=%s
            """, (old.get("domain_name"), old.get("domain_desc"), old.get("data_type"),
                  old.get("data_length"), rid))
        else:
            raise HTTPException(400, f"지원하지 않는 테이블: {table}")

        _log_history(cur, table, rid, "rollback", new=old)

    return {"ok": True, "restored": old}


# ── 변경 이력 ─────────────────────────────────────────────────────────────────
@router.get("/admin/history")
def get_history(table: str = "", limit: int = 100):
    with db_cursor() as cur:
        if table:
            cur.execute("""
                SELECT * FROM term_change_history WHERE table_name=%s
                ORDER BY changed_at DESC LIMIT %s
            """, (table, limit))
        else:
            cur.execute("SELECT * FROM term_change_history ORDER BY changed_at DESC LIMIT %s", (limit,))
        return [dict(r) for r in cur.fetchall()]

# ── RAG 검색 테스트 ───────────────────────────────────────────────────────────
@router.post("/admin/rag-test")
def rag_test(body: dict):
    query = body.get("query", "")
    if not query:
        raise HTTPException(400, "query 필요")
    from ..rag.embedder import embed_query
    from ..rag.retriever import retrieve
    from ..rag.reranker import rerank
    from ..rag.pipeline import group_context
    embedding = embed_query(query)
    retrieved = retrieve(embedding, query_text=query)
    reranked   = rerank(query, retrieved["vector"])
    seen = {(d["source"], d["title"]) for d in retrieved["exact"]}
    final = list(retrieved["exact"])
    for d in reranked:
        if (d["source"], d["title"]) not in seen:
            final.append(d); seen.add((d["source"], d["title"]))
    return {
        "query": query,
        "exact_count": len(retrieved["exact"]),
        "vector_count": len(retrieved["vector"]),
        "final_count": len(final),
        "context": group_context(final),
        "docs": [{"source": d["source"], "title": d["title"],
                  "score": round(d.get("score", 0), 4),
                  "content": d.get("content", "")[:200]} for d in final],
    }


# ── 프롬프트 편집 ─────────────────────────────────────────────────────────────
@router.get("/admin/prompt")
def get_prompt():
    from ..rag.pipeline import SYSTEM_PROMPT
    override = rc.get_system_prompt_override()
    return {"default": SYSTEM_PROMPT, "override": override, "active": override or SYSTEM_PROMPT}

@router.patch("/admin/prompt")
def update_prompt(body: dict):
    rc.set_config("system_prompt", body.get("prompt", ""))
    return {"ok": True}

@router.delete("/admin/prompt")
def reset_prompt():
    rc.set_config("system_prompt", "")
    return {"ok": True}


# ── 모델 설정 ─────────────────────────────────────────────────────────────────
@router.get("/admin/model-config")
def get_model_config():
    return rc.get_all()

@router.patch("/admin/model-config")
def update_model_config(body: dict):
    allowed = {"temperature", "max_tokens", "top_k", "similarity_threshold"}
    for k, v in body.items():
        if k in allowed:
            rc.set_config(k, str(v))
    return {"ok": True, "config": rc.get_all()}


# ── 임베딩 재생성 ─────────────────────────────────────────────────────────────
@router.post("/admin/reembed/{table}/{item_id}")
def reembed_item(table: str, item_id: int):
    allowed = {"std_term": ("term_name","term_desc"), "std_word": ("word_name","word_desc"), "std_domain": ("domain_name","domain_desc")}
    if table not in allowed:
        raise HTTPException(400, "지원하지 않는 테이블")
    n1, n2 = allowed[table]
    with db_cursor() as cur:
        cur.execute(f"SELECT {n1}, {n2} FROM {table} WHERE id=%s", (item_id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404, "항목 없음")
        vec = _embed(f"{row[n1]} {row[n2] or ''}")
        if vec:
            cur.execute(f"UPDATE {table} SET embedding=%s::vector WHERE id=%s", (vec, item_id))
    return {"ok": True}


# ── 피드백 ────────────────────────────────────────────────────────────────────
class FeedbackBody(BaseModel):
    conversation_id: Optional[str] = None
    message_content: str
    rating: int   # 1 or -1
    comment: Optional[str] = ""

@router.post("/admin/feedback")
def submit_feedback(data: FeedbackBody):
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO chat_feedback (conversation_id, message_content, rating, comment)
            VALUES (%s, %s, %s, %s) RETURNING id
        """, (data.conversation_id, data.message_content, data.rating, data.comment))
        return {"id": str(cur.fetchone()["id"])}

@router.get("/admin/feedback")
def list_feedback(rating: Optional[int] = None, limit: int = 50):
    with db_cursor() as cur:
        if rating:
            cur.execute("SELECT * FROM chat_feedback WHERE rating=%s ORDER BY created_at DESC LIMIT %s", (rating, limit))
        else:
            cur.execute("SELECT * FROM chat_feedback ORDER BY created_at DESC LIMIT %s", (limit,))
        return [dict(r) for r in cur.fetchall()]

@router.delete("/admin/feedback/{feedback_id}")
def delete_feedback(feedback_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM chat_feedback WHERE id=%s", (feedback_id,))
    return {"ok": True}


# ── 문서 관리 ─────────────────────────────────────────────────────────────────
@router.get("/admin/documents")
def list_documents():
    with db_cursor() as cur:
        cur.execute("""
            SELECT d.id, d.filename, d.file_type, d.file_size, d.total_chunks,
                   d.status, d.error_msg, d.created_at,
                   COUNT(c.id) AS chunk_count,
                   COUNT(c.id) FILTER(WHERE c.embedding IS NOT NULL) AS embedded_chunks
            FROM user_documents d
            LEFT JOIN user_doc_chunks c ON c.doc_id = d.id
            GROUP BY d.id ORDER BY d.created_at DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@router.get("/admin/documents/{doc_id}/chunks")
def list_chunks(doc_id: str, limit: int = 100):
    with db_cursor() as cur:
        cur.execute("""
            SELECT id, chunk_no, page_no, sheet_name, section,
                   LEFT(content, 200) AS content_preview, char_count,
                   (embedding IS NOT NULL) AS has_embedding
            FROM user_doc_chunks WHERE doc_id=%s ORDER BY chunk_no LIMIT %s
        """, (doc_id, limit))
        return [dict(r) for r in cur.fetchall()]

@router.delete("/admin/documents/{doc_id}")
def delete_document(doc_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM user_documents WHERE id=%s", (doc_id,))
    return {"ok": True}

@router.post("/admin/documents/{doc_id}/reembed")
def reembed_document(doc_id: str):
    import asyncio
    with db_cursor() as cur:
        cur.execute("SELECT id, content FROM user_doc_chunks WHERE doc_id=%s", (doc_id,))
        chunks = [dict(r) for r in cur.fetchall()]
    count = 0
    for chunk in chunks:
        vec = _embed(chunk["content"])
        if vec:
            with db_cursor() as cur:
                cur.execute("UPDATE user_doc_chunks SET embedding=%s::vector WHERE id=%s", (vec, chunk["id"]))
            count += 1
    with db_cursor() as cur:
        cur.execute("UPDATE user_documents SET status='ready', updated_at=NOW() WHERE id=%s", (doc_id,))
    return {"reembedded": count}


# ── 사용 통계 ─────────────────────────────────────────────────────────────────
@router.get("/admin/usage/top-queries")
def top_queries(limit: int = 30):
    with db_cursor() as cur:
        cur.execute("""
            SELECT content AS question, created_at, conversation_id
            FROM chat_messages WHERE role='user'
            ORDER BY created_at DESC LIMIT %s
        """, (limit,))
        return [dict(r) for r in cur.fetchall()]

@router.get("/admin/usage/daily")
def daily_usage():
    with db_cursor() as cur:
        cur.execute("""
            SELECT DATE(created_at) AS date,
                   COUNT(*) FILTER(WHERE role='user') AS questions,
                   COUNT(DISTINCT conversation_id) AS sessions
            FROM chat_messages
            WHERE created_at >= NOW()-INTERVAL '30 days'
            GROUP BY DATE(created_at) ORDER BY date DESC
        """)
        return [dict(r) for r in cur.fetchall()]

@router.get("/admin/usage/performance")
def performance_stats():
    with db_cursor() as cur:
        cur.execute("""
            SELECT DATE_TRUNC('hour', created_at) AS hour,
                   ROUND(AVG(duration_ms)) AS avg_ms,
                   MAX(duration_ms) AS max_ms,
                   COUNT(*) AS requests,
                   COUNT(*) FILTER(WHERE error_msg IS NOT NULL) AS errors
            FROM request_logs
            WHERE created_at > NOW()-INTERVAL '24h'
            GROUP BY DATE_TRUNC('hour', created_at)
            ORDER BY hour DESC
        """)
        return [dict(r) for r in cur.fetchall()]


# ── 채팅 관리 ─────────────────────────────────────────────────────────────────
@router.get("/admin/conversations")
def list_all_conversations(limit: int = 50, offset: int = 0, q: str = ""):
    with db_cursor() as cur:
        if q:
            cur.execute("""
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count
                FROM conversations c
                LEFT JOIN chat_messages m ON m.conversation_id = c.id
                WHERE c.title ILIKE %s
                GROUP BY c.id ORDER BY c.updated_at DESC LIMIT %s OFFSET %s
            """, (f"%{q}%", limit, offset))
        else:
            cur.execute("""
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count
                FROM conversations c
                LEFT JOIN chat_messages m ON m.conversation_id = c.id
                GROUP BY c.id ORDER BY c.updated_at DESC LIMIT %s OFFSET %s
            """, (limit, offset))
        return [dict(r) for r in cur.fetchall()]

@router.delete("/admin/conversations/all")
def delete_all_conversations():
    with db_cursor() as cur:
        cur.execute("DELETE FROM conversations")
    return {"ok": True}


# ── 로그 ──────────────────────────────────────────────────────────────────────
@router.get("/admin/logs")
def get_logs(limit: int = 100, errors_only: bool = False):
    with db_cursor() as cur:
        if errors_only:
            cur.execute("SELECT * FROM request_logs WHERE error_msg IS NOT NULL ORDER BY created_at DESC LIMIT %s", (limit,))
        else:
            cur.execute("SELECT * FROM request_logs ORDER BY created_at DESC LIMIT %s", (limit,))
        return [dict(r) for r in cur.fetchall()]


# ── 시스템 ────────────────────────────────────────────────────────────────────
@router.get("/admin/system")
def system_info():
    import sys
    return {
        "python": sys.version.split(" ")[0],
        "db_host": settings.db_host,
        "db_port": settings.db_port,
        "vllm_url": settings.vllm_url,
        "vllm_url_dense": settings.vllm_url_dense,
        "embed_model": settings.embed_model,
        "vllm_model": settings.vllm_model,
        "vllm_model_dense": settings.vllm_model_dense,
        "temperature": rc.get_temperature(),
        "max_tokens": rc.get_max_tokens(),
        "top_k": rc.get_top_k(),
        "similarity_threshold": rc.get_similarity_threshold(),
    }
