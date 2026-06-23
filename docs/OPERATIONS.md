# Operations

이 문서는 로컬 실행, 검증, 운영 점검 기준을 정리합니다.

## 로컬 실행 순서

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 9000
```

프런트엔드는 별도 터미널에서 실행합니다.

```bash
cd frontend
npm ci
npm run dev
```

## 헬스 체크

```bash
curl http://localhost:9000/health
```

정상 응답:

```json
{"status":"ok"}
```

## 필수 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL 접속 정보 |
| `VLLM_URL`, `VLLM_MODEL` | OpenAI-compatible LLM endpoint |
| `OLLAMA_URL`, `EMBED_MODEL` | 임베딩 endpoint와 모델명 |
| `RERANKER_URL` | 리랭커 endpoint |
| `RAG_TOP_K`, `RAG_RERANK_TOP_N` | 검색 후보 수와 최종 컨텍스트 수 |

## 배포 전 체크리스트

- [ ] `.env`가 Git에 포함되지 않았는지 확인
- [ ] PostgreSQL `vector` extension 활성화
- [ ] 임베딩 서버 응답 확인
- [ ] 리랭커 서버 응답 확인
- [ ] LLM endpoint의 모델명과 context length 확인
- [ ] `python -m compileall -q app` 통과
- [ ] `npm run build` 통과

## 관측 포인트

| 항목 | 보는 이유 |
| --- | --- |
| request duration | 사용자가 체감하는 전체 응답 시간 |
| retrieval latency | 검색 병목 확인 |
| rerank latency | 후보 수 증가에 따른 비용 확인 |
| TTFT | 스트리밍 첫 토큰까지 걸리는 시간 |
| error status | 외부 모델·DB·리랭커 장애 구분 |

## 장애 대응 메모

| 증상 | 먼저 볼 곳 |
| --- | --- |
| 답변이 늦음 | LLM endpoint, 리랭커 latency, DB slow query |
| 근거가 약함 | exact search 결과, vector search top-k, rerank top-n |
| 스트리밍 중단 | 프록시 timeout, SSE 헤더, LLM 서버 로그 |
| 특정 용어가 안 잡힘 | 표준 용어 테이블, 부분 문자열 추출 범위 |
| 배포 후 화면이 구버전 | 정적 파일 캐시, Vite build 결과, 서버 재시작 여부 |
