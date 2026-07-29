"""
AI 스킬 자동 생성 엔진
1. Builder LLM  : 자연어 → JSON (tool_name, description, code)
2. Validator    : AST 기반 화이트리스트 검증 (import/속성 접근 제한)
3. Sandbox      : 격리된 자식 프로세스에서 실행 (app/core/skill_sandbox.py)
4. Registry     : 검증된 (tool_name, code)를 메모리에 보관, 실행 시 샌드박스 호출
"""
import ast, json, re
from pathlib import Path
from typing import Optional
import requests
from ..core.config import settings
from .skill_sandbox import SAFE_MODULES, run_sandboxed

TOOLS_DIR = Path(__file__).parent.parent / "dynamic_tools"
TOOLS_DIR.mkdir(exist_ok=True)
(TOOLS_DIR / "__init__.py").touch(exist_ok=True)

# ── 런타임 레지스트리 ─────────────────────────────────────────────────────────
# skill_id → {"tool_name": str, "code": str}
# 코드를 직접 실행 가능한 객체로 들고 있지 않는다 — 실행은 항상 샌드박스 프로세스에서 일어난다.
_registry: dict[str, dict] = {}


def get_registered(skill_id: str) -> Optional[dict]:
    return _registry.get(skill_id)


def list_registered() -> list[str]:
    return list(_registry.keys())


# ── 1. Builder LLM ────────────────────────────────────────────────────────────
_BUILDER_PROMPT = """\
너는 Python 도구 코드 생성 전문가야.
사용자의 자연어 요청을 받아 아래 JSON만 출력해. 다른 텍스트는 절대 출력하지 마.

출력 형식 (JSON만):
{{
  "tool_name": "snake_case 함수명",
  "description": "이 도구가 하는 일 한 줄 설명",
  "parameters": {{
    "param1": {{"type": "string", "description": "설명"}},
    "param2": {{"type": "number", "description": "설명"}}
  }},
  "code": "def tool_name(param1: str, param2: float) -> str:\\n    # 구현\\n    return result"
}}

[규칙]
- 함수는 반드시 문자열(str)을 반환해야 해
- import는 함수 내부에서만 사용해
- import 가능한 모듈은 다음으로 한정돼: {safe_modules}
- 위 목록에 없는 모듈(os, sys, subprocess, socket 등)은 샌드박스가 강제로 차단해
- DB, 파일시스템 접근은 불가능하고, 네트워크는 requests 라이브러리로만 가능해
- print()는 사용하지 마 — 반드시 return으로만 결과를 돌려줘
- 코드는 완전히 동작 가능한 단일 함수여야 해 (클래스 정의 금지)

사용자 요청: {request}
"""


def build_skill_with_llm(user_request: str) -> dict:
    """LLM을 사용해 자연어 요청을 스킬 JSON으로 변환"""
    prompt = _BUILDER_PROMPT.format(
        request=user_request, safe_modules=", ".join(sorted(SAFE_MODULES))
    )

    # vLLM (35B) 사용
    resp = requests.post(
        f"{settings.vllm_url}/chat/completions",
        json={
            "model": settings.vllm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 2048,
        },
        timeout=60,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"].strip()

    # JSON 추출 (마크다운 코드블록 제거)
    json_match = re.search(r"\{[\s\S]+\}", content)
    if not json_match:
        raise ValueError(f"LLM이 올바른 JSON을 반환하지 않았습니다:\n{content[:300]}")

    return json.loads(json_match.group())


# ── 2. 코드 검증 (AST 화이트리스트) ────────────────────────────────────────────
# 이전에는 "os.system" 같은 문자열이 코드에 있는지만 봤다 — "import os; os.popen(...)"
# 처럼 문자열이 일치하지 않는 우회는 그대로 통과했다. 여기서는 AST를 실제로 순회하며
# import 대상 모듈, 위험한 이름(eval/exec/open 등), dunder 속성 접근, class 정의를
# 구조적으로 차단한다. 다만 이 정적 검사는 방어의 첫 겹일 뿐이고, 실질적인 보안 경계는
# skill_sandbox.run_sandboxed의 프로세스 격리(환경변수 미상속·자원 제한·import 재검증)다.
_DENIED_NAMES = {
    "eval", "exec", "compile", "open", "__import__", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "breakpoint", "exit", "quit",
    "input", "memoryview",
}


def validate_code(code: str, tool_name: str) -> str:
    """AST 파싱 + 화이트리스트 검증. 정제된 코드 반환"""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"문법 오류: {e}")

    func_names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            func_names.append(node.name)

        elif isinstance(node, ast.ClassDef):
            raise ValueError("보안상 class 정의는 허용되지 않습니다.")

        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top not in SAFE_MODULES:
                    raise ValueError(f"허용되지 않는 모듈 import: '{alias.name}'")

        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") and node.attr.endswith("__"):
                raise ValueError(f"보안상 허용되지 않는 속성 접근: '{node.attr}'")

        elif isinstance(node, ast.Name):
            if node.id in _DENIED_NAMES:
                raise ValueError(f"보안상 허용되지 않는 이름 사용: '{node.id}'")

    if tool_name not in func_names:
        raise ValueError(f"함수 '{tool_name}'이 코드에 없습니다. 정의된 함수: {func_names}")

    return code


# ── 3. 저장(등록) ─────────────────────────────────────────────────────────────
def load_skill(skill_id: str, tool_name: str, code: str) -> None:
    """코드를 파일로 저장하고 레지스트리에 등록 (실행 가능한 객체로 로드하지 않음)"""
    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", skill_id)
    file_path = TOOLS_DIR / f"skill_{safe_name}.py"
    file_path.write_text(code, encoding="utf-8")

    _registry[skill_id] = {"tool_name": tool_name, "code": code}


def unload_skill(skill_id: str):
    """레지스트리에서 제거"""
    _registry.pop(skill_id, None)


# ── 4. 서버 시작 시 기존 코드 스킬 복원 ────────────────────────────────────────
def restore_code_skills():
    """DB에 저장된 code 타입 스킬을 서버 재시작 후 메모리에 재등록"""
    try:
        from ..core.database import db_cursor
        with db_cursor() as cur:
            cur.execute("""
                SELECT id, name, generated_code
                FROM skills
                WHERE skill_type = 'code' AND is_active = true
                  AND generated_code IS NOT NULL
            """)
            rows = cur.fetchall()

        for row in rows:
            try:
                load_skill(str(row["id"]), row["name"], row["generated_code"])
            except Exception as e:
                print(f"[SkillBuilder] 스킬 복원 실패 ({row['name']}): {e}")

        if rows:
            print(f"[SkillBuilder] {len(rows)}개 코드 스킬 복원 완료")
    except Exception as e:
        print(f"[SkillBuilder] 복원 중 오류: {e}")


# ── 5. 코드 스킬 실행 (샌드박스 프로세스에서) ──────────────────────────────────
async def execute_code_skill(skill_id: str, arguments: dict) -> str:
    entry = get_registered(skill_id)
    if entry is None:
        return f"스킬이 메모리에 로드되지 않았습니다. (id={skill_id})"
    return await run_sandboxed(entry["code"], entry["tool_name"], arguments)
