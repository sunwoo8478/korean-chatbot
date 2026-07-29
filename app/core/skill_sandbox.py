"""
동적 스킬 코드의 실제 실행 격리 계층.

이전에는 LLM이 생성한 코드를 문자열 금지목록만 통과하면 FastAPI 프로세스 안에서
importlib로 그대로 실행했다 (예: "os.system"은 막지만 "import os; os.popen(...)"는
그대로 통과함). 여기서는 실행 자체를 별도 프로세스로 분리해 진짜 격리 경계를 둔다:
- 자식 프로세스는 부모의 환경변수(DB 비밀번호, API 키 등)를 물려받지 않는다
- CPU/메모리/파일쓰기 자원 제한(resource.setrlimit)을 건다
- 벽시계 타임아웃으로 무한루프/행을 강제 종료한다
- import 가능한 모듈을 화이트리스트로 제한한다 (skill_runner.py 안에서 적용)
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# 동적 스킬 코드가 import할 수 있는 모듈 화이트리스트.
# 여기 없는 모듈(os, subprocess, socket, ctypes, importlib, pickle 등)은
# skill_runner.py의 _safe_import가 거부한다.
SAFE_MODULES = frozenset({
    "re", "math", "json", "datetime", "statistics", "random", "string",
    "itertools", "collections", "requests", "decimal", "textwrap", "unicodedata",
})

_RUNNER = Path(__file__).parent / "skill_runner.py"
_TIMEOUT_SECONDS = 15


async def run_sandboxed(code: str, tool_name: str, arguments: dict) -> str:
    """검증된 코드를 격리된 자식 프로세스에서 실행하고 결과 문자열을 반환한다."""
    payload = json.dumps(
        {"code": code, "tool_name": tool_name, "arguments": arguments},
        ensure_ascii=False,
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-I", str(_RUNNER),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")},
        )
    except Exception as e:
        return f"샌드박스 실행 준비 오류: {type(e).__name__}: {e}"

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(payload.encode("utf-8")), timeout=_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return "실행 시간 초과 (샌드박스 타임아웃)"

    if not stdout:
        return f"샌드박스 프로세스 오류: {stderr.decode('utf-8', 'replace')[:500]}"

    try:
        result = json.loads(stdout.decode("utf-8"))
    except json.JSONDecodeError:
        return f"샌드박스 출력 파싱 실패: {stdout.decode('utf-8', 'replace')[:500]}"

    if result.get("ok"):
        return result.get("result", "")
    return f"실행 오류: {result.get('error')}"
