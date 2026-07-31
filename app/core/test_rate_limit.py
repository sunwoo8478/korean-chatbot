"""rate_limiter()의 최소 회귀 테스트 — pytest 없이 plain assert + asyncio.run만 사용.
DB/네트워크 필요 없음. `python3 -m app.core.test_rate_limit`로 바로 실행 가능.
"""
import asyncio
import time
from fastapi import HTTPException
from .rate_limit import rate_limiter, _buckets


class _FakeClient:
    def __init__(self, host):
        self.host = host


class _FakeRequest:
    def __init__(self, host):
        self.client = _FakeClient(host)


def test_allows_up_to_max_then_blocks():
    _buckets.clear()
    check = rate_limiter(max_requests=3, window_seconds=60)
    req = _FakeRequest("1.1.1.1")
    for _ in range(3):
        asyncio.run(check(req))  # 3회까지는 통과
    try:
        asyncio.run(check(req))  # 4번째는 차단
        assert False, "4번째 요청이 차단되지 않음"
    except HTTPException as e:
        assert e.status_code == 429


def test_separate_ips_tracked_independently():
    _buckets.clear()
    check = rate_limiter(max_requests=1, window_seconds=60)
    asyncio.run(check(_FakeRequest("2.2.2.2")))  # 이 IP는 한도 소진
    asyncio.run(check(_FakeRequest("3.3.3.3")))  # 다른 IP는 영향 없음 — 에러 없이 통과해야 함


def test_window_expiry_resets_limit():
    _buckets.clear()
    check = rate_limiter(max_requests=1, window_seconds=0.1)
    req = _FakeRequest("4.4.4.4")
    asyncio.run(check(req))
    time.sleep(0.15)  # 윈도우 만료 대기
    asyncio.run(check(req))  # 윈도우가 지났으니 다시 허용돼야 함


if __name__ == "__main__":
    test_allows_up_to_max_then_blocks()
    test_separate_ips_tracked_independently()
    test_window_expiry_resets_limit()
    print("all tests passed")
