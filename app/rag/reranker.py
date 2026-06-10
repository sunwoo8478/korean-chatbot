import requests
from ..core.config import settings

def rerank(query: str, docs: list[dict]) -> list[dict]:
    """bge-reranker로 관련성 재정렬"""
    if not docs:
        return []

    pairs = [[query, d["content"]] for d in docs]
    try:
        r = requests.post(
            f"{settings.reranker_url}/rerank",
            json={"query": query, "documents": [d["content"] for d in docs], "top_n": settings.rag_rerank_top_n},
            timeout=30
        )
        r.raise_for_status()
        ranked = r.json()["results"]
        return [docs[item["index"]] for item in ranked]
    except Exception:
        # 리랭커 실패 시 score 순 정렬로 폴백
        return sorted(docs, key=lambda x: x.get("score", 0), reverse=True)[:settings.rag_rerank_top_n]
