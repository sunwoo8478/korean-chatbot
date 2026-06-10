from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json, requests
from ..core.database import db_cursor
from ..core.config import settings

def _embed(text: str) -> Optional[List[float]]:
    """bge-m3로 텍스트 임베딩 (실패 시 None)"""
    try:
        r = requests.post(
            settings.ollama_url,
            json={"model": settings.embed_model, "prompt": text[:2000]},
            timeout=30
        )
        return r.json()["embedding"]
    except Exception:
        return None

router = APIRouter()

class ConvCreate(BaseModel):
    title: str = "새 대화"
    model: str = "qwen"

class ConvUpdate(BaseModel):
    title: str

class MessageCreate(BaseModel):
    role: str
    model: Optional[str] = None
    content: str
    sources: Optional[list] = None

# ── 목록 ────────────────────────────────────────────────────────────────────
@router.get("/conversations")
def list_conversations():
    with db_cursor() as cur:
        cur.execute("""
            SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                   COUNT(m.id) AS message_count,
                   MAX(m.created_at) AS last_message_at
            FROM conversations c
            LEFT JOIN chat_messages m ON m.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT 100
        """)
        rows = cur.fetchall()
    return [dict(r) for r in rows]

# ── 생성 ────────────────────────────────────────────────────────────────────
@router.post("/conversations")
def create_conversation(data: ConvCreate):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO conversations (title, model) VALUES (%s, %s) RETURNING id, title, model, created_at",
            (data.title, data.model)
        )
        row = cur.fetchone()
    return dict(row)

# ── 단건 조회 (메시지 포함) ──────────────────────────────────────────────────
@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: str):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Not found")
        cur.execute(
            "SELECT * FROM chat_messages WHERE conversation_id = %s ORDER BY created_at",
            (conv_id,)
        )
        messages = cur.fetchall()
    return {**dict(conv), "messages": [dict(m) for m in messages]}

# ── 제목 수정 ────────────────────────────────────────────────────────────────
@router.patch("/conversations/{conv_id}")
def update_conversation(conv_id: str, data: ConvUpdate):
    with db_cursor() as cur:
        cur.execute(
            "UPDATE conversations SET title=%s, updated_at=NOW() WHERE id=%s RETURNING id, title",
            (data.title, conv_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
    return dict(row)

# ── 삭제 ────────────────────────────────────────────────────────────────────
@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM conversations WHERE id=%s RETURNING id", (conv_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": conv_id}

# ── 메시지 삭제 ──────────────────────────────────────────────────────────────
@router.delete("/messages/{message_id}")
def delete_message(message_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM chat_messages WHERE id=%s RETURNING id", (message_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": message_id}

# ── 메시지 수정 ──────────────────────────────────────────────────────────────
class MessageUpdate(BaseModel):
    content: str

@router.patch("/messages/{message_id}")
def update_message(message_id: str, data: MessageUpdate):
    with db_cursor() as cur:
        cur.execute(
            "UPDATE chat_messages SET content=%s WHERE id=%s RETURNING id, content",
            (data.content, message_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
    return dict(row)

# ── 메시지 저장 ──────────────────────────────────────────────────────────────
@router.post("/conversations/{conv_id}/messages")
def add_message(conv_id: str, data: MessageCreate):
    # 사용자 질문만 임베딩 (AI 답변은 임베딩 불필요)
    embedding = _embed(data.content) if data.role == 'user' else None
    vec_str = ("[" + ",".join(map(str, embedding)) + "]") if embedding else None

    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO chat_messages (conversation_id, role, model, content, sources, embedding)
               VALUES (%s, %s, %s, %s, %s, %s::vector) RETURNING id, created_at""",
            (conv_id, data.role, data.model, data.content,
             json.dumps(data.sources, ensure_ascii=False) if data.sources else None,
             vec_str)
        )
        row = cur.fetchone()
        if data.role == 'user':
            cur.execute("""
                UPDATE conversations
                SET updated_at = NOW(),
                    title = CASE WHEN title = '새 대화' THEN %s ELSE title END
                WHERE id = %s
            """, (data.content[:40], conv_id))
    return dict(row)
