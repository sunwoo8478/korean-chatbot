"""
AI 스킬 자동 생성 엔진
1. Builder LLM  : 자연어 → JSON (tool_name, description, code)
2. Dynamic Loader: 코드 검증 → 파일 저장 → importlib 동적 로드
3. Tool Registry : 로드된 함수를 메모리에 보관, 실행 시 호출
"""
import ast, importlib, importlib.util, os, re, sys, json, textwrap
from pathlib import Path
from typing import Optional, Callable
import requests
from ..core.config import settings

TOOLS_DIR = Path(__file__).parent.parent / "dynamic_tools"
TOOLS_DIR.mkdir(exist_ok=True)
(TOOLS_DIR / "__init__.py").touch(exist_ok=True)

# ── 런타임 레지스트리 ─────────────────────────────────────────────────────────
_registry: dict[str, Callable] = {}   # skill_id → callable


def get_registered(skill_id: str) -> Optional[Callable]:
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
- DB, 파일시스템, 네트워크 접근은 requests 라이브러리만 허용
- 외부 라이브러리가 필요하면 함수 안에서 import해
- 코드는 완전히 동작 가능한 단일 함수여야 해

사용자 요청: {request}
"""


def build_skill_with_llm(user_request: str) -> dict:
    """LLM을 사용해 자연어 요청을 스킬 JSON으로 변환"""
    prompt = _BUILDER_PROMPT.format(request=user_request)

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


# ── 2. 코드 검증 ──────────────────────────────────────────────────────────────
_BLOCKED = ["subprocess", "os.system", "eval(", "exec(", "open(", "__import__",
            "shutil", "socket", "pickle", "__builtins__"]


def validate_code(code: str, tool_name: str) -> str:
    """AST 파싱 + 금지 패턴 검사. 정제된 코드 반환"""
    try:
        ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"문법 오류: {e}")

    for blocked in _BLOCKED:
        if blocked in code:
            raise ValueError(f"보안상 허용되지 않는 코드 패턴: '{blocked}'")

    # 함수 정의가 있는지 확인
    tree = ast.parse(code)
    func_names = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    if tool_name not in func_names:
        raise ValueError(f"함수 '{tool_name}'이 코드에 없습니다. 정의된 함수: {func_names}")

    return code


# ── 3. Dynamic Loader ─────────────────────────────────────────────────────────
def load_skill(skill_id: str, tool_name: str, code: str) -> Callable:
    """코드를 파일로 저장하고 importlib으로 동적 로드해 함수 반환"""
    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", skill_id)
    file_path = TOOLS_DIR / f"skill_{safe_name}.py"

    file_path.write_text(code, encoding="utf-8")

    module_name = f"app.dynamic_tools.skill_{safe_name}"

    # 이미 로드된 모듈이면 reload
    if module_name in sys.modules:
        module = importlib.reload(sys.modules[module_name])
    else:
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

    func = getattr(module, tool_name, None)
    if func is None or not callable(func):
        raise ValueError(f"모듈에서 함수 '{tool_name}'을 찾을 수 없습니다.")

    _registry[skill_id] = func
    return func


def unload_skill(skill_id: str):
    """레지스트리에서 제거"""
    _registry.pop(skill_id, None)
    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", skill_id)
    module_name = f"app.dynamic_tools.skill_{safe_name}"
    sys.modules.pop(module_name, None)


# ── 4. 서버 시작 시 기존 코드 스킬 복원 ────────────────────────────────────────
def restore_code_skills():
    """DB에 저장된 code 타입 스킬을 서버 재시작 후 메모리에 재로드"""
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


# ── 5. 코드 스킬 실행 ─────────────────────────────────────────────────────────
def execute_code_skill(skill_id: str, arguments: dict) -> str:
    func = get_registered(skill_id)
    if func is None:
        return f"스킬이 메모리에 로드되지 않았습니다. (id={skill_id})"
    try:
        result = func(**arguments)
        return str(result)
    except TypeError as e:
        return f"인자 오류: {e}"
    except Exception as e:
        return f"실행 오류: {type(e).__name__}: {e}"
