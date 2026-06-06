"""Shared rate-limit storage: Redis when configured, in-memory fallback."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_redis_client: Any | None = None
_redis_checked = False
_memory_buckets: dict[str, dict] = {}


def _redis_url() -> str:
    return (os.getenv("SHOPBOT_REDIS_URL") or "").strip()


def redis_available() -> bool:
    return _get_redis() is not None


def _get_redis():
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = _redis_url()
    if not url:
        return None
    try:
        import redis

        client = redis.from_url(url, decode_responses=True, socket_timeout=2)
        client.ping()
        _redis_client = client
        logger.info("Rate limiting backend: Redis")
    except Exception as exc:
        logger.warning("Redis unavailable (%s), using in-memory rate limits", exc)
        _redis_client = None
    return _redis_client


def allow_action(key: str, *, limit: int, window: int) -> bool:
    client = _get_redis()
    if client:
        full_key = f"shopbot:rl:{key}"
        try:
            count = client.incr(full_key)
            if count == 1:
                client.expire(full_key, window)
            return int(count) <= limit
        except Exception as exc:
            logger.warning("Redis rate limit error for %s: %s", key, exc)
    return _memory_allow(key, limit=limit, window=window)


def reset_bucket(key: str) -> None:
    client = _get_redis()
    if client:
        try:
            client.delete(f"shopbot:rl:{key}")
            return
        except Exception as exc:
            logger.warning("Redis reset error for %s: %s", key, exc)
    _memory_buckets.pop(key, None)


def _memory_allow(key: str, *, limit: int, window: int) -> bool:
    now = time.time()
    entry = _memory_buckets.get(key)
    if not entry or now - entry["start"] > window:
        _memory_buckets[key] = {"start": now, "count": 1}
        return True
    if entry["count"] >= limit:
        return False
    entry["count"] += 1
    return True


def is_locked(lock_key: str) -> bool:
    client = _get_redis()
    if client:
        try:
            return bool(client.exists(f"shopbot:lock:{lock_key}"))
        except Exception as exc:
            logger.warning("Redis lock check error for %s: %s", lock_key, exc)
    entry = _memory_buckets.get(f"lock:{lock_key}")
    if not entry:
        return False
    locked_until = entry.get("locked_until", 0)
    if locked_until and time.time() < locked_until:
        return True
    _memory_buckets.pop(f"lock:{lock_key}", None)
    return False


def record_failure(
    lock_key: str,
    *,
    max_failures: int,
    lock_seconds: int,
    count_window: int | None = None,
) -> None:
    window = count_window or lock_seconds
    client = _get_redis()
    if client:
        count_key = f"shopbot:fail:{lock_key}"
        lock_full = f"shopbot:lock:{lock_key}"
        try:
            count = client.incr(count_key)
            if count == 1:
                client.expire(count_key, window)
            if int(count) >= max_failures:
                client.setex(lock_full, lock_seconds, "1")
            return
        except Exception as exc:
            logger.warning("Redis failure record error for %s: %s", lock_key, exc)

    now = time.time()
    mem_key = f"lock:{lock_key}"
    entry = _memory_buckets.setdefault(mem_key, {"count": 0, "locked_until": 0, "start": now})
    if now - entry.get("start", now) > window:
        entry["count"] = 0
        entry["start"] = now
    entry["count"] = int(entry.get("count", 0)) + 1
    if entry["count"] >= max_failures:
        entry["locked_until"] = now + lock_seconds


def clear_failure(lock_key: str) -> None:
    client = _get_redis()
    if client:
        try:
            client.delete(f"shopbot:fail:{lock_key}", f"shopbot:lock:{lock_key}")
            return
        except Exception as exc:
            logger.warning("Redis clear failure error for %s: %s", lock_key, exc)
    _memory_buckets.pop(f"lock:{lock_key}", None)
