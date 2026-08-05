"""API Key 加密与掩码工具。"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class SecretDecryptionError(Exception):
    """存量密文无法解密（如加密密钥已轮换）。"""


def _fernet() -> Fernet:
    settings = get_settings()
    raw_key = settings.AI_CONFIG_ENCRYPTION_KEY or settings.SECRET_KEY
    digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise SecretDecryptionError(
            "AI API Key 无法解密，请重新提交 Key"
        ) from exc


def mask_secret(value: str) -> str:
    """掩码规则：保留前 3 位与后 4 位，不足 8 位显示 ***。"""
    if not value:
        return ""
    if len(value) < 8:
        return "***"
    return f"{value[:3]}***{value[-4:]}"
