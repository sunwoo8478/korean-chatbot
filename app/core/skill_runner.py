"""
동적 스킬 실행 전용 진입점. 항상 별도 자식 프로세스로만 실행된다
(app/core/skill_sandbox.py의 run_sandboxed가 `python -I skill_runner.py`로 스폰함).
독립 실행 스크립트이므로 app 패키지를 import하지 않고 필요한 상수를 자체 보유한다.

stdin으로 {"code": str, "tool_name": str, "arguments": dict} JSON을 받아
stdout으로 {"ok": bool, "result"?: str, "error"?: str} JSON 한 줄을 출력한다.
"""
import json
import resource
import sys

# skill_sandbox.SAFE_MODULES와 동일하게 유지할 것
SAFE_MODULES = frozenset({
    "re", "math", "json", "datetime", "statistics", "random", "string",
    "itertools", "collections", "requests", "decimal", "textwrap", "unicodedata",
})

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
