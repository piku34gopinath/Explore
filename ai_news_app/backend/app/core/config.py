from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI News Video Generator"
    API_V1_STR: str = "/api/v1"
    
    # AI APIs
    OPENAI_API_KEY: str | None = None
    
    # Database (Shared with aiclip)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@db:5432/videoclipper"

    class Config:
        env_file = ".env"

settings = Settings()
