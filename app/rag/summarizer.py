"""
누적 대화 요약 — 4턴마다 [기존 요약 + 새 4턴] → LLM 요약 → DB 저장
"""
import requests
from ..core.config import settings
from ..core.database import db_cursor

SUMMARIZE_EVERY = 4   # 몇 턴마다 요약할지


def _call_llm(prompt: str) -> str:
    resp = requests.post(
        f"{settings.vllm_url}/chat/completions",
        json={
            "model": settings.vllm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 512,
            "chat_template_kwargs": {"enable_thinking": False},
        },
        timeout=30,
    )
    return resp.json()["choices"][0]["message"]["content"].strip()


def get_conversation_summary(conv_id: str) -> str:
    """DB에서 현재 대화의 누적 요약 반환"""
    with db_cursor() as cur:
        cur.execute("SELECT summary FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
    return (row["summary"] or "") if row else ""


def maybe_summarize(conv_id: str):
    """
    현재 대화의 메시지 수를 확인해서 SUMMARIZE_EVERY 배수가 되면 요약 실행.
    백그라운드에서 호출되므로 예외가 발생해도 조용히 넘어감.
    """
    try:
        with db_cursor() as cur:
            cur.execute("""
                SELECT summary, summary_turn_count
                FROM conversations WHERE id = %s
            """, (conv_id,))
            conv = cur.fetchone()
            if not conv:
                return

            cur.execute("""
                SELECT role, content FROM chat_messages
                WHERE conversation_id = %s
                ORDER BY created_at
            """, (conv_id,))
            messages = [dict(r) for r in cur.fetchall()]

        existing_summary = conv["summary"] or ""
        summarized_up_to = conv["summary_turn_count"] or 0

        # 사용자 턴 기준으로 카운트
        user_turns = [m for m in messages if m["role"] == "user"]
        total_user_turns = len(user_turns)

        # 새로 쌓인 턴이 SUMMARIZE_EVERY 미만이면 스킵
        new_turns = total_user_turns - summarized_up_to
        if new_turns < SUMMARIZE_EVERY:
            return

        # 요약 대상: 마지막 SUMMARIZE_EVERY*2개 메시지 (최근 4턴 Q&A)를 제외한 이전 부분
        # 항상 최근 4턴은 raw로 남기고, 그 이전을 요약
        keep_raw = SUMMARIZE_EVERY * 2   # user+assistant 쌍
        to_summarize = messages[:-keep_raw] if len(messages) > keep_raw else []

        if not to_summarize:
            return

        # 요약 대상 대화문 구성
        dialogue = "\n".join(
            f"{'사용자' if m['role'] == 'user' else 'AI'}: {m['content'][:400]}"
            for m in to_summarize
        )

        # 기존 요약이 있으면 함께 포함
        if existing_summary:
            prompt = (
                f"아래는 이전 대화 요약과 새 대화야. 둘을 합쳐서 핵심 내용을 5문장 이내로 요약해.\n"
                f"어떤 용어/컬럼/도메인을 물어봤고 어떤 답이 나왔는지 중심으로 요약해.\n"
                f"요약문만 출력해, 다른 말은 하지 마.\n\n"
                f"[이전 요약]\n{existing_summary}\n\n"
                f"[새 대화]\n{dialogue}"
            )
        else:
            prompt = (
                f"아래 대화를 5문장 이내로 요약해.\n"
                f"어떤 용어/컬럼/도메인을 물어봤고 어떤 답이 나왔는지 중심으로 요약해.\n"
                f"요약문만 출력해, 다른 말은 하지 마.\n\n"
                f"{dialogue}"
            )

        summary = _call_llm(prompt)

        # DB에 저장
        with db_cursor() as cur:
            cur.execute("""
                UPDATE conversations
                SET summary = %s,
                    summary_turn_count = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (summary, total_user_turns - SUMMARIZE_EVERY, conv_id))

    except Exception as e:
        print(f"[Summarizer] 요약 실패 ({conv_id}): {e}")


def build_history_with_summary(conv_id: str, raw_history: list[dict]) -> list[dict]:
    """
    LLM에 전달할 최종 히스토리 구성:
    [요약이 있으면 system 메시지로] + [최근 4턴]
    """
    summary = get_conversation_summary(conv_id) if conv_id else ""
    recent  = raw_history[-(SUMMARIZE_EVERY * 2):]   # 최근 4턴 (user+assistant 쌍)

    if summary:
        return [{"role": "system", "content": f"[이전 대화 요약]\n{summary}"}] + recent
    return recent
