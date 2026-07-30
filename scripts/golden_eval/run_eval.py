"""
golden_set.json의 각 케이스를 실제 /api/chat/full에 던지고, 답변을 정답과
자동으로 비교해서 결과를 report.json/report.md로 남긴다.
로컬 LLM이라 문항당 15~35초 걸리므로 전체 실행에 수십 분이 걸릴 수 있다.
"""
import json
import re
import time

import requests

API = "http://localhost:9000/api/chat/full"
NOT_FOUND_MARKERS = ["정의되어 있지 않", "찾을 수 없", "없습니다", "존재하지 않"]


def ask(question: str, timeout: int = 90) -> str:
    resp = requests.post(API, json={"message": question}, timeout=timeout)
    resp.raise_for_status()
    return resp.json().get("answer", "")


def score(case: dict, answer: str) -> dict:
    cat = case["category"]

    if cat == "nonexistent":
        found_disclaimer = any(m in answer for m in NOT_FOUND_MARKERS)
        return {"verdict": "PASS" if found_disclaimer else "FAIL(할루시네이션)", "note": ""}

    if cat == "homonym":
        # 여러 뜻을 인지하는지에 대한 약한 신호만 체크 — 완전 자동 채점은 안 함
        multi_aware = bool(re.search(r"(여러|동음이의|다양한 뜻|\d\)|\d\.)", answer))
        return {"verdict": "REVIEW", "note": "다의어 인지" if multi_aware else "단일 뜻으로만 답함(의심)"}

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
            answer = ask(case["question"])
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
