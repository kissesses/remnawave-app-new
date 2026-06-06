"""At-rest encryption and password hashing for sensitive panel data."""

from __future__ import annotations

import logging
import os
import secrets
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from werkzeug.security import check_password_hash, generate_password_hash

from shop_bot.data_manager.db.dialect import row_cols
from shop_bot.data_manager.db.connection import get_data_dir

logger = logging.getLogger(__name__)

ENC_PREFIX = "enc:v1:"
HASH_PREFIX = "hash:v1:"

ENCRYPTED_SETTING_KEYS = frozenset({
    "remnawave_api_token",
    "telegram_bot_token",
    "support_bot_token",
    "yookassa_secret_key",
    "cryptobot_token",
    "heleket_api_key",
    "tonapi_key",
    "ton_webhook_secret",
    "yoomoney_secret",
    "yoomoney_api_token",
    "yoomoney_client_secret",
    "platega_api_key",
    "smtp_password",
    "backup_master_password",
})

ENCRYPTED_HOST_FIELDS = frozenset({
    "remnawave_api_token",
    "ssh_password",
    "host_pass",
})


def _data_dir() -> Path:
    custom = os.environ.get("SHOPBOT_DATA_DIR")
    if custom:
        return Path(custom)
    return get_data_dir()


def _master_key_file() -> Path:
    return _data_dir() / ".master.key"


def ensure_master_key() -> bytes:
    env_key = (os.environ.get("SHOPBOT_MASTER_KEY") or "").strip()
    if env_key:
        return env_key.encode("utf-8")

    key_file = _master_key_file()
    if key_file.is_file():
        raw = key_file.read_text(encoding="utf-8").strip()
        if raw:
            return raw.encode("utf-8")

    _data_dir().mkdir(parents=True, exist_ok=True)
    generated = Fernet.generate_key()
    key_file.write_text(generated.decode("utf-8"), encoding="utf-8")
    try:
        os.chmod(key_file, 0o600)
        os.chmod(_data_dir(), 0o700)
    except OSError:
        pass
    logger.info("Generated new SHOPBOT master key at %s", key_file)
    return generated


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(ensure_master_key())


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    text = (value or "").strip()
    if not text:
        return None
    if text.startswith(ENC_PREFIX):
        return text
    token = _fernet().encrypt(text.encode("utf-8")).decode("ascii")
    return f"{ENC_PREFIX}{token}"


def decrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if not text:
        return ""
    if not text.startswith(ENC_PREFIX):
        return text
    payload = text[len(ENC_PREFIX):]
    try:
        return _fernet().decrypt(payload.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        logger.error("Failed to decrypt secret value: %s", exc)
        return ""


def generate_panel_password(length: int = 27) -> str:
    """Generate a strong random password for the panel admin account."""
    if length < 16:
        length = 16

    lowers = "abcdefghjkmnpqrstuvwxyz"
    uppers = "ABCDEFGHJKMNPQRSTUVWXYZ"
    digits = "23456789"
    special = "!@#$%&*_+-="
    alphabet = lowers + uppers + digits + special

    required = [
        secrets.choice(lowers),
        secrets.choice(uppers),
        secrets.choice(digits),
        secrets.choice(special),
    ]
    rest = [secrets.choice(alphabet) for _ in range(length - len(required))]
    chars = required + rest
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def hash_panel_password(password: str) -> str:
    digest = generate_password_hash(password, method="scrypt")
    return f"{HASH_PREFIX}{digest}"


def verify_panel_password(stored: str | None, password: str) -> bool:
    if not stored or not password:
        return False
    stored = str(stored)
    if stored.startswith(HASH_PREFIX):
        return check_password_hash(stored[len(HASH_PREFIX):], password)
    return stored == password


def hash_webapp_password(password: str) -> str:
    return hash_panel_password(password)


def verify_webapp_password(stored: str | None, password: str) -> bool:
    return verify_panel_password(stored, password)


def migrate_plaintext_settings(cursor) -> None:
    """One-time re-encryption of settings stored in plaintext."""
    cursor.execute("SELECT key, value FROM bot_settings")
    for row in cursor.fetchall():
        key, value = row_cols(row, "key", "value")
        if key not in ENCRYPTED_SETTING_KEYS or not value:
            continue
        text = str(value)
        if text.startswith(ENC_PREFIX):
            continue
        encrypted = encrypt_secret(text)
        if encrypted:
            cursor.execute(
                "UPDATE bot_settings SET value = ? WHERE key = ?",
                (encrypted, key),
            )
            logger.info("Encrypted setting '%s' at rest", key)


def prepare_setting_for_storage(key: str, value: str | None) -> str | None:
    if value is None:
        return None
    if key == "panel_password":
        text = (value or "").strip()
        if not text:
            return None
        if text.startswith(HASH_PREFIX):
            return text
        return hash_panel_password(text)
    if key in ENCRYPTED_SETTING_KEYS:
        return encrypt_secret(value)
    return value


def resolve_setting_from_storage(key: str, value: str | None) -> str | None:
    if value is None:
        return None
    if key == "panel_password":
        return value
    if key in ENCRYPTED_SETTING_KEYS:
        return decrypt_secret(value)
    return value


def prepare_host_field_for_storage(field: str, value: str | None) -> str | None:
    if field in ENCRYPTED_HOST_FIELDS:
        return encrypt_secret(value)
    return value


def resolve_host_field_from_storage(field: str, value: str | None) -> str | None:
    if field in ENCRYPTED_HOST_FIELDS:
        return decrypt_secret(value)
    return value


def decrypt_host_row(row: dict | None) -> dict | None:
    if not row:
        return row
    data = dict(row)
    for field in ENCRYPTED_HOST_FIELDS:
        if field in data and data[field]:
            data[field] = decrypt_secret(str(data[field]))
    return data
