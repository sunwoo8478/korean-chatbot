from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json, httpx, asyncio
from ..core.database import db_cursor
from ..core.skill_builder import (
    build_skill_with_llm, validate_code, load_skill, unload_skill, execute_code_skill
)

router = APIRouter()

class SkillGenRequest(BaseModel):
    request: str   # 자연어 스킬 요청


class SkillCreate(BaseModel):
    name: str
    description: str
    skill_type: str = "prompt"   # prompt | db_query | http
    config: dict = {}

class SkillUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None

# ── 목록 ──────────────────────────────────────────────────────────────────────
@router.get("/skills")
def list_skills():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM skills ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]

# ── 생성 ──────────────────────────────────────────────────────────────────────
@router.post("/skills")
def create_skill(data: SkillCreate):
    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO skills (name, description, skill_type, config)
               VALUES (%s, %s, %s, %s) RETURNING *""",
            (data.name, data.description, data.skill_type,
             json.dumps(data.config, ensure_ascii=False))
        )
        return dict(cur.fetchone())

# ── 수정 ──────────────────────────────────────────────────────────────────────
@router.patch("/skills/{skill_id}")
def update_skill(skill_id: str, data: SkillUpdate):
    updates, params = [], []
    if data.name is not None:
        updates.append("name=%s"); params.append(data.name)
    if data.description is not None:
        updates.append("description=%s"); params.append(data.description)
    if data.config is not None:
        updates.append("config=%s"); params.append(json.dumps(data.config, ensure_ascii=False))
    if not updates:
        raise HTTPException(400, "변경 사항 없음")
    updates.append("updated_at=NOW()")
    params.append(skill_id)
    with db_cursor() as cur:
        cur.execute(f"UPDATE skills SET {','.join(updates)} WHERE id=%s RETURNING *", params)
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Not found")
        return dict(row)

# ── 활성/비활성 토글 ───────────────────────────────────────────────────────────
@router.patch("/skills/{skill_id}/toggle")
def toggle_skill(skill_id: str):
    with db_cursor() as cur:
        cur.execute(
            "UPDATE skills SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING id, name, is_active",
            (skill_id,)
        )
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Not found")
        return dict(row)

# ── 삭제 ──────────────────────────────────────────────────────────────────────
@router.delete("/skills/{skill_id}")
def delete_skill(skill_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM skills WHERE id=%s RETURNING id", (skill_id,))
        if not cur.fetchone(): raise HTTPException(404, "Not found")
    return {"deleted": skill_id}

# ── AI 스킬 자동 생성 (SSE 스트리밍) ─────────────────────────────────────────
@router.post("/skills/generate")
async def generate_skill(data: SkillGenRequest):
    """자연어 요청 → LLM 코드 생성 → 검증 → DB 저장 → 동적 로드 (SSE)"""

    async def event_stream():
        def send(step: str, message: str, payload: dict = None):
            obj = {"step": step, "message": message}
            if payload:
                obj.update(payload)
            return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

        try:
            yield send("start", "LLM이 스킬 코드를 생성하고 있습니다...")

            loop = asyncio.get_event_loop()
            skill_data = await loop.run_in_executor(None, build_skill_with_llm, data.request)

            yield send("generated", "코드 생성 완료. 검증 중...", {
                "tool_name": skill_data.get("tool_name"),
                "description": skill_data.get("description"),
                "code": skill_data.get("code"),
                "parameters": skill_data.get("parameters", {}),
            })

            code = validate_code(skill_data["code"], skill_data["tool_name"])
            yield send("validated", "문법 검사 통과. DB에 저장 중...")

            with db_cursor() as cur:
                cur.execute("""
                    INSERT INTO skills (name, description, skill_type, config, generated_code)
                    VALUES (%s, %s, 'code', %s, %s)
                    RETURNING id
                """, (
                    skill_data["tool_name"],
                    skill_data["description"],
                    json.dumps({"parameters": skill_data.get("parameters", {})}, ensure_ascii=False),
                    code,
                ))
                skill_id = str(cur.fetchone()["id"])

            yield send("saved", "DB 저장 완료. 메모리에 로드 중...")

            load_skill(skill_id, skill_data["tool_name"], code)
            yield send("done", f"스킬 '{skill_data['tool_name']}' 생성 완료!", {"skill_id": skill_id})

        except Exception as e:
            yield send("error", str(e))

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── 코드 스킬 수동 재로드 ─────────────────────────────────────────────────────
@router.post("/skills/{skill_id}/reload")
def reload_skill(skill_id: str):
    with db_cursor() as cur:
        cur.execute("SELECT name, generated_code FROM skills WHERE id=%s AND skill_type='code'", (skill_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "코드 스킬이 아니거나 존재하지 않습니다.")
    load_skill(skill_id, row["name"], row["generated_code"])
    return {"status": "reloaded", "skill_id": skill_id}


# ── 스킬 실행 (도구 호출 시) ───────────────────────────────────────────────────
async def execute_skill(skill_id: str, arguments: dict) -> str:
    """모델이 스킬을 호출했을 때 실행하고 결과 반환"""
    with db_cursor() as cur:
        cur.execute("SELECT * FROM skills WHERE id=%s AND is_active=true", (skill_id,))
        skill = cur.fetchone()
    if not skill:
        return "스킬을 찾을 수 없습니다."

    skill = dict(skill)
    cfg   = skill.get("config") or {}

    if skill["skill_type"] == "prompt":
        # 프롬프트 스킬: config의 content를 반환
        return cfg.get("content", "스킬 내용이 없습니다.")

    elif skill["skill_type"] == "db_query":
        # DB 쿼리 스킬: SQL을 실행하고 결과 반환
        sql = cfg.get("sql", "")
        if not sql:
            return "SQL이 정의되지 않았습니다."
        # 파라미터를 SQL에 바인딩 (간단한 치환)
        for k, v in arguments.items():
            sql = sql.replace(f":{k}", str(v))
        try:
            with db_cursor() as cur:
                cur.execute(sql)
                rows = cur.fetchall()
            if not rows:
                return "조회 결과가 없습니다."
            # 결과를 텍스트로 변환
            cols = list(rows[0].keys())
            lines = [" | ".join(cols)]
            lines.append("-" * len(lines[0]))
            for row in rows[:20]:  # 최대 20행
                lines.append(" | ".join(str(row[c]) for c in cols))
            return "\n".join(lines)
        except Exception as e:
            return f"쿼리 실행 오류: {str(e)}"

    elif skill["skill_type"] == "http":
        # HTTP 스킬: 외부 API 호출
        url    = cfg.get("url", "")
        method = cfg.get("method", "GET").upper()
        headers = cfg.get("headers", {})
        if not url:
            return "URL이 정의되지 않았습니다."
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                if method == "GET":
                    resp = await client.get(url, params=arguments, headers=headers)
                else:
                    resp = await client.post(url, json=arguments, headers=headers)
            return resp.text[:2000]
        except Exception as e:
            return f"API 호출 오류: {str(e)}"

    elif skill["skill_type"] == "code":
        return execute_code_skill(str(skill["id"]), arguments)

    return "지원하지 않는 스킬 타입입니다."

# ── 활성 스킬을 vLLM tools 형식으로 변환 ──────────────────────────────────────
def get_active_tools() -> list:
    """활성화된 스킬을 OpenAI tool 형식으로 반환"""
    with db_cursor() as cur:
        cur.execute("SELECT * FROM skills WHERE is_active=true ORDER BY created_at")
        skills = [dict(r) for r in cur.fetchall()]

    tools = []
    for s in skills:
        cfg = s.get("config") or {}
        # DB 쿼리 스킬의 파라미터 추출
        params_schema = {"type": "object", "properties": {}, "required": []}
        if s["skill_type"] == "db_query" and cfg.get("params"):
            for p in cfg["params"]:
                params_schema["properties"][p["name"]] = {
                    "type": p.get("type", "string"),
                    "description": p.get("description", "")
                }
                if p.get("required", False):
                    params_schema["required"].append(p["name"])

        tools.append({
            "type": "function",
            "function": {
                "name": f"skill_{s['id'].replace('-', '_')}",
                "description": s["description"],
                "parameters": params_schema,
            },
            "_skill_id": str(s["id"]),   # 실행 시 사용 (비표준 필드)
        })
    return tools
