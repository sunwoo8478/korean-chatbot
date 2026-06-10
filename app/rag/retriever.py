from ..core.database import db_cursor
from ..core.config import settings


def _substr_candidates_sql(param_idx: int = 1) -> str:
    """쿼리에서 2~8자 부분 문자열을 모두 생성하는 CTE SQL 반환"""
    p = "%s"
    return f"""
        WITH candidates AS (
            SELECT DISTINCT substring({p}, i, len) AS cand
            FROM generate_series(1, length({p})) i,
                 generate_series(2, 8) len
            WHERE i + len - 1 <= length({p})
              AND length(trim(substring({p}, i, len))) >= 2
        )
    """


def retrieve(embedding: list[float], query_text: str = "") -> dict:
    vec_str = "[" + ",".join(map(str, embedding)) + "]"
    top_k = settings.rag_top_k
    qt = query_text  # 편의상

    vector_results = []
    exact_results  = []

    with db_cursor() as cur:

        # ── 1. 표준국어대사전 벡터 검색 ─────────────────────────────────────
        cur.execute("""
            SELECT '사전' AS source, e.word AS title, s.pos,
                s.definition AS content,
                1 - (s.embedding <=> %s::vector) AS score
            FROM dict_senses s
            JOIN dict_entries e ON e.id = s.entry_id
            ORDER BY s.embedding <=> %s::vector
            LIMIT %s
        """, (vec_str, vec_str, top_k))
        vector_results.extend(cur.fetchall())

        # ── 2. 공통표준용어 벡터 검색 ────────────────────────────────────────
        cur.execute("""
            SELECT '공통표준용어' AS source, term_name AS title, NULL AS pos,
                COALESCE(term_desc,'') || ' [도메인: ' || COALESCE(domain_name,'') ||
                '] [영문약어: ' || COALESCE(term_abbr,'') || ']' AS content,
                1 - (embedding <=> %s::vector) AS score
            FROM std_term WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT %s
        """, (vec_str, vec_str, top_k))
        vector_results.extend(cur.fetchall())

        # ── 3. 공통표준단어 벡터 검색 ────────────────────────────────────────
        cur.execute("""
            SELECT '공통표준단어' AS source, word_name AS title, NULL AS pos,
                COALESCE(word_desc,'') || ' [영문명: ' || COALESCE(word_eng_name,'') ||
                '] [약어: ' || COALESCE(word_abbr,'') ||
                '] [도메인: ' || COALESCE(domain_class_name,'') || ']' AS content,
                1 - (embedding <=> %s::vector) AS score
            FROM std_word WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT %s
        """, (vec_str, vec_str, top_k))
        vector_results.extend(cur.fetchall())

        # ── 4. 공통표준도메인 벡터 검색 ──────────────────────────────────────
        cur.execute("""
            SELECT '공통표준도메인' AS source, domain_name AS title, NULL AS pos,
                COALESCE(domain_desc,'') ||
                ' [데이터타입: ' || COALESCE(data_type,'') ||
                '] [길이: ' || COALESCE(data_length::text,'') ||
                '] [소수점: ' || COALESCE(data_decimal::text,'-') ||
                '] [저장형식(DB실제값): ' || COALESCE(storage_format,'') ||
                '] [표현형식(화면표시-전체): ' || COALESCE(REPLACE(display_format, E'\n', ' / '),'') || ']' AS content,
                1 - (embedding <=> %s::vector) AS score
            FROM std_domain WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT %s
        """, (vec_str, vec_str, top_k // 2))
        vector_results.extend(cur.fetchall())

        # ── 5. PDF 매뉴얼 벡터 검색 ──────────────────────────────────────────
        cur.execute("""
            SELECT 'PDF매뉴얼' AS source,
                '표준화관리매뉴얼 p.' || page_no::text AS title, NULL AS pos,
                body AS content,
                1 - (embedding <=> %s::vector) AS score
            FROM doc_pdf_page WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT %s
        """, (vec_str, vec_str, top_k // 3))
        vector_results.extend(cur.fetchall())

        # ── 6. 고시 문서 벡터 검색 ───────────────────────────────────────────
        cur.execute("""
            SELECT 'PDF고시' AS source, title AS title, NULL AS pos,
                body AS content,
                1 - (embedding <=> %s::vector) AS score
            FROM doc_text WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector LIMIT 3
        """, (vec_str, vec_str))
        vector_results.extend(cur.fetchall())

        # ── 6-1. 사용자 업로드 문서 벡터 검색 ────────────────────────────────
        try:
            cur.execute("""
                SELECT '사용자문서' AS source,
                    -- 파일명 + 위치 정보를 title로 구성
                    d.filename ||
                        COALESCE(' p.' || c.page_no::text, '') ||
                        COALESCE(' [' || c.sheet_name || ']', '') ||
                        COALESCE(' §' || LEFT(c.section, 20), '')
                    AS title,
                    NULL AS pos,
                    c.content AS content,
                    1 - (c.embedding <=> %s::vector) AS score
                FROM user_doc_chunks c
                JOIN user_documents d ON d.id = c.doc_id
                WHERE c.embedding IS NOT NULL AND d.status = 'ready'
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """, (vec_str, vec_str, top_k // 3))
            vector_results.extend(cur.fetchall())
        except Exception:
            pass  # 테이블 없으면 건너뜀

        # ── 7. 부분 문자열 exact match (리랭킹 우회) ─────────────────────────
        # 쿼리에서 2~8자 모든 부분 문자열을 생성하여 사전·공통표준 동시 조회
        # → '주민등록번호'의 → 주민(2), 등록(2), 번호(2), 주민등록번호(7) 등 자동 추출
        if qt:
            qlen = len(qt)
            params4 = (qt, qlen, qlen, qt)   # candidates CTE 4번 사용

            # 7-1. 표준국어대사전 — 명사 우선
            cur.execute("""
                WITH candidates AS (
                    SELECT DISTINCT substring(%s, i, len) AS cand
                    FROM generate_series(1, %s) i, generate_series(2, 6) len
                    WHERE i + len - 1 <= %s
                )
                SELECT DISTINCT ON (e.word)
                    '사전' AS source, e.word AS title, s.pos,
                    s.definition AS content, 0.92 AS score
                FROM dict_entries e
                JOIN dict_senses s ON e.id = s.entry_id
                JOIN candidates c ON e.word = c.cand
                WHERE s.pos = '명사'
                ORDER BY e.word, s.id
                LIMIT 10
            """, (qt, qlen, qlen))
            exact_results.extend(cur.fetchall())

            # 7-2. 공통표준용어 — 복합어(7~8자) 포함
            cur.execute("""
                WITH candidates AS (
                    SELECT DISTINCT substring(%s, i, len) AS cand
                    FROM generate_series(1, %s) i, generate_series(2, 8) len
                    WHERE i + len - 1 <= %s
                )
                SELECT '공통표준용어' AS source, term_name AS title, NULL AS pos,
                    COALESCE(term_desc,'') || ' [도메인: ' || COALESCE(domain_name,'') ||
                    '] [영문약어: ' || COALESCE(term_abbr,'') || ']' AS content,
                    0.99 AS score
                FROM std_term t
                JOIN candidates c ON t.term_name = c.cand
                LIMIT 8
            """, (qt, qlen, qlen))
            exact_results.extend(cur.fetchall())

            # 7-3. 공통표준단어
            cur.execute("""
                WITH candidates AS (
                    SELECT DISTINCT substring(%s, i, len) AS cand
                    FROM generate_series(1, %s) i, generate_series(2, 8) len
                    WHERE i + len - 1 <= %s
                )
                SELECT '공통표준단어' AS source, word_name AS title, NULL AS pos,
                    COALESCE(word_desc,'') || ' [영문명: ' || COALESCE(word_eng_name,'') ||
                    '] [약어: ' || COALESCE(word_abbr,'') || ']' AS content,
                    0.95 AS score
                FROM std_word w
                JOIN candidates c ON w.word_name = c.cand
                LIMIT 8
            """, (qt, qlen, qlen))
            exact_results.extend(cur.fetchall())

            # 7-4. 공통표준도메인 — 용어·단어의 domain_name 경유 자동 보완
            cur.execute("""
                WITH candidates AS (
                    SELECT DISTINCT substring(%s, i, len) AS cand
                    FROM generate_series(1, %s) i, generate_series(2, 8) len
                    WHERE i + len - 1 <= %s
                ),
                matched_domains AS (
                    SELECT domain_name FROM std_term t JOIN candidates c ON t.term_name = c.cand
                    UNION
                    SELECT domain_class_name FROM std_word w JOIN candidates c ON w.word_name = c.cand
                        WHERE w.domain_class_name IS NOT NULL
                )
                SELECT '공통표준도메인' AS source, d.domain_name AS title, NULL AS pos,
                    COALESCE(d.domain_desc,'') ||
                    ' [데이터타입: ' || COALESCE(d.data_type,'') ||
                    '] [길이: ' || COALESCE(d.data_length::text,'') ||
                    '] [소수점: ' || COALESCE(d.data_decimal::text,'-') ||
                    '] [저장형식: ' || COALESCE(d.storage_format,'') ||
                    '] [표현형식: ' || COALESCE(d.display_format,'') || ']' AS content,
                    0.99 AS score
                FROM std_domain d
                JOIN matched_domains m ON d.domain_name ILIKE m.domain_name || '%%'
                LIMIT 5
            """, (qt, qlen, qlen))
            exact_results.extend(cur.fetchall())

    # ── 중복 제거 ─────────────────────────────────────────────────────────
    def dedup(rows):
        seen = {}
        for r in rows:
            key = (r['source'], r['title'])
            d = dict(r)
            if key not in seen or d['score'] > seen[key]['score']:
                seen[key] = d
        return list(seen.values())

    return {
        "vector": dedup(vector_results),
        "exact":  dedup(exact_results),
    }
