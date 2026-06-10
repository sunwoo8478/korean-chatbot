"""
대화 컨텍스트 관리
① 대화 압축  — N턴 초과 시 오래된 히스토리를 LLM으로 요약
② 쿼리 재작성 — 지시어/생략어를 완전한 검색 질문으로 변환
③ RAG 앵커링  — 검색 결과 밖 내용 금지를 user_message 구조에 강제
"""
import re
import requests
from typing import Optional
from ..core.config import settings

COMPRESS_AFTER = 6   # 이 턴 수를 초과하면 오래된 히스토리를 압축


# ── ① 대화 압축 ───────────────────────────────────────────────────────────────
def compress_history(history: list[dict]) -> list[dict]:
    """
    history가 COMPRESS_AFTER 초과 시:
    오래된 부분을 LLM 요약 → {'role':'system', 'content':'[이전 대화 요약] ...'} 1개로 압축
    최근 COMPRESS_AFTER 턴은 그대로 유지
    """
    if len(history) <= COMPRESS_AFTER:
        return history

    old   = history[:-COMPRESS_AFTER]
    recent = history[-COMPRESS_AFTER:]

    dialogue = "\n".join(
        f"{'사용자' if h['role']=='user' else 'AI'}: {h['content'][:300]}"
        for h in old
    )
    prompt = (
        "아래 대화를 3문장 이내로 핵심만 요약해. "
        "어떤 용어/컬럼/도메인을 물어봤고 어떤 답이 나왔는지 중심으로 요약해. "
        "요약문만 출력해, 다른 말은 하지 마.\n\n"
        f"대화:\n{dialogue}"
    )

    try:
        resp = requests.post(
            f"{settings.vllm_url}/chat/completions",
            json={
                "model": settings.vllm_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 256,
                "chat_template_kwargs": {"enable_thinking": False},
            },
            timeout=30,
        )
        summary = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        # 요약 실패 시 첫 턴 질문만 가져오기 (fallback)
        summary = old[0]["content"][:200] if old else ""

    compressed = {"role": "system", "content": f"[이전 대화 요약] {summary}"}
    return [compressed] + recent


# ── ② 쿼리 재작성 ─────────────────────────────────────────────────────────────
# 재작성이 필요한 패턴 (지시어, 생략어, 짧은 이어지는 질문)
_REWRITE_TRIGGERS = re.compile(
    r"(그거|그것|거기|그 컬럼|그 용어|그 단어|그 도메인|아까|방금|위에서|앞에서|"
    r"이거|이것|이 컬럼|이 용어|저거|저것|그러면|그렇다면|그럼|"
    r"그 경우|해당|동일한|같은 것|같은거|마찬가지|비슷한|"
    r"소수점|저장형식|표현형식|데이터타입|길이는|타입은|형식은|약어는|"
    r"컬럼명은|영문명은|도메인은|설명은|뜻은|정의는|예시는|차이는|"
    r"그럼 어떻게|그럼 뭐|그거 어떻게|그건 뭐|그건 어떻게)"
)

def rewrite_query(query: str, history: list[dict]) -> str:
    """
    히스토리 맥락을 보고 현재 질문을 완전한 독립 질문으로 재작성.
    - 지시어/생략어 포함 시 재작성
    - 15자 이하 짧은 질문 + 히스토리 있으면 무조건 재작성 (맥락 의존 가능성 높음)
    """
    if not history:
        return query

    is_short = len(query.strip()) <= 15
    has_trigger = _REWRITE_TRIGGERS.search(query)

    if not is_short and not has_trigger:
        return query

    # 최근 4턴만 사용 (너무 많으면 오히려 노이즈)
    recent = history[-4:]
    dialogue = "\n".join(
        f"{'사용자' if h['role']=='user' else 'AI'}: {h['content'][:400]}"
        for h in recent
    )

    prompt = (
        "아래 대화 맥락을 보고, 마지막 질문을 히스토리 없이도 의미가 완전히 통하는 "
        "독립적인 한국어 질문으로 재작성해. "
        "지시어(그거, 이거, 아까 등)를 구체적인 용어/컬럼명으로 바꿔. "
        "재작성된 질문만 출력해, 설명 없이.\n\n"
        f"대화 맥락:\n{dialogue}\n\n"
        f"재작성할 질문: {query}"
    )

    try:
        resp = requests.post(
            f"{settings.vllm_url}/chat/completions",
            json={
                "model": settings.vllm_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 128,
                "chat_template_kwargs": {"enable_thinking": False},
            },
            timeout=20,
        )
        rewritten = resp.json()["choices"][0]["message"]["content"].strip()
        # 따옴표 제거
        rewritten = rewritten.strip('"\'')
        return rewritten if rewritten else query
    except Exception:
        return query


# ── ③ RAG 앵커링 강화 ────────────────────────────────────────────────────────
_ANCHOR_PREFIX = """\
[참고 데이터]
아래 두 가지를 모두 활용해서 답변하세요:
① 이전 대화에서 이미 나온 내용 → 그대로 인용
② 검색된 DB 데이터 → 정확히 인용
추측, 추론, 일반 지식 보완은 절대 금지합니다.
둘 다 없는 경우에만 "해당 정보가 데이터에 없습니다"라고 답하세요.

"""

_ANCHOR_SUFFIX = """\


질문: {query}"""


def anchor_user_message(user_message: str, query: str, recent_history: list[dict] = None) -> str:
    if "질문:" in user_message:
        ctx_part = user_message.rsplit("질문:", 1)[0].strip()
    else:
        ctx_part = user_message

    # 직전 대화 내용을 컨텍스트 블록에 명시적으로 포함
    history_block = ""
    if recent_history:
        pairs = []
        for i in range(0, len(recent_history) - 1, 2):
            if i + 1 < len(recent_history):
                u = recent_history[i]
                a = recent_history[i + 1]
                if u["role"] == "user" and a["role"] == "assistant":
                    pairs.append(
                        f"Q: {u['content'][:200]}\n"
                        f"A: {a['content'][:600]}"
                    )
        if pairs:
            history_block = "■ 이전 대화 내용 (이미 답변된 내용)\n" + "\n\n".join(pairs) + "\n\n"

    return _ANCHOR_PREFIX + history_block + ctx_part + _ANCHOR_SUFFIX.format(query=query)


# ── 통합 전처리 함수 ──────────────────────────────────────────────────────────
def preprocess(query: str, history: list[dict]) -> tuple[str, list[dict]]:
    """
    chat.py에서 호출하는 단일 진입점.
    Returns: (재작성된 쿼리, 압축된 히스토리)
    """
    compressed = compress_history(history)
    rewritten  = rewrite_query(query, compressed)
    return rewritten, compressed
