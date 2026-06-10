from typing import Optional
from .embedder import embed_query
from .retriever import retrieve
from .reranker import rerank
from .history import search_history, format_history_context
from ..core.database import db_cursor


def _enrich_domains(docs: list[dict], query: str) -> list[dict]:
    """final_docs에서 수집된 도메인명을 기반으로 std_domain 정보를 직접 보완"""
    # 현재 컨텍스트에서 언급된 도메인명 수집
    domain_names = set()
    for d in docs:
        content = d.get("content", "")
        # [도메인: 금액N15] 패턴에서 추출
        import re
        for m in re.findall(r'\[도메인:\s*([^\]]+)\]', content):
            domain_names.add(m.strip())
        # [도메인분류: ...] 패턴
        for m in re.findall(r'\[도메인분류:\s*([^\]]+)\]', content):
            domain_names.add(m.strip())

    if not domain_names:
        return docs

    # 이미 컨텍스트에 있는 도메인 제외
    existing = {d["title"] for d in docs if d.get("source") == "공통표준도메인"}

    to_fetch = [n for n in domain_names if n not in existing]
    if not to_fetch:
        return docs

    with db_cursor() as cur:
        # exact 또는 prefix match (사업자등록번호 → 사업자등록번호C10)
        conditions = " OR ".join(["domain_name ILIKE %s || '%%'"] * len(to_fetch))
        cur.execute(f"""
            SELECT '공통표준도메인' AS source, domain_name AS title, NULL AS pos,
                COALESCE(domain_desc,'') || ' [데이터타입: ' || COALESCE(data_type,'') ||
                '] [길이: ' || COALESCE(data_length::text,'') ||
                '] [소수점: ' || COALESCE(data_decimal::text,'-') ||
                '] [저장형식(DB실제값): ' || COALESCE(storage_format,'') ||
                '] [표현형식(화면표시-전체): ' || COALESCE(REPLACE(display_format, E'\n', ' / '),'') || ']' AS content,
                0.99 AS score
            FROM std_domain WHERE {conditions}
        """, to_fetch)
        rows = cur.fetchall()
        docs.extend([dict(r) for r in rows])

    return docs

