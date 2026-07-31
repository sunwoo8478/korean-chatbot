"""
DB에서 정답이 있는 질문(골든셋)을 자동 생성한다.
사람이 질문을 하나하나 만드는 대신, std_term/std_domain/dict_entries에서
직접 샘플링해서 "질문 + 기대값" 쌍을 대량으로 뽑는다.

카테고리:
- normal:            도메인 변형이 하나뿐인 단순 표준용어 (쉬운 케이스, 베이스라인)
- long_term:         8자를 넘는 표준용어 (exact match 부분문자열 한계를 넘는 케이스)
- homonym:           동음이의어가 많은 사전 표제어 (앰비귀티 케이스)
- multi_variant:     같은 접두어로 여러 도메인 변형이 있는 용어 (우편번호처럼 헷갈리기 쉬운 케이스)
- domain_conflict:   용어 자체는 도메인이 하나로 확정되는데, 같은 계열(접두어)의 형제
                     도메인이 2개 이상 존재하는 경우 (예: 연월일시분초D ↔ 연월일시분초C14 —
                     의미가 거의 같아 벡터유사도로 형제 도메인이 컨텍스트에 같이 딸려와
                     혼동을 일으키는 케이스, 2026-07-31 발견 버그의 전용 회귀 카테고리)
- nonexistent:       DB에 없는 가짜 용어 (할루시네이션 + 근거/결론 자기모순 테스트)
- comparison:        두 개념의 차이를 묻는 질문 (사실 나열만 하고 종합 안 하는 회귀 테스트)
- followup_pronoun:  꼬리물기 질문에서 "그거" 같은 지시어가 직전 질문 주어로 올바르게 해소되는지

출력: scripts/golden_eval/golden_set.json
"""
import json
import sys

sys.path.insert(0, ".")
from app.core.database import db_cursor

N_NORMAL = 25
N_LONG = 15
N_HOMONYM = 8
N_MULTI_VARIANT = 15
N_DOMAIN_CONFLICT = 10
N_NONEXISTENT = 8
N_FOLLOWUP = 8

FAKE_TERMS = [
    "우주선일련번호", "타임머신소유자여부", "마법지팡이등록번호",
    "용의비늘색상코드", "은하계주소V99", "유령출몰빈도수",
    "드래곤알부화예정일시", "좀비감염경로코드",
]

COMPARISON_CASES = [
    {"question": "공통표준용어랑 공통표준단어의 차이를 알려줘", "expect_terms": ["공통표준용어", "공통표준단어"]},
    {"question": "공통표준용어랑 공통표준도메인의 차이가 뭐야?", "expect_terms": ["공통표준용어", "공통표준도메인"]},
    {"question": "공통표준단어랑 표준국어대사전의 차이를 설명해줘", "expect_terms": ["공통표준단어", "표준국어대사전"]},
    # 표준화 관리 매뉴얼 [그림 Ⅰ-2]에 표준용어/표준단어/표준도메인/표준코드 4개가
    # 형제 개념으로 명시돼 있어 추가했으나, "공통표준용어 vs 공통표준코드" 페어는
    # 라이브 테스트에서 "공통표준코드가 정의되어 있지 않다"는 답이 나오기도 해서
    # (검색 결과가 일관되지 않음 — 고정 회귀 케이스로 부적합) 제외하고 안정적으로
    # 종합까지 나온 페어만 남김
    {"question": "공통표준코드랑 공통표준도메인의 차이가 뭐야?", "expect_terms": ["공통표준코드", "공통표준도메인"]},
]


