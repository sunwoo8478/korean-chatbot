from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import json
from ..core.database import db_cursor

router = APIRouter()

class BookmarkBody(BaseModel):
    record_id: int
    table_name: str   # std_term | std_word | std_domain
    name: str
    type: str
    data: Optional[dict] = None

@router.get("/bookmarks")
def list_bookmarks():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM term_bookmarks ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]

@router.post("/bookmarks")
def add_bookmark(data: BookmarkBody):
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO term_bookmarks (record_id, table_name, name, type, data)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (record_id, table_name) DO NOTHING
            RETURNING id
        """, (data.record_id, data.table_name, data.name, data.type,
              json.dumps(data.data, ensure_ascii=False) if data.data else None))
        row = cur.fetchone()
    return {"id": str(row["id"]) if row else None, "already_exists": row is None}

@router.delete("/bookmarks/{bookmark_id}")
def remove_bookmark(bookmark_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM term_bookmarks WHERE id=%s", (bookmark_id,))
    return {"ok": True}

@router.delete("/bookmarks/by-record/{table_name}/{record_id}")
def remove_by_record(table_name: str, record_id: int):
    with db_cursor() as cur:
        cur.execute("DELETE FROM term_bookmarks WHERE table_name=%s AND record_id=%s", (table_name, record_id))
    return {"ok": True}
