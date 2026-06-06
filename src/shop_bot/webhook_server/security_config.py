"""Startup and configuration security checks."""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)


def require_stable_secret_key() -> str:
    key = (os.getenv('SHOPBOT_SECRET_KEY') or '').strip()
    if key:
        if len(key) < 32:
            logger.warning('SHOPBOT_SECRET_KEY короче 32 символов — рекомендуется более длинный ключ')
        return key
    msg = (
        'SHOPBOT_SECRET_KEY не задан. Укажите стабильный секрет в .env '
        '(openssl rand -hex 32). Без него сессии и CSRF небезопасны.'
    )
    logger.critical(msg)
    sys.exit(1)
