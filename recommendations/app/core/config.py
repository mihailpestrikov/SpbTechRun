from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "spbtechrun"

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "nomic-embed-text"

    embedding_dim: int = 768

    class Config:
        env_file = ".env"


settings = Settings()
