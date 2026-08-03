import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_requires_secure_cookie() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SESSION_COOKIE_SECURE=False,
            TRUSTED_ORIGINS="https://knowstruct.example",
        )


def test_production_requires_https_origin() -> None:
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SESSION_COOKIE_SECURE=True,
            TRUSTED_ORIGINS="http://knowstruct.example",
        )


def test_valid_production_security_settings() -> None:
    settings = Settings(
        ENVIRONMENT="production",
        SESSION_COOKIE_SECURE=True,
        TRUSTED_ORIGINS="https://knowstruct.example",
    )
    assert settings.trusted_origins == ["https://knowstruct.example"]
