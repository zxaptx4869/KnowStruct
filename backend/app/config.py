from functools import lru_cache
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 应用
    APP_NAME: str = "KnowStruct"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # 数据库 (MySQL)
    DATABASE_URL: str = "mysql+aiomysql://knowstruct:knowstruct@localhost:3306/knowstruct"

    # 认证会话
    SESSION_COOKIE_NAME: str = "knowstruct_session"
    SESSION_COOKIE_SECURE: bool = False
    SESSION_TTL_HOURS: int = 24
    REMEMBER_SESSION_DAYS: int = 30
    LOGIN_RATE_LIMIT: int = 10
    LOGIN_RATE_WINDOW_SECONDS: int = 60
    TRUSTED_ORIGINS: str = (
        "http://localhost:5174,http://localhost:5173,http://localhost:3000"
    )

    # OSS
    OSS_ENDPOINT: str = ""
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_BUCKET_NAME: str = ""

    # AI Providers
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    DOUBAO_API_KEY: str = ""
    DOUBAO_BASE_URL: str = ""

    @property
    def trusted_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.TRUSTED_ORIGINS.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.SESSION_TTL_HOURS <= 0 or self.REMEMBER_SESSION_DAYS <= 0:
            raise ValueError("Session durations must be positive")
        if self.LOGIN_RATE_LIMIT <= 0 or self.LOGIN_RATE_WINDOW_SECONDS <= 0:
            raise ValueError("Login rate-limit settings must be positive")
        if self.ENVIRONMENT == "production":
            if not self.SESSION_COOKIE_SECURE:
                raise ValueError("Production requires SESSION_COOKIE_SECURE=true")
            if not self.trusted_origins:
                raise ValueError("Production requires at least one trusted origin")
            if any(urlparse(origin).scheme != "https" for origin in self.trusted_origins):
                raise ValueError("Production trusted origins must use HTTPS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
