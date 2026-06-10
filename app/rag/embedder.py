import requests
from ..core.config import settings

def embed_query(text: str) -> list[float]:
    r = requests.post(
        settings.ollama_url,
        json={"model": settings.embed_model, "prompt": text[:2000]},
        timeout=30
    )
    r.raise_for_status()
    return r.json()["embedding"]
