from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # DB
    db_host: str = "localhost"
    db_port: int = 5435
    db_name: str = "korean_dict"
    db_user: str = "dictuser"
    db_password: str = "dictpass"

    # LLM (vLLM 로드밸런서)
    vllm_url: str = "http://localhost:8082/v1"
    vllm_model: str = "Qwen3.6-35B"        # MoE 35B (현재)
    vllm_model_dense: str = "Mixtral-8x7B"            # Mixtral 8x7B MoE (GX10-1)
    vllm_url_dense: str = "http://localhost:8083/v1" # Nginx → GX10-1:8081
    vllm_max_tokens: int = 2048
    vllm_temperature: float = 0.1  # 낮을수록 할루시네이션 감소

    # 임베딩 (Ollama bge-m3)
    ollama_url: str = "http://localhost:11434/api/embeddings"
    embed_model: str = "bge-m3"

    # Claude API
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-4-8"
    claude_max_tokens: int = 2048

    # 리랭커
    reranker_url: str = "http://localhost:8100"

    # RAG
    rag_top_k: int = 15      # 벡터 검색 후보
    rag_rerank_top_n: int = 6 # 리랭킹 후 최종 컨텍스트 수

    class Config:
        env_file = ".env"

settings = Settings()
