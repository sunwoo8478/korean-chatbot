"""
golden_set.json의 각 케이스를 실제 /api/chat/full에 던지고, 답변을 정답과
자동으로 비교해서 결과를 report.json/report.md로 남긴다.
로컬 LLM이라 문항당 15~35초 걸리므로 전체 실행에 수십 분이 걸릴 수 있다.
"""
import json
import re
import time

import requests

# chat/full은 하위호환용 레거시 엔드포인트라 history를 무시하고 rewrite_query
# (꼬리물기 지시어 해소)도 안 거친다 — 실제 프론트가 쓰는 chat/stream을 써야
# followup_pronoun 카테고리가 실제 프로덕션 경로를 검증한다.
API = "http://localhost:9000/api/chat/stream"
NOT_FOUND_MARKERS = ["정의되어 있지 않", "찾을 수 없", "없습니다", "존재하지 않"]
DATA_TYPE_WORDS = ("CHAR", "VARCHAR", "NUMERIC")


def ask(question: str, history: list = None, timeout: int = 90) -> str:
    resp = requests.post(
        API, json={"message": question, "history": history or []},
        stream=True, timeout=timeout,
    )
    resp.raise_for_status()
    answer = ""
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        payload = json.loads(line[6:])
        if payload.get("type") == "token":
            answer += payload["text"]
    return answer


def score(case: dict, answer: str) -> dict:
    cat = case["category"]

    # 모든 카테고리 공통: 이 시스템은 URL을 다루는 코드가 전혀 없으므로,
    # 인용에 URL이 붙으면 그건 100% 지어낸 것 (fake_url 회귀 케이스)
    if "http" in answer:
        return {"verdict": "FAIL(가짜URL)", "note": ""}

    if cat == "nonexistent":
        found_disclaimer = any(m in answer for m in NOT_FOUND_MARKERS)
        # 자기모순 체크: 헤드라인(첫 문단)에 "정의되어 있지 않다"는 언급 없이
        # 구체적인 데이터타입을 단정하면, 근거는 "없다"면서 결론은 지어내는
        # EXAONE 자기모순 패턴 재현. 헤드라인 자체에 disclaimer가 있으면 통과.
        headline = answer.split("\n\n")[0]
        headline_contradicts = (
            any(w in headline.upper() for w in DATA_TYPE_WORDS)
            and not any(m in headline for m in NOT_FOUND_MARKERS)
        )
        if headline_contradicts:
            return {"verdict": "FAIL(자기모순)", "note": f"헤드라인: {headline[:100]}"}
        return {"verdict": "PASS" if found_disclaimer else "FAIL(할루시네이션)", "note": ""}

    if cat == "homonym":
        # 여러 뜻을 인지하는지에 대한 약한 신호만 체크 — 완전 자동 채점은 안 함
        multi_aware = bool(re.search(r"(여러|동음이의|다양한 뜻|\d\)|\d\.)", answer))
        return {"verdict": "REVIEW", "note": "다의어 인지" if multi_aware else "단일 뜻으로만 답함(의심)"}

    if cat == "comparison":
        terms_ok = all(t in answer for t in case.get("expect_terms", []))
        # 사실 나열만 하고 안 끝났는지: "차이점" 섹션이나 비교 표가 있는지 확인
        has_synthesis = bool(re.search(r"차이점|비교|\|.*\|.*\|", answer))
        verdict = "PASS" if (terms_ok and has_synthesis) else "FAIL(종합없음)"
        return {"verdict": verdict, "note": f"terms_ok={terms_ok} has_synthesis={has_synthesis}"}

    if cat == "followup_pronoun":
        # "그거"가 직전 질문 주어(term_name)로 해소됐는지 — 답변에 원래 주어와
        # 정답 약어가 같이 나와야 함. 약어만 나오고 주어가 없으면(과거 버그처럼
        # 약어 자체를 새로운 질문 대상으로 오인) 실패로 본다.
        subject_ok = case["expect_subject"] in answer
        abbr_ok = case["expect_abbr"] in answer
        verdict = "PASS" if (subject_ok and abbr_ok) else "FAIL(지시어 오해소)"
        return {"verdict": verdict, "note": f"subject_ok={subject_ok} abbr_ok={abbr_ok}"}

    # normal / long_term / multi_variant
    type_ok = bool(case.get("expect_type")) and case["expect_type"].upper() in answer.upper()
    length_ok = True
    if case.get("expect_length") is not None:
        length_ok = str(case["expect_length"]) in answer
    verdict = "PASS" if (type_ok and length_ok) else "FAIL"
    note = f"type_ok={type_ok} length_ok={length_ok} expect={case.get('expect_type')}({case.get('expect_length')}) domain={case.get('expect_domain')}"
    return {"verdict": verdict, "note": note}


def main():
    with open("scripts/golden_eval/golden_set.json", encoding="utf-8") as f:
        cases = json.load(f)

    results = []
    for i, case in enumerate(cases, 1):
        t0 = time.time()
        try:
            answer = ask(case["question"], history=case.get("history"))
            err = None
        except Exception as e:
            answer = ""
            err = f"{type(e).__name__}: {e}"
        elapsed = time.time() - t0

        sc = {"verdict": "ERROR", "note": err} if err else score(case, answer)
        results.append({**case, "answer": answer, "elapsed_s": round(elapsed, 1), **sc})
        print(f"[{i}/{len(cases)}] {case['category']:14s} {sc['verdict']:20s} ({elapsed:.1f}s) — {case['question']}")

    with open("scripts/golden_eval/report.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # 요약
    from collections import Counter
    by_cat_verdict = Counter((r["category"], r["verdict"]) for r in results)
    lines = ["# 골든셋 평가 리포트\n", f"총 {len(results)}건\n"]
    for cat in sorted(set(r["category"] for r in results)):
        lines.append(f"\n## {cat}")
        for verdict in sorted(set(v for (c, v) in by_cat_verdict if c == cat)):
            n = by_cat_verdict[(cat, verdict)]
            lines.append(f"- {verdict}: {n}건")
    report_md = "\n".join(lines)
    with open("scripts/golden_eval/report.md", "w", encoding="utf-8") as f:
        f.write(report_md)
    print("\n" + report_md)


if __name__ == "__main__":
    main()
