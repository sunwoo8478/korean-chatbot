"""
기능 4: 자주 묻는 질문 / 기능 5: DB 공백 리포트 / 기능 7: 답변 공유 링크
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.database import db_cursor

router = APIRouter()

# ── 4. 자주 묻는 질문 (TOP 질문 집계) ────────────────────────────────────────
@router.get("/faq")
def get_faq(limit: int = 10):
    """최근 30일 중 자주 나온 질문 패턴 TOP N"""
    with db_cursor() as cur:
        # 짧은 질문(검색어 수준)은 제외, 20자 이상만
        cur.execute("""
            SELECT
                content AS question,
                COUNT(*) AS count,
                MAX(created_at) AS last_asked
            FROM chat_messages
            WHERE role = 'user'
              AND created_at >= NOW() - INTERVAL '30 days'
              AND char_length(content) >= 10
            GROUP BY content
            ORDER BY count DESC, last_asked DESC
            LIMIT %s
        """, (limit,))
        rows = [dict(r) for r in cur.fetchall()]

    # count=1인 단발성 질문은 제외 (2회 이상만 FAQ)
    faqs = [r for r in rows if r["count"] >= 1][:limit]
    return faqs


@router.get("/faq/suggested")
def get_suggested():
    """시작 화면에 표시할 추천 질문 (자주 묻는 + 카테고리별 예시)"""
    with db_cursor() as cur:
        cur.execute("""
            SELECT content AS question, COUNT(*) AS count
            FROM chat_messages
            WHERE role = 'user'
              AND created_at >= NOW() - INTERVAL '7 days'
              AND char_length(content) BETWEEN 10 AND 80
            GROUP BY content
            ORDER BY count DESC
            LIMIT 5
        """)
        popular = [dict(r)["question"] for r in cur.fetchall()]

    # 기본 예시 질문 (popular가 부족할 때 채움)
    defaults = [
        "납부금액 컬럼 설계 시 영문약어와 데이터 타입을 알려줘",
        "주민등록번호 도메인과 저장형식을 알려줘",
        "사업자등록번호 컬럼명과 길이는?",
        "금액 관련 도메인 종류를 정리해줘",
        "VARCHAR와 CHAR의 차이점은?",
    ]

    combined = popular + [d for d in defaults if d not in popular]
    return combined[:6]


# ── 5. DB 공백 리포트 ─────────────────────────────────────────────────────────
@router.get("/db-report")
def db_gap_report():
    """영문약어 없는 용어, 임베딩 없는 항목, 설명 없는 항목 리포트"""
    with db_cursor() as cur:
        # 영문약어 없는 용어
        cur.execute("""
            SELECT COUNT(*) AS count FROM std_term
            WHERE (term_abbr IS NULL OR term_abbr = '' OR term_abbr = '-')
        """)
        no_abbr = cur.fetchone()["count"]

        # 임베딩 없는 항목
        cur.execute("SELECT COUNT(*) AS count FROM std_term WHERE embedding IS NULL")
        no_emb_term = cur.fetchone()["count"]
        cur.execute("SELECT COUNT(*) AS count FROM std_word WHERE embedding IS NULL")
        no_emb_word = cur.fetchone()["count"]
        cur.execute("SELECT COUNT(*) AS count FROM std_domain WHERE embedding IS NULL")
        no_emb_domain = cur.fetchone()["count"]

        # 설명 없는 항목
        cur.execute("""
            SELECT COUNT(*) AS count FROM std_term
            WHERE (term_desc IS NULL OR term_desc = '' OR term_desc = '-')
        """)
        no_desc = cur.fetchone()["count"]

        # 도메인 없는 용어
        cur.execute("""
            SELECT COUNT(*) AS count FROM std_term
            WHERE (domain_name IS NULL OR domain_name = '' OR domain_name = '-')
        """)
        no_domain = cur.fetchone()["count"]

        # 영문약어 없는 용어 샘플
        cur.execute("""
            SELECT term_name FROM std_term
            WHERE (term_abbr IS NULL OR term_abbr = '' OR term_abbr = '-')
            ORDER BY term_name LIMIT 10
        """)
        no_abbr_samples = [r["term_name"] for r in cur.fetchall()]

    report = {
        "summary": {
            "영문약어_없는_용어": no_abbr,
            "임베딩_없는_용어": no_emb_term,
            "임베딩_없는_단어": no_emb_word,
            "임베딩_없는_도메인": no_emb_domain,
            "설명_없는_용어": no_desc,
            "도메인_없는_용어": no_domain,
        },
        "samples": {
            "영문약어_없는_용어_샘플": no_abbr_samples,
        },
        "total_issues": no_abbr + no_emb_term + no_emb_word + no_emb_domain + no_desc + no_domain,
    }

    # 이슈가 있으면 알림 생성
    if report["total_issues"] > 0:
        try:
            with db_cursor() as cur:
                cur.execute("""
                    INSERT INTO notifications (title, message, type)
                    VALUES (%s, %s, 'warning')
                    ON CONFLICT DO NOTHING
                """, (
                    "DB 공백 항목 발견",
                    f"영문약어 없는 용어 {no_abbr}건, 임베딩 미완료 {no_emb_term+no_emb_word+no_emb_domain}건"
                ))
        except Exception:
            pass

    return report


# ── 7. 답변 공유 링크 ─────────────────────────────────────────────────────────
class ShareBody(BaseModel):
    message_content: str
    title: Optional[str] = None
    conversation_id: Optional[str] = None

@router.post("/share")
def create_share(data: ShareBody):
    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO shared_answers (conversation_id, message_content, title)
            VALUES (%s, %s, %s) RETURNING id
        """, (data.conversation_id, data.message_content, data.title or data.message_content[:40]))
        share_id = str(cur.fetchone()["id"])
    return {"id": share_id, "url": f"/share/{share_id}"}

@router.get("/share/{share_id}")
def get_share(share_id: str):
    with db_cursor() as cur:
        cur.execute("""
            SELECT * FROM shared_answers
            WHERE id = %s AND expires_at > NOW()
        """, (share_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "링크가 만료되었거나 존재하지 않습니다.")
    return dict(row)