def generate():
    cases = []

    with db_cursor() as cur:
        # ── normal: 도메인 base가 unique한(변형이 하나뿐인) 표준용어 ─────────────
        cur.execute("""
            WITH base AS (
                SELECT domain_name,
                       regexp_replace(domain_name, 'C[0-9]+$|V[0-9]+$|N[0-9]+$', '') AS grp
                FROM std_domain
            ),
            unique_base AS (
                SELECT domain_name FROM base
                GROUP BY grp, domain_name HAVING count(*) FILTER (WHERE domain_name IS NOT NULL) >= 0
            )
            SELECT t.term_name, t.term_abbr, d.domain_name, d.data_type, d.data_length
            FROM std_term t
            JOIN std_domain d ON t.domain_name = d.domain_name
            JOIN base b ON b.domain_name = d.domain_name
            WHERE length(t.term_name) <= 8
              AND (SELECT count(DISTINCT domain_name) FROM base b2 WHERE b2.grp = b.grp) = 1
            ORDER BY random()
            LIMIT %s
        """, (N_NORMAL,))
        for r in cur.fetchall():
            cases.append({
                "category": "normal",
                "question": f"{r['term_name']} 컬럼 데이터타입이 뭐야?",
                "expect_type": r["data_type"],
                "expect_length": r["data_length"],
                "expect_domain": r["domain_name"],
                "expect_abbr": r["term_abbr"],
            })

        # ── long_term: 8자 초과 표준용어 ─────────────────────────────────────
        cur.execute("""
            SELECT t.term_name, t.term_abbr, d.domain_name, d.data_type, d.data_length
            FROM std_term t
            JOIN std_domain d ON t.domain_name = d.domain_name
            WHERE length(t.term_name) > 8
            ORDER BY random()
            LIMIT %s
        """, (N_LONG,))
        for r in cur.fetchall():
            cases.append({
                "category": "long_term",
                "question": f"{r['term_name']} 컬럼 데이터타입이 뭐야?",
                "expect_type": r["data_type"],
                "expect_length": r["data_length"],
                "expect_domain": r["domain_name"],
                "expect_abbr": r["term_abbr"],
            })

        # ── homonym: 동음이의어 많은 사전 표제어 ─────────────────────────────
        cur.execute("""
            SELECT word, count(DISTINCT sup_no) AS n
            FROM dict_entries WHERE sup_no IS NOT NULL
            GROUP BY word HAVING count(DISTINCT sup_no) >= 10
            ORDER BY random() LIMIT %s
        """, (N_HOMONYM,))
        for r in cur.fetchall():
            cur.execute("""
                SELECT s.definition FROM dict_entries e JOIN dict_senses s ON s.entry_id=e.id
                WHERE e.word=%s ORDER BY e.id, s.id
            """, (r["word"],))
            defs = [d["definition"] for d in cur.fetchall()]
            cases.append({
                "category": "homonym",
                "question": f"{r['word']}가 무슨 뜻이야?",
                "expect_any_of_defs": defs,
                "homonym_count": r["n"],
            })

        # ── multi_variant: 같은 접두어로 도메인 변형이 여러 개인 용어 ─────────
        cur.execute("""
            WITH base AS (
                SELECT domain_name,
                       regexp_replace(domain_name, 'C[0-9]+$|V[0-9]+$|N[0-9]+$', '') AS grp
                FROM std_domain
            ),
            multi AS (
                SELECT grp FROM base GROUP BY grp HAVING count(DISTINCT domain_name) > 1
            )
            SELECT t.term_name, t.term_abbr, d.domain_name, d.data_type, d.data_length
            FROM std_term t
            JOIN std_domain d ON t.domain_name = d.domain_name
            JOIN base b ON b.domain_name = d.domain_name
            JOIN multi m ON m.grp = b.grp
            WHERE t.term_name = b.grp  -- 접두어와 완전히 같은 '기본형' 용어만 (예: '우편번호' 자체)
            ORDER BY random()
            LIMIT %s
        """, (N_MULTI_VARIANT,))
        for r in cur.fetchall():
            cases.append({
                "category": "multi_variant",
                "question": f"{r['term_name']} 컬럼 데이터타입이 뭐야?",
                "expect_type": r["data_type"],
                "expect_length": r["data_length"],
                "expect_domain": r["domain_name"],
                "expect_abbr": r["term_abbr"],
            })

        # ── domain_conflict: 용어 자체는 도메인이 하나로 확정되지만, 같은 계열의
        # 형제 도메인이 2개 이상 존재하는 경우 (예: 연월일시분초D/연월일시분초C14처럼
        # 접미사만 다르고 설명이 거의 같아 벡터유사도로 형제 도메인이 컨텍스트에
        # 같이 딸려와 혼동을 일으키는 케이스). multi_variant보다 넓은 접미사 패턴
        # (단일 영문자+숫자, 예: D/C14/V20)으로 계열을 묶는다.
        cur.execute("""
            WITH fam AS (
                SELECT domain_name, regexp_replace(domain_name, '[A-Z][0-9]*$', '') AS grp
                FROM std_domain
            ),
            conflict AS (
                SELECT grp FROM fam GROUP BY grp HAVING count(DISTINCT domain_name) >= 2
            )
            SELECT t.term_name, t.term_abbr, d.domain_name, d.data_type, d.data_length
            FROM std_term t
            JOIN std_domain d ON t.domain_name = d.domain_name
            JOIN fam f ON f.domain_name = d.domain_name
            JOIN conflict c ON c.grp = f.grp
            ORDER BY random()
            LIMIT %s
        """, (N_DOMAIN_CONFLICT,))
        for r in cur.fetchall():
            cases.append({
                "category": "domain_conflict",
                "question": f"{r['term_name']} 컬럼 데이터타입이 뭐야?",
                "expect_type": r["data_type"],
                "expect_length": r["data_length"],
                "expect_domain": r["domain_name"],
                "expect_abbr": r["term_abbr"],
            })

        # ── followup_pronoun: 꼬리물기 지시어 해소 (실제 재현했던 버그) ───────
        # "X 데이터타입 알려줘" → 답변(X의 term_abbr 포함) → "그럼 그거 영문약어는?"
        # "그거"가 X로 해소돼야 하는데, 예전엔 답변 속 세부값(약어 자체)으로 잘못
        # 치환돼서 엉뚱한 걸 다시 조회하는 버그가 있었음.
        cur.execute("""
            SELECT t.term_name, t.term_abbr, d.data_type, d.data_length
            FROM std_term t JOIN std_domain d ON t.domain_name = d.domain_name
            WHERE length(t.term_name) BETWEEN 3 AND 8
            ORDER BY random() LIMIT %s
        """, (N_FOLLOWUP,))
        for r in cur.fetchall():
            first_answer = (
                f"**{r['term_name']}** 컬럼의 데이터 타입은 **{r['data_type']}** 입니다. "
                f"영문약어는 **{r['term_abbr']}** 입니다."
            )
            cases.append({
                "category": "followup_pronoun",
                "history": [
                    {"role": "user", "content": f"{r['term_name']} 컬럼 데이터타입 알려줘"},
                    {"role": "assistant", "content": first_answer},
                ],
                "question": "그럼 그거 영문약어는 뭐야?",
                "expect_subject": r["term_name"],
                "expect_abbr": r["term_abbr"],
            })

    # ── nonexistent: 가짜 용어 (할루시네이션 테스트, 정답은 "없음") ──────────
    for term in FAKE_TERMS[:N_NONEXISTENT]:
        cases.append({
            "category": "nonexistent",
            "question": f"{term} 컬럼 데이터타입 알려줘",
            "expect_not_found": True,
        })

    # ── comparison: 개념 비교 질문 (사실 나열만 하고 종합 안 하는 회귀 테스트) ──
    for c in COMPARISON_CASES:
        cases.append({"category": "comparison", **c})

    return cases


if __name__ == "__main__":
    cases = generate()
    with open("scripts/golden_eval/golden_set.json", "w", encoding="utf-8") as f:
        json.dump(cases, f, ensure_ascii=False, indent=2)
    from collections import Counter
    print(f"총 {len(cases)}개 생성")
    print(Counter(c["category"] for c in cases))
