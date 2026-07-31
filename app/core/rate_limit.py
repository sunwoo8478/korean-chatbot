"""IP 기준 in-memory 레이트 리미터 — LLM 호출 엔드포인트의 무제한 과금을 방지.
단일 uvicorn 프로세스(워커 1개) 전제 — 여러 워커/인스턴스로 확장 시 공유 저장소(Redis 등) 필요.
"""
import time
from collections import defaultdict
from fastapi import HTTPException, Request

_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limiter(max_requests: int, window_seconds: int = 60):
    """max_requests회 / window_seconds초 를 초과하면 429를 던지는 FastAPI 의존성 팩토리"""

    async def _check(request: Request):
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        cutoff = now - window_seconds
        window = _buckets[key]
        while window and window[0] < cutoff:
            window.pop(0)
        if len(window) >= max_requests:
            raise HTTPException(429, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
        window.append(now)

    return _check
