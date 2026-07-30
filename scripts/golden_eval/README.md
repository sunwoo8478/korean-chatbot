# 골든셋 회귀 테스트

수동으로 질문을 하나하나 만들어 테스트하는 대신, DB에서 정답이 있는 질문을
자동으로 생성하고 실제 챗봇 답변과 기계적으로 비교하는 회귀 테스트 도구.

## 사용법 (컨테이너 안에서 실행)

```bash
docker exec korean-chatbot-backend python scripts/golden_eval/generate.py
docker exec korean-chatbot-backend python scripts/golden_eval/run_eval.py
```

`generate.py`는 std_term/std_domain/dict_entries에서 5개 카테고리로 샘플링해
`golden_set.json`을 만든다:
- normal: 도메인 변형이 하나뿐인 단순 표준용어
- long_term: 8자 초과 표준용어 (exact match 부분문자열 한계 검증)
- homonym: 동음이의어 10개 이상인 사전 표제어 (앰비귀티 검증)
- multi_variant: 같은 접두어로 여러 도메인 변형이 있는 용어 (우편번호류)
- nonexistent: DB에 없는 가짜 용어 (할루시네이션 검증)

`run_eval.py`는 각 질문을 `/api/chat/full`에 던지고 결과를 `report.json`/
`report.md`로 남긴다. 로컬 LLM 기준 문항당 15~35초 걸리므로 전체 실행에
수십 분 소요.

DB/Ollama가 없는 CI에서는 실행할 수 없음 — 로컬에서 코드 변경 후 회귀
확인용으로 반복 실행하는 용도.