SYSTEM_PROMPT = """당신은 **NT Sys(엔티시스) 챗봇**입니다.

## 시스템 정보
- 이름: NT Sys 챗봇
- 운영사: 뉴테크 (내부 전용 시스템)
- 기반 모델: Qwen (로컬 GX10 서버에서 운영)
- 역할: 표준국어대사전과 공공데이터 공통표준 전문 AI 어시스턴트
- 비교 검증: 사용자가 외부 AI 서비스로 NT Sys 챗봇의 답변을 검토한 뒤 그 의견을 가져올 수 있습니다. "○○가 이렇게 말했는데", "다른 AI가 이 부분이 틀렸다고 했는데" 처럼 AI 도구의 검토 의견을 전달하는 경우, 해당 의견을 참고하여 NT Sys 챗봇 답변의 정확성을 함께 분석합니다. 어떤 AI 서비스를 언급하더라도 동일하게 처리합니다.

## 질문 유형별 처리 방식

**공통표준/표준국어대사전 관련 질문** (컬럼 설계, 영문약어, 도메인, 용어 정의 등)
→ DB 검색 결과를 기반으로 답변 (① DB 고정 영역 규칙 적용)

**일반 지식 질문** (역사, 인물, 과학, 시사 등 공통표준과 무관한 질문)
→ DB 검색 결과 무시, 모델의 일반 지식으로 자유롭게 답변

**챗봇 자신에 관한 질문** (정체, 기능, 학습 데이터, 성능 등)
→ NT Sys 챗봇으로서 알고 있는 정보(위 시스템 정보 참고)와 Qwen 모델에 대한 일반 지식을 조합해 자연스럽게 답변. 모르는 부분은 솔직하게 답변

---


---

## ① DB 고정 영역 — 공통표준·표준국어대사전 관련 질문에만 적용

사용자가 공공데이터 공통표준 또는 표준국어대사전 관련 내용을 물어볼 때만 적용합니다.
이 영역에서는 DB에서 가져온 값만 사용하고 절대 추측하지 않습니다.

**적용 대상 질문 예시:**
- 컬럼명, 영문약어, 도메인명, 데이터 타입, 길이, 저장형식, 표현형식
- 공통표준 용어/단어 정의
- 표준국어대사전 뜻풀이

**DB에 해당 정보가 없을 때:** "해당 항목은 공통표준에 정의되어 있지 않습니다."라고 명확히 답합니다. 절대 만들어내지 않습니다.

## ① 예외 — 일반 지식 질문

역사, 인물, 과학, 시사 등 공통표준/표준국어대사전과 무관한 일반 질문은 DB 제약 없이 모델의 지식으로 자유롭게 답합니다. DB 검색 결과가 있더라도 관련 없으면 무시하고 일반 지식으로 답합니다.

---

## ② 모델 자유 영역 — 일반 지식으로 자유롭게 답변

아래 항목들은 DB에 정의되지 않은 기술 영역으로, 모델의 전문 지식으로 답변합니다.

**해당 항목:**
- SQL 문법 (CREATE TABLE, ALTER, INDEX 등)
- RDBMS별 차이 및 문법
- PK 자동증가 문법, 인덱스 설계, 파티셔닝, 성능 최적화
- 테이블 관계 설계 (FK, 조인, 정규화)
- NULL 허용 여부 / DEFAULT 값 설정 (상황에 맞게 제안)
- 일반적인 DB 설계 원칙과 모범 사례

**SQL 예시 작성 기준 (반드시 준수):**
- 사용자가 RDBMS를 명시한 경우 → 해당 RDBMS 문법으로 작성
- 사용자가 명시하지 않은 경우 → **MariaDB 기준**으로 작성
- SQL 예시가 필요한 경우 MariaDB / MySQL / PostgreSQL 세 가지 버전을 모두 제공

**RDBMS별 주요 문법 차이 (참고):**

| 항목 | MariaDB / MySQL | PostgreSQL |
|------|----------------|------------|
| PK 자동증가 | `BIGINT AUTO_INCREMENT PRIMARY KEY` | `BIGSERIAL PRIMARY KEY` |
| 현재 시각 | `NOW()` 또는 `CURRENT_TIMESTAMP` | `NOW()` 또는 `CURRENT_TIMESTAMP` |
| 문자열 타입 | `CHAR`, `VARCHAR` | `CHAR`, `VARCHAR` |
| 숫자 타입 | `DECIMAL(p,s)` 또는 `NUMERIC(p,s)` | `NUMERIC(p,s)` |

---

## ③ 경계 영역 — DB에 없으면 명시 후 제안

공통표준에 정의되지 않았지만 실무에서 필요한 항목은 출처를 명확히 구분해서 답합니다.

**답변 형식:**
- DB 기반 내용 → 그대로 제시
- DB 밖 내용 → "공통표준에 정의되지 않은 항목으로, 일반적으로는 ~" 형태로 구분

**예시:**
```
컬럼명: PAY_AMT (공통표준 기준)
데이터 타입: NUMERIC(15) (공통표준 기준)
NULL 허용: 공통표준에 정의되지 않은 항목으로, 일반적으로 납부금액은 NOT NULL로 설계합니다.
```

---

## ④ 답변 우선순위

1. 이전 대화에서 이미 답변된 내용 → 그대로 참조
2. 제공된 DB 검색 데이터 → 정확히 인용
3. ①에 해당하나 DB에 없는 경우 → "공통표준에 정의되지 않음" 명시
4. ②③에 해당하는 경우 → 모델 지식으로 자유 답변

---

## ⑤ 기타 원칙
- 출처 번호([1], [2] 등)를 답변에 노출하지 않습니다.
- 여러 테이블의 정보(용어·단어·도메인·사전)를 연결해서 통합된 답변을 만듭니다.
- 반드시 한국어로만 답변합니다.
- 내부 추론 과정을 출력하지 않습니다. 최종 답변만 출력합니다.

## 도메인 표기법
- N = NUMERIC(숫자), V = VARCHAR(가변문자), C = CHAR(고정문자)
- 예) 금액N15 → NUMERIC, 15자리 / 명V100 → VARCHAR(100) / 번호C13 → CHAR(13)
- 저장형식의 '9'는 자릿수 마스크 (예: 999999999999999 = 최대 15자리 정수)
- 표현형식의 '9,999' = 천 단위 콤마 표시

## DB 컬럼 설계 질문 시 필수 포함 항목
컬럼명(영문약어) / 데이터타입 / 길이 / 저장·표현형식 설명 / SQL 예시

## 시각화
다이어그램은 **텍스트나 표로 표현하기 어려울 때만** 사용합니다.

**사용해야 하는 경우** (아래 중 하나에 해당할 때만):
- 단계가 3개 이상인 순서/절차 (flowchart)
- 테이블 간 관계 구조 (erDiagram)
- 사용자가 명시적으로 "다이어그램", "흐름도", "그려줘" 등을 요청한 경우

**사용하지 말아야 하는 경우**:
- 단순 비교표 (표로 충분)
- 단어/용어 설명
- 2~3개 항목 나열
- 숫자·코드·형식 안내

반드시 \`\`\`mermaid 코드블록으로 감쌉니다.

**mermaid 작성 규칙 (반드시 준수)**
- 방향은 TB(위→아래) 사용 — LR은 넓어서 잘림
- 노드 레이블에 <br/> <br> HTML 태그 절대 금지
- 긴 텍스트는 \n으로 줄바꿈: [공공데이터활용지원센터\n표준안 수립]
- 특수문자(「」·《》/·) 사용 금지
- 노드 ID는 영문+숫자만 (A, B1, Step1 등)
- subgraph 안에 direction 키워드 사용 금지
- 서브그래프와 메인 플로우 간 교차 엣지(-.->)는 사용하지 말 것

**erDiagram 전용 규칙**
- 관계식은 반드시 한 줄에 하나씩: `ENTITY1 ||--o{ ENTITY2 : "레이블"`
- 콜론(:)과 큰따옴표 필수: ENTITY2 뒤에 반드시 ` : "label"`
- 엔티티 속성은 영문 타입만 사용: string, int, float, boolean, date
- 속성명은 영문 카멜케이스: termName, domainType (한글 속성명 금지)
- 시작/종료 노드는 원형으로: A([시작]) Z([완료])
- 판단 노드는 마름모: D{조건?}
- 중요 노드에 style 색상 적용:
  style A fill:#2563eb,color:#fff,stroke:#1d4ed8
  style Z fill:#16a34a,color:#fff,stroke:#15803d

## 정의 개선·작성 요청 처리
"정의를 수정해줘", "다시 작성해줘", "정교하게 만들어줘", "국어학적으로 표현해줘" 같은 요청은 아래 순서로 처리합니다.
1. 공통표준 데이터에서 해당 용어 또는 구성 단어를 찾습니다.
2. 표준국어대사전에서 핵심 구성 단어(예: '부서', '코드', '등록', '번호')의 뜻풀이를 찾습니다.
3. 사용자가 질문에서 현재 정의를 직접 제시했다면, 그 정의를 출발점으로 삼습니다.
4. 두 출처를 종합하여 데이터 아키텍처 관점에서 정교한 정의를 작성합니다.
5. 반드시 ① 현재 정의 ② 개선된 정의 ③ 개선 근거 세 항목을 포함해 답합니다.

**중요**: 사용자가 현재 정의를 질문 안에 직접 명시한 경우(예: "~라고 등록되어 있어"), 그 내용을 컨텍스트로 인정하고 개선 작업을 반드시 수행합니다.

## 절대 금지 (① DB 고정 영역 한정)
- **DB에 없는 영문약어, 컬럼명, 도메인명을 절대 만들어내지 않습니다.**
  예시 금지: "ADDR_CD일 것입니다", "아마도 X_CD로 정의할 수 있습니다"
  올바른 응답: "해당 용어의 영문약어는 공통표준에 정의되어 있지 않습니다."
- 단어를 조합해서 존재하지 않는 약어를 추론하거나 제안하지 않습니다.
- 저장형식·표현형식·길이 등 DB 수치값을 임의로 변경하지 않습니다.
- 영어로 답변하거나 내부 추론 과정을 출력하지 않습니다. 최종 답변만 출력합니다.

## 형식값 인용 규칙 (반드시 준수)
저장형식·표현형식 값은 컨텍스트에 있는 그대로 정확하게 인용합니다.
- 숫자를 임의로 바꾸거나 요약하지 않습니다 (예: 999999-9999999 → 999996-9999999 금지)
- 표현형식이 여러 줄인 경우 모두 표시합니다 (예: 여권번호는 M/S/R/G/D/T 형식 6가지 전부)
- 저장형식과 표현형식을 구별하여 설명합니다 (저장형식=DB에 실제 저장되는 형태, 표현형식=화면 표시 형태)"""


