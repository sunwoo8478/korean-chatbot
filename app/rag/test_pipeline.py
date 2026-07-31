"""_resolve_source_conflicts()의 최소 회귀 테스트 — pytest 없이 plain assert만 사용.
DB/네트워크 필요 없는 순수 함수라 `python3 app/rag/test_pipeline.py`로 바로 실행 가능.
"""
from .pipeline import _resolve_source_conflicts


def test_pdf_always_stripped():
    docs = [
        {"source": "PDF매뉴얼", "title": "우편번호", "content": "..."},
        {"source": "공통표준용어", "title": "우편번호", "content": "[도메인: 우편번호C5]"},
    ]
    result = _resolve_source_conflicts(docs, subject="우편번호")
    assert all(d["source"] != "PDF매뉴얼" for d in result)


def test_sibling_domain_filtered_when_referenced():
    docs = [
        {"source": "공통표준용어", "title": "말소일시", "content": "... [도메인: 연월일시분초D]"},
        {"source": "공통표준도메인", "title": "연월일시분초D", "content": "DATETIME"},
        {"source": "공통표준도메인", "title": "연월일시분초C14", "content": "CHAR"},
    ]
    result = _resolve_source_conflicts(docs, subject="말소일시")
    titles = {d["title"] for d in result if d["source"] == "공통표준도메인"}
    assert titles == {"연월일시분초D"}, titles


def test_no_domain_reference_skips_domain_filter():
    # 주어 문서에 [도메인: ...] 필드가 아예 없으면(예: 사전 단어) 도메인 필터링은
    # 건너뛰고, 다른 소스의 공통표준도메인 문서는 그대로 둔다.
    docs = [
        {"source": "사전", "title": "조사", "content": "뜻풀이"},
        {"source": "공통표준도메인", "title": "여부C1", "content": "CHAR"},
    ]
    result = _resolve_source_conflicts(docs, subject="조사")
    assert any(d["title"] == "여부C1" for d in result)


def test_subject_not_found_only_strips_pdf():
    docs = [
        {"source": "PDF매뉴얼", "title": "x", "content": "..."},
        {"source": "공통표준도메인", "title": "여부C1", "content": "CHAR"},
    ]
    result = _resolve_source_conflicts(docs, subject="존재하지않는주어")
    assert all(d["source"] != "PDF매뉴얼" for d in result)
    assert any(d["title"] == "여부C1" for d in result)


def test_unrelated_dict_entry_filtered_when_subject_is_dict_word():
    # "조사가 무슨 뜻이야?"의 부분문자열 생성이 "사가"(전혀 다른 표제어)까지
    # 우연히 정확매칭시키는 경우 — 주어("조사") 자신이 사전 표제어면 다른
    # 표제어("사가")는 제거하고, 주어 자신은 남는다.
    docs = [
        {"source": "사전", "title": "조사", "content": "동음이의어 32개..."},
        {"source": "사전", "title": "사가", "content": "동음이의어 15개..."},
    ]
    result = _resolve_source_conflicts(docs, subject="조사")
    titles = {d["title"] for d in result if d["source"] == "사전"}
    assert titles == {"조사"}, titles


if __name__ == "__main__":
    test_pdf_always_stripped()
    test_sibling_domain_filtered_when_referenced()
    test_no_domain_reference_skips_domain_filter()
    test_subject_not_found_only_strips_pdf()
    test_unrelated_dict_entry_filtered_when_subject_is_dict_word()
    print("all tests passed")
