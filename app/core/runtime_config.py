"""
DB admin_config 테이블에서 런타임 설정을 읽어 캐시.
30초 TTL — 설정 변경 후 최대 30초 내 반영.
"""
import time
from typing import Any
from .database import db_cursor
from .config import settings

_cache: dict[str, str] = {}
_cache_ts: float = 0
_TTL = 30


def _load():
    global _cache, _cache_ts
    try:
        with db_cursor() as cur:
            cur.execute("SELECT key, value FROM admin_config")
            _cache = {r["key"]: r["value"] for r in cur.fetchall()}
        _cache_ts = time.time()
    except Exception:
        pass


def _get(key: str, default: Any) -> Any:
    if time.time() - _cache_ts > _TTL:
        _load()
    return _cache.get(key, None)


def get_temperature() -> float:
    v = _get("temperature", None)
    return float(v) if v else settings.vllm_temperature


def get_max_tokens() -> int:
    v = _get("max_tokens", None)
    return int(v) if v else settings.vllm_max_tokens


def get_system_prompt_override() -> str:
    """빈 문자열이면 기본 프롬프트 사용"""
    return _get("system_prompt", "") or ""


def get_similarity_threshold() -> float:
    v = _get("similarity_threshold", None)
    return float(v) if v else 0.65


def get_top_k() -> int:
    v = _get("top_k", None)
    return int(v) if v else 10


def set_config(key: str, value: str):
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO admin_config (key, value, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value=%s, updated_at=NOW()
        """, (key, value, value))
    _load()


def get_all() -> dict:
    _load()
    return dict(_cache)