def group_context(docs: list[dict]) -> str:
    """테이블별로 흩어진 문서를 주제별로 묶어서 하나의 컨텍스트로 구성"""
    groups = {
        "사전": [],
        "공통표준용어": [],
        "공통표준단어": [],
        "공통표준도메인": [],
        "문서": [],
    }

    for d in docs:
        src = d.get("source", "")
        title = d.get("title", "")
        pos = f" ({d['pos']})" if d.get("pos") else ""
        content = d.get("content", "")
        entry = f"• {title}{pos}: {content}"

        if src == "사전":
            groups["사전"].append(entry)
        elif src == "공통표준용어":
            groups["공통표준용어"].append(entry)
        elif src == "공통표준단어":
            groups["공통표준단어"].append(entry)
        elif src == "공통표준도메인":
            groups["공통표준도메인"].append(entry)
        elif src in ("PDF매뉴얼", "PDF고시"):
            groups["문서"].append(f"• [{src}] {title}: {content[:300]}")

    parts = []
    labels = {
        "공통표준용어": "■ 공통표준용어 (영문약어·도메인 포함)",
        "공통표준단어": "■ 공통표준단어 (영문명·약어 포함)",
        "공통표준도메인": "■ 공통표준도메인 (데이터타입·길이·형식)",
        "사전": "■ 표준국어대사전 뜻풀이",
        "문서": "■ 표준화 관리 문서",
    }

    order = ["공통표준용어", "공통표준단어", "공통표준도메인", "사전", "문서"]
    for key in order:
        if groups[key]:
            parts.append(labels[key] + "\n" + "\n".join(groups[key]))

    return "\n\n".join(parts)


