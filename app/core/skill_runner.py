"""
동적 스킬 실행 전용 진입점. 항상 별도 자식 프로세스로만 실행된다
(app/core/skill_sandbox.py의 run_sandboxed가 `python -I skill_runner.py`로 스폰함).
독립 실행 스크립트이므로 app 패키지를 import하지 않고 필요한 상수를 자체 보유한다.

stdin으로 {"code": str, "tool_name": str, "arguments": dict} JSON을 받아
stdout으로 {"ok": bool, "result"?: str, "error"?: str} JSON 한 줄을 출력한다.
"""
import ipaddress
import json
import resource
import socket
import sys
import urllib.parse
import requests as _requests

# skill_sandbox.SAFE_MODULES와 동일하게 유지할 것
SAFE_MODULES = frozenset({
    "re", "math", "json", "datetime", "statistics", "random", "string",
    "itertools", "collections", "requests", "decimal", "textwrap", "unicodedata",
})

# SSRF 방지: 스킬 코드에는 requests 원본이 아니라 이 래퍼를 내준다.
# 사설/루프백/링크로컬(클라우드 메타데이터 포함) 목적지로의 요청을 호스트 resolve 후 차단한다.
_MAX_REDIRECTS = 5

# host.docker.internal은 Docker Desktop이 내부적으로 사설 대역 주소(예: 192.168.65.254)로
# resolve하는 고정 호스트명이라, 실제 위협 모델(임의 사설 IP 스캔·클라우드 메타데이터 탈취)과
# 무관하다 — 이 컨테이너가 자신의 Ollama에 접근하는 유일한 의도된 경로라 명시적으로만 허용한다.
_ALLOWED_HOSTS = frozenset({"host.docker.internal"})


def _is_blocked_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return (
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_reserved or addr.is_multicast or addr.is_unspecified
    )


def _check_host(host: str):
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise _requests.exceptions.ConnectionError(f"호스트를 확인할 수 없습니다: {host}") from e
    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            raise _requests.exceptions.ConnectionError(
                f"사설/예약 대역 접근이 차단되었습니다: {host} -> {ip}"
            )


def _check_url(url: str):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("http", "https"):
        raise _requests.exceptions.ConnectionError(f"허용되지 않는 스킴입니다: {parsed.scheme}")
    if not parsed.hostname:
        raise _requests.exceptions.ConnectionError("URL에 호스트가 없습니다.")
    if parsed.hostname.lower() in _ALLOWED_HOSTS:
        return
    _check_host(parsed.hostname)


def _guarded_request(method: str, url: str, **kwargs):
    kwargs.pop("allow_redirects", None)
    _check_url(url)
    resp = _requests.request(method, url, allow_redirects=False, **kwargs)
    for _ in range(_MAX_REDIRECTS):
        if not resp.is_redirect:
            break
        next_url = urllib.parse.urljoin(resp.url, resp.headers.get("Location", ""))
        _check_url(next_url)
        resp = _requests.request(method, next_url, allow_redirects=False, **kwargs)
    return resp


class _GuardedRequests:
    """스킬 코드에 노출되는 requests 대체 모듈. 목적지 재검증 외 동작은 동일하다."""
    exceptions = _requests.exceptions
    Response = _requests.Response

    @staticmethod
    def request(method, url, **kwargs):
        return _guarded_request(method, url, **kwargs)

    @staticmethod
    def get(url, **kwargs):
        return _guarded_request("GET", url, **kwargs)

    @staticmethod
    def post(url, **kwargs):
        return _guarded_request("POST", url, **kwargs)

    @staticmethod
    def put(url, **kwargs):
        return _guarded_request("PUT", url, **kwargs)

    @staticmethod
    def patch(url, **kwargs):
        return _guarded_request("PATCH", url, **kwargs)

    @staticmethod
    def delete(url, **kwargs):
        return _guarded_request("DELETE", url, **kwargs)

    @staticmethod
    def head(url, **kwargs):
        return _guarded_request("HEAD", url, **kwargs)


_guarded_requests = _GuardedRequests()

_SAFE_BUILTIN_NAMES = (
    "abs", "all", "any", "bool", "dict", "enumerate", "filter", "float", "int",
    "isinstance", "len", "list", "map", "max", "min", "range", "repr", "reversed",
    "round", "set", "frozenset", "sorted", "str", "sum", "tuple", "zip", "type",
    "Exception", "ValueError", "TypeError", "KeyError", "IndexError",
    "AttributeError", "ZeroDivisionError", "StopIteration", "RuntimeError",
    "None", "True", "False",
)


def _install_resource_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:
        pass


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    top = name.split(".")[0]
    if top not in SAFE_MODULES:
        raise ImportError(f"모듈 '{name}'은 샌드박스에서 허용되지 않습니다.")
    if top == "requests":
        return _guarded_requests
    return __import__(name, globals, locals, fromlist, level)


def _build_safe_globals():
    builtins_ns = {n: __builtins__.__dict__[n] if isinstance(__builtins__, type(sys))
                   else __builtins__[n]
                   for n in _SAFE_BUILTIN_NAMES}
    builtins_ns["__import__"] = _safe_import
    return {"__builtins__": builtins_ns}


def main():
    _install_resource_limits()

    try:
        payload = json.loads(sys.stdin.read())
        code = payload["code"]
        tool_name = payload["tool_name"]
        arguments = payload.get("arguments") or {}
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"입력 파싱 오류: {e}"}))
        return

    g = _build_safe_globals()
    try:
        exec(compile(code, "<dynamic-skill>", "exec"), g)
        func = g.get(tool_name)
        if func is None or not callable(func):
            raise ValueError(f"함수 '{tool_name}'을 찾을 수 없습니다.")
        result = func(**arguments)
        print(json.dumps({"ok": True, "result": str(result)}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
