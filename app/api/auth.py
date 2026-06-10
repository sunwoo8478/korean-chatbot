import hashlib, secrets, hmac
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.database import db_cursor

router = APIRouter()

def _hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    h = hmac.new(salt.encode(), password.encode(), hashlib.sha256).hexdigest()
    return h, salt

def _verify_password(password: str, stored_hash: str) -> bool:
    # stored_hash 형식: salt$hash
    if '$' not in stored_hash:
        return False
    salt, expected = stored_hash.split('$', 1)
    actual, _ = _hash_password(password, salt)
    return hmac.compare_digest(actual, expected)

def _make_hash(password: str) -> str:
    h, salt = _hash_password(password)
    return f"{salt}${h}"

def _generate_token() -> str:
    return secrets.token_urlsafe(32)


class RegisterBody(BaseModel):
    username: str
    display_name: str
    password: str

class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/auth/register")
def register(data: RegisterBody):
    if len(data.username) < 2:
        raise HTTPException(400, "아이디는 2자 이상이어야 합니다.")
    if len(data.password) < 4:
        raise HTTPException(400, "비밀번호는 4자 이상이어야 합니다.")

    with db_cursor() as cur:
        cur.execute("SELECT id FROM users WHERE username=%s", (data.username,))
        if cur.fetchone():
            raise HTTPException(409, "이미 사용 중인 아이디입니다.")

        password_hash = _make_hash(data.password)
        cur.execute("""
            INSERT INTO users (username, display_name, password_hash)
            VALUES (%s, %s, %s) RETURNING id
        """, (data.username, data.display_name, password_hash))
        user_id = str(cur.fetchone()["id"])

        token = _generate_token()
        cur.execute("""
            INSERT INTO user_sessions (token, user_id, username, display_name)
            VALUES (%s, %s, %s, %s)
        """, (token, user_id, data.username, data.display_name))

    return {"token": token, "username": data.username, "display_name": data.display_name}


@router.post("/auth/login")
def login(data: LoginBody):
    with db_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE username=%s", (data.username,))
        user = cur.fetchone()

    if not user:
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")

    user = dict(user)
    if not _verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")

    token = _generate_token()
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO user_sessions (token, user_id, username, display_name)
            VALUES (%s, %s, %s, %s)
        """, (token, str(user["id"]), user["username"], user["display_name"]))
        cur.execute("UPDATE users SET last_login=NOW() WHERE id=%s", (str(user["id"]),))

    return {"token": token, "username": user["username"], "display_name": user["display_name"]}


@router.get("/auth/me")
def get_me(token: str):
    with db_cursor() as cur:
        cur.execute("""
            SELECT username, display_name FROM user_sessions
            WHERE token=%s AND expires_at > NOW()
        """, (token,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(401, "세션이 만료됐습니다. 다시 로그인하세요.")
    return dict(row)


@router.post("/auth/logout")
def logout(body: dict):
    token = body.get("token", "")
    if token:
        with db_cursor() as cur:
            cur.execute("DELETE FROM user_sessions WHERE token=%s", (token,))
    return {"ok": True}


@router.get("/auth/users")
def list_users():
    with db_cursor() as cur:
        cur.execute("""
            SELECT id, username, display_name, is_admin, created_at, last_login
            FROM users ORDER BY created_at
        """)
        return [dict(r) for r in cur.fetchall()]


@router.patch("/auth/users/{user_id}/password")
def change_password(user_id: str, body: dict):
    new_password = body.get("password", "")
    if len(new_password) < 4:
        raise HTTPException(400, "비밀번호는 4자 이상이어야 합니다.")
    with db_cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash=%s WHERE id=%s",
            (_make_hash(new_password), user_id)
        )
    return {"ok": True}


@router.delete("/auth/users/{user_id}")
def delete_user(user_id: str):
    with db_cursor() as cur:
        cur.execute("DELETE FROM users WHERE id=%s", (user_id,))
    return {"ok": True}
