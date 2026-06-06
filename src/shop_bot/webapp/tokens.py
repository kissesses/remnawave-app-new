"""WebApp session token issuance and validation."""

from __future__ import annotations

import os
import time
import uuid

from shop_bot.data_manager import database

DEFAULT_TOKEN_DAYS = max(1, int(os.getenv("SHOPBOT_WEBAPP_TOKEN_DAYS", "90")))


def token_expires_at() -> float:
    return time.time() + DEFAULT_TOKEN_DAYS * 86400


def issue_webapp_token(user_id: int, *, rotate: bool = False) -> str:
    if not rotate:
        existing = database.get_auth_token_by_user_id(user_id)
        if existing:
            return existing
    token = str(uuid.uuid4())
    database.update_user_auth_token(user_id, token, expires_at=token_expires_at())
    return token