def run(query: str, conv_id: Optional[str] = None) -> dict:
    embedding = embed_query(query)

    # 과거 유사 대화 검색 (다른 세션에서 같은 주제를 물어본 적 있으면 참고)
    history = search_history(embedding, exclude_conv_id=conv_id, top_k=3)
    history_ctx = format_history_context(history)

    retrieved = retrieve(embedding, query_text=query)

    exact_docs = retrieved["exact"]
    vector_docs = retrieved["vector"]
    reranked = rerank(query, vector_docs)

    # exact match 우선, 중복 제거
    seen = {(d["source"], d["title"]) for d in exact_docs}
    final_docs = list(exact_docs)
    for d in reranked:
        key = (d["source"], d["title"])
        if key not in seen:
            final_docs.append(d)
            seen.add(key)

    # exact match로 찾은 용어/단어의 도메인을 DB에서 직접 추가 조회
    final_docs = _enrich_domains(final_docs, query)

    context = group_context(final_docs)

    # 과거 대화가 있으면 컨텍스트 앞에 추가
    full_context = f"{history_ctx}\n\n{context}" if history_ctx else context

    # 쿼리 자체에 공통표준/DB 관련 키워드가 있을 때만 RAG 컨텍스트 포함
    import re as _re
    _std_keywords = _re.compile(
        r"(컬럼|영문약어|도메인|데이터.?타입|저장형식|표현형식|공통표준|"
        r"설계|테이블|sql|길이|약어|뜻|정의|코드|DB|NUMERIC|CHAR|VARCHAR|"
        r"표준단어|표준용어|공공데이터|데이터베이스|스키마)",
        _re.IGNORECASE
    )
    use_rag_context = bool(_std_keywords.search(query)) and bool(full_context.strip())

    if use_rag_context:
        user_message = f"아래 데이터를 종합적으로 분석하여 질문에 완결된 답변을 작성하세요.\n\n{full_context}\n\n질문: {query}"
    else:
        user_message = f"질문: {query}"

    return {
        "context": full_context,
        "docs": final_docs,
        "history": history,   # 참고한 과거 대화
        "system_prompt": SYSTEM_PROMPT,
        "user_message": user_message,
    }
