import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # ── Google Gemini API ──────────────────────────────────────────────────────
    GOOGLE_API_KEY: str = ""

    # ── Groq API ───────────────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""

    LLM_MODEL: str = "qwen/qwen3-32b"
    LLM_FALLBACK_MODEL: str = "llama-3.1-8b-instant"
    EMBEDDING_MODEL: str = "models/gemini-embedding-001"

    # ── LLM params ────────────────────────────────────────────────────────────
    MAX_TOKENS: int = 4096
    TEMPERATURE: float = 0.5
    TOP_K_RETRIEVAL: int = 3
    MAX_INPUT_LENGTH: int = 1000

    # FAISS L2 distance threshold
    SIMILARITY_THRESHOLD: float = 80.0

    # ── Hội thoại & Session ───────────────────────────────────────────────────
    MAX_HISTORY_TURNS: int = 3     
    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_MAX_REQUESTS: int = 20
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── Cache / Session ───────────────────────────────────────────────────────
    REDIS_URL: str = ""
    CACHE_TTL: int = 86400
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Web RAG ───────────────────────────────────────────────────────────────
    WEB_SEARCH_ENABLED: bool = True
    WEB_SEARCH_TIMEOUT: int = 10
    WEB_SEARCH_MAX_RESULTS: int = 2  # v2.4: giảm từ 3 → 2 (ít trang hơn, đủ context)
    TAVILY_API_KEY: str = ""


    # ── Đường dẫn dữ liệu ─────────────────────────────────────────────────────
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    RAW_UIT_PATH:  str = os.path.join(BASE_DIR, "data", "raw", "uit",  "data_uit.json")
    RAW_CNPM_PATH: str = os.path.join(BASE_DIR, "data", "raw", "cnpm", "data_cnpm.json")

    FAISS_UIT_PATH:  str = os.path.join(BASE_DIR, "data", "vector_db", "uit_index",  "index.faiss")
    DATA_UIT_PATH:   str = os.path.join(BASE_DIR, "data", "processed", "uit",  "chunks.json")

    FAISS_CNPM_PATH: str = os.path.join(BASE_DIR, "data", "vector_db", "cnpm_index", "index.faiss")
    DATA_CNPM_PATH:  str = os.path.join(BASE_DIR, "data", "processed", "cnpm", "chunks.json")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def groq_api_keys(self) -> list:
        if not self.GROQ_API_KEY:
            return []
        return [k.strip() for k in self.GROQ_API_KEY.split(",") if k.strip()]


settings = Settings()

if not settings.GOOGLE_API_KEY or settings.GOOGLE_API_KEY.strip() in ("", "your-key-here"):
    import warnings
    warnings.warn(
        "GOOGLE_API_KEY chưa được cấu hình. Cần thiết cho tính năng Embedding.",
        stacklevel=2,
    )

is_groq = not settings.LLM_MODEL.startswith("models/")
if is_groq and (not settings.GROQ_API_KEY or settings.GROQ_API_KEY.strip() in ("", "your-key-here")):
    import warnings
    warnings.warn(
        "GROQ_API_KEY chưa được cấu hình cho Groq model. "
        "Thêm GROQ_API_KEY=<key> vào file .env để bật tính năng AI.",
        stacklevel=2,
    )
