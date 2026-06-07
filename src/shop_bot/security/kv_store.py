"""Short-lived key-value storage: Redis when configured, in-memory fallback."""

from __future__ import annotations

import logging
import time
from typing import Any

from shop_bot.security.rate_store import _get_redis

logger = logging.getLogger(__name__)

_MEMORY: dict[str, tuple[str, float | None]] = {}


def _redis_key(key: str) -> str:
    return f"shopbot:kv:{key}"


def set_value(key: str, value: str, *, ttl: int | None = None) -> None:
    client = _get_redis()
    if client:
        try:
            if ttl and ttl > 0:
                client.setex(_redis_key(key), ttl, value)
            else:
                client.set(_redis_key(key), value)
            return
        except Exception as exc:
            logger.warning("Redis kv set error for %s: %s", key, exc)
    expires = time.time() + ttl if ttl and ttl > 0 else None
    _MEMORY[key] = (value, expires)


def get_value(key: str) -> str | None:
    client = _get_redis()
    if client:
        try:
            raw = client.get(_redis_key(key))
            if raw is None:
                return None
            return str(raw)
        except Exception as exc:
            logger.warning("Redis kv get error for %s: %s", key, exc)
    entry = _MEMORY.get(key)
    if not entry:
        return None
    value, expires = entry
    if expires is not None and time.time() > expires:
        _MEMORY.pop(key, None)
        return None
    return value


def pop_value(key: str) -> str | None:
    client = _get_redis()
    if client:
        try:
            full = _redis_key(key)
            pipe = client.pipeline()
            pipe.get(full)
            pipe.delete(full)
            raw, _deleted = pipe.execute()
            if raw is None:
                return None
            return str(raw)
        except Exception as exc:
            logger.warning("Redis kv pop error for %s: %s", key, exc)
    entry = _MEMORY.pop(key, None)
    if not entry:
        return None
    value, expires = entry
    if expires is not None and time.time() > expires:
        return None
    return value


def delete_value(key: str) -> None:
    client = _get_redis()
    if client:
        try:
            client.delete(_redis_key(key))
            return
        except Exception as exc:
            logger.warning("Redis kv delete error for %s: %s", key, exc)
    _MEMORY.pop(key, None)


def set_pending_marker(key: str, *, ttl: int = 600) -> None:
    set_value(key, "", ttl=ttl)


def set_confirmed_value(key: str, value: str, *, ttl: int = 600) -> None:
    set_value(key, value, ttl=ttl)
