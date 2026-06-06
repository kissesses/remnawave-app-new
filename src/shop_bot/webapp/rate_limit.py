"""Rate limiting for WebApp auth endpoints."""

from __future__ import annotations

from shop_bot.security.rate_store import allow_action, reset_bucket

RESET_REQUEST_LIMIT = 3
RESET_REQUEST_WINDOW = 3600
RESET_CHECK_LIMIT = 5
RESET_CHECK_WINDOW = 600

__all__ = [
    "RESET_REQUEST_LIMIT",
    "RESET_REQUEST_WINDOW",
    "RESET_CHECK_LIMIT",
    "RESET_CHECK_WINDOW",
    "allow_action",
    "reset_bucket",
]
