"""Shared logging helpers for non-fatal exception handling."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def log_suppressed(context: str = "suppressed") -> None:
    """Log a swallowed exception at DEBUG with traceback."""
    logger.debug("%s", context, exc_info=True)
