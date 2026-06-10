"""과거 대화 의미 검색 — 새 질문과 유사한 과거 Q&A를 찾아 컨텍스트로 반환"""
from typing import Optional
from ..core.database import db_cursor

SIMILARITY_THRESHOLD = 0.65   # 0.75 → 0.65 (더 넓게 검색)
TOP_K = 5                      # 3 → 5 (더 많은 후보)


def search_history(
    embedding: list[float],
    exclude_conv_id: Optional[str] = None,
    top_k: int = TOP_K,
) -> list[dict]:
    """
    현재 질문과 유사한 과거 Q&A를 모든 세션에서 검색.
    - 현재 세션 제외 조건 제거 → 같은 세션 이전 내용도 참고
    - 유사도 임계값 0.75 → 0.65
    - 중복 질문은 가장 최근 것만 유지
    """
    if not embedding:
        return []

    vec_str = "[" + ",".join(map(str, embedding)) + "]"

    with db_cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (q.content)
                q.id              AS question_id,
                q.conversation_id,
                q.content         AS question,
                q.created_at      AS asked_at,
                1 - (q.embedding <=> %s::vector) AS similarity,
                a.content         AS answer
            FROM chat_messages q
            LEFT JOIN LATERAL (
                SELECT content FROM chat_messages a2
                WHERE a2.conversation_id = q.conversation_id
                  AND a2.role = 'assistant'
                  AND a2.created_at > q.created_at
                ORDER BY a2.created_at
                LIMIT 1
            ) a ON true
            WHERE q.role = 'user'
              AND q.embedding IS NOT NULL
              AND 1 - (q.embedding <=> %s::vector) > %s
            ORDER BY q.content, q.created_at DESC, q.embedding <=> %s::vector
            LIMIT %s
        """, (vec_str, vec_str, SIMILARITY_THRESHOLD, vec_str, top_k * 2))
        rows = cur.fetchall()

    # 답변 있는 것만, 유사도 높은 순 정렬, top_k 제한
    results = sorted(
        [dict(r) for r in rows if r["answer"]],
        key=lambda x: x["similarity"],
        reverse=True,
    )[:top_k]

    return results


def format_history_context(history: list[dict]) -> str:
    """과거 Q&A를 컨텍스트 문자열로 포맷 — 답변은 500자로 확장"""
    if not history:
        return ""

    lines = ["## 관련 과거 대화 (다른 세션 포함 — 참고용)"]
    for i, h in enumerate(history, 1):
        sim_pct = int(h["similarity"] * 100)
        answer  = h["answer"]
        if len(answer) > 500:
            answer = answer[:500] + "..."
        lines.append(f"\n[과거 질문 {i}] 유사도 {sim_pct}%")
        lines.append(f"Q: {h['question']}")
        lines.append(f"A: {answer}")

    return "\n".join(lines)
