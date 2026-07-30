from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json, requests
from ..core.database import db_cursor
from ..core.config import settings
from .auth import get_current_username

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
def list_conversations(username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT c.id, c.title, c.model, c.username, c.created_at, c.updated_at,
                   COUNT(m.id) AS message_count,
                   MAX(m.created_at) AS last_message_at
            FROM conversations c
            LEFT JOIN chat_messages m ON m.conversation_id = c.id
            WHERE c.username = %s
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT 100
        """, (username,))
        rows = cur.fetchall()
    return [dict(r) for r in rows]

def _check_owner(cur, conv_id: str, username: str):
    """conv_id가 실제로 이 유저 소유인지 확인 — 없으면 404, 다른 사람 소유면 403."""
    cur.execute("SELECT username FROM conversations WHERE id=%s", (conv_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    if row["username"] != username:
        raise HTTPException(403, "본인 대화가 아닙니다.")


# ── 생성 ────────────────────────────────────────────────────────────────────
@router.post("/conversations")
def create_conversation(data: ConvCreate, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO conversations (title, model, username) VALUES (%s, %s, %s) RETURNING id, title, model, username, created_at",
            (data.title, data.model, username)
        )
        row = cur.fetchone()
    return dict(row)

# ── 단건 조회 (메시지 포함) ──────────────────────────────────────────────────
@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: str, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        _check_owner(cur, conv_id, username)
        cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
        conv = cur.fetchone()
        cur.execute(
            "SELECT * FROM chat_messages WHERE conversation_id = %s ORDER BY created_at",
            (conv_id,)
        )
        messages = cur.fetchall()
    return {**dict(conv), "messages": [dict(m) for m in messages]}

# ── 제목 수정 ────────────────────────────────────────────────────────────────
@router.patch("/conversations/{conv_id}")
def update_conversation(conv_id: str, data: ConvUpdate, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        _check_owner(cur, conv_id, username)
        cur.execute(
            "UPDATE conversations SET title=%s, updated_at=NOW() WHERE id=%s RETURNING id, title",
            (data.title, conv_id)
        )
        row = cur.fetchone()
    return dict(row)

# ── 삭제 ────────────────────────────────────────────────────────────────────
@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        _check_owner(cur, conv_id, username)
        cur.execute("DELETE FROM conversations WHERE id=%s RETURNING id", (conv_id,))
    return {"deleted": conv_id}

# ── 메시지 삭제 ──────────────────────────────────────────────────────────────
@router.delete("/messages/{message_id}")
def delete_message(message_id: str, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT c.username FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id=%s
        """, (message_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        if row["username"] != username:
            raise HTTPException(403, "본인 대화가 아닙니다.")
        cur.execute("DELETE FROM chat_messages WHERE id=%s RETURNING id", (message_id,))
    return {"deleted": message_id}

# ── 메시지 수정 ──────────────────────────────────────────────────────────────
class MessageUpdate(BaseModel):
    content: str

@router.patch("/messages/{message_id}")
def update_message(message_id: str, data: MessageUpdate, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT c.username FROM chat_messages m JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id=%s
        """, (message_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        if row["username"] != username:
            raise HTTPException(403, "본인 대화가 아닙니다.")
        cur.execute(
            "UPDATE chat_messages SET content=%s WHERE id=%s RETURNING id, content",
            (data.content, message_id)
        )
        row = cur.fetchone()
    return dict(row)

# ── 메시지 저장 ──────────────────────────────────────────────────────────────
@router.post("/conversations/{conv_id}/messages")
def add_message(conv_id: str, data: MessageCreate, username: str = Depends(get_current_username)):
    with db_cursor() as cur:
        _check_owner(cur, conv_id, username)

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
