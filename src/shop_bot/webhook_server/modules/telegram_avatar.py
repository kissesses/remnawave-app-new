"""Fetch Telegram user profile photos for admin panel (bot token)."""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request

from shop_bot.data_manager.database import get_setting

logger = logging.getLogger(__name__)

_CACHE: dict[int, tuple[float, str | None]] = {}
_CACHE_TTL = 3600


def _cache_get(user_id: int) -> str | None | _MISSING:
    row = _CACHE.get(user_id)
    if not row:
        return MISSING
    ts, url = row
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(user_id, None)
        return MISSING
    return url


class _MISSING:
    pass


MISSING = _MISSING()


def get_telegram_avatar_file_url(user_id: int) -> str | None:
    """Return direct Telegram file URL or None if user has no profile photo."""
    if not user_id or user_id <= 0:
        return None

    cached = _cache_get(user_id)
    if cached is not MISSING:
        return cached

    token = (get_setting('telegram_bot_token') or '').strip()
    if not token:
        _CACHE[user_id] = (time.time(), None)
        return None

    try:
        base = f'https://api.telegram.org/bot{token}'
        photos_url = f'{base}/getUserProfilePhotos?{urllib.parse.urlencode({"user_id": user_id, "limit": 1})}'
        with urllib.request.urlopen(photos_url, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if not data.get('ok') or not data.get('result', {}).get('total_count'):
            _CACHE[user_id] = (time.time(), None)
            return None
        photos = data.get('result', {}).get('photos') or []
        if not photos or not photos[0]:
            _CACHE[user_id] = (time.time(), None)
            return None
        file_id = photos[0][-1]['file_id']

        file_url = f'{base}/getFile?{urllib.parse.urlencode({"file_id": file_id})}'
        with urllib.request.urlopen(file_url, timeout=8) as resp:
            file_data = json.loads(resp.read().decode('utf-8'))
        if not file_data.get('ok'):
            _CACHE[user_id] = (time.time(), None)
            return None
        file_path = file_data.get('result', {}).get('file_path')
        if not file_path:
            _CACHE[user_id] = (time.time(), None)
            return None
        url = f'https://api.telegram.org/file/bot{token}/{file_path}'
        _CACHE[user_id] = (time.time(), url)
        return url
    except Exception as e:
        logger.debug('Telegram avatar fetch failed for %s: %s', user_id, e)
        _CACHE[user_id] = (time.time(), None)
        return None


def fetch_telegram_avatar_bytes(user_id: int) -> tuple[bytes, str] | None:
    """Download avatar bytes for proxy response. Returns (data, content_type) or None."""
    file_url = get_telegram_avatar_file_url(user_id)
    if not file_url:
        return None
    try:
        req = urllib.request.Request(file_url, headers={'User-Agent': 'RemnawaveApp/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            ctype = resp.headers.get('Content-Type') or 'image/jpeg'
            return data, ctype
    except Exception as e:
        logger.debug('Telegram avatar download failed for %s: %s', user_id, e)
        return None
