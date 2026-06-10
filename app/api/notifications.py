from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..core.database import db_cursor

router = APIRouter()

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"   # info | warning | success | error

@router.get("/notifications")
def list_notifications():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50")
        return [dict(r) for r in cur.fetchall()]

@router.get("/notifications/unread-count")
def unread_count():
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS count FROM notifications WHERE is_read = false")
        return dict(cur.fetchone())

@router.post("/notifications")
def create_notification(data: NotificationCreate):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO notifications (title, message, type) VALUES (%s, %s, %s) RETURNING *",
            (data.title, data.message, data.type)
        )
        return dict(cur.fetchone())

@router.patch("/notifications/{notif_id}/read")
def mark_read(notif_id: str):
    with db_cursor() as cur:
        cur.execute("UPDATE notifications SET is_read=true WHERE id=%s RETURNING id", (notif_id,))
    return {"ok": True}

@router.patch("/notifications/read-all")
def mark_all_read():
    with db_cursor() as cur:
        cur.execute("UPDATE notifications SET is_read=true WHERE is_read=false")
    return {"ok": True}

@router.delete("/notifications/{notif_id}")
def delete_notification(notif_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM notifications WHERE id=%s", (notif_id,))
    return {"ok": True}
