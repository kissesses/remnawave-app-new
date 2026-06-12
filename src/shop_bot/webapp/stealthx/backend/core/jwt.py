from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from shop_bot.webapp.stealthx.backend.core.config import get_settings

ALGORITHM = "HS256"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str | int, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    expire = _utcnow() + timedelta(minutes=settings.jwt_access_minutes)
    payload = {"sub": str(subject), "type": "access", "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.resolved_jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(subject: str | int) -> str:
    settings = get_settings()
    expire = _utcnow() + timedelta(days=settings.jwt_refresh_days)
    payload = {"sub": str(subject), "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.resolved_jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(token, settings.resolved_jwt_secret, algorithms=[ALGORITHM])
    if expected_type and payload.get("type") != expected_type:
        raise JWTError("Invalid token type")
    return payload
