"""bge-reranker-v2-m3 기반 최소 리랭커 서비스.
app/rag/reranker.py가 기대하는 계약: POST /rerank
  요청: {"query": str, "documents": [str], "top_n": int}
  응답: {"results": [{"index": int, "relevance_score": float}, ...]}  # score 내림차순
호스트에서 직접 실행(Ollama처럼 네이티브) — 컨테이너의 host.docker.internal:8100이
이 프로세스를 가리킨다.
"""
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import CrossEncoder

app = FastAPI()
model = CrossEncoder("BAAI/bge-reranker-v2-m3", max_length=512)


class RerankRequest(BaseModel):
    query: str
    documents: list[str]
    top_n: int = 6


@app.post("/rerank")
def rerank(req: RerankRequest):
    if not req.documents:
        return {"results": []}
    pairs = [[req.query, d] for d in req.documents]
    scores = model.predict(pairs)
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:req.top_n]
    return {"results": [{"index": i, "relevance_score": float(scores[i])} for i in ranked]}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
