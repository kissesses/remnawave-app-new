"""WebApp Studio runtime helpers — analytics, health history, logs, restart."""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

from shop_bot.webapp.studio_config import parse_content_overrides, parse_health_history, parse_module_order
from shop_bot.data_manager.db import _fetch_row, _fetch_val, get_user_count, update_webapp_settings
from shop_bot.data_manager.db.dialect import msk_time_filter
from shop_bot.webhook_server.modules import webapp_panel

logger = logging.getLogger(__name__)

_LOG_LEVEL_RE = re.compile(r"\[(DEBUG|INFO|WARNING|ERROR|CRITICAL)\]", re.I)
_LAST_HEALTH_SNAPSHOT_AT = 0.0
DEFAULT_MODULE_ORDER = parse_module_order(None)


def append_health_snapshot(webapp: dict | None, health: dict | None) -> list[dict[str, Any]]:
    global _LAST_HEALTH_SNAPSHOT_AT
    now = time.time()
    if now - _LAST_HEALTH_SNAPSHOT_AT < 55:
        return parse_health_history((webapp or {}).get("webapp_health_history"))
    _LAST_HEALTH_SNAPSHOT_AT = now

    webapp = dict(webapp or {})
    history = parse_health_history(webapp.get("webapp_health_history"))
    health = health or {}
    snapshot = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "port_ok": bool((health.get("port_local") or {}).get("ok")),
        "dns_ok": bool((health.get("dns") or {}).get("ok")),
        "ssl_ok": bool((health.get("ssl") or {}).get("ok")),
        "http_status": (health.get("http") or {}).get("status"),
        "uptime_sec": health.get("uptime_sec"),
    }
    history.append(snapshot)
    history = history[-168:]
    try:
        update_webapp_settings(webapp_health_history=json.dumps(history, ensure_ascii=False))
    except Exception as exc:
        logger.debug("health snapshot save failed: %s", exc)
    return history


def build_webapp_analytics(webapp: dict | None = None) -> dict[str, Any]:
    webapp = webapp or {}
    design_stats = webapp_panel.parse_design_stats(webapp.get("webapp_design_stats"))
    total_picks = sum(design_stats.values()) if design_stats else 0

    users_total = get_user_count()
    trial_used = int(_fetch_val("SELECT COUNT(*) FROM users WHERE trial_used = 1", (), 0) or 0)
    keys_active = int(
        _fetch_val(
            "SELECT COUNT(*) FROM vpn_keys WHERE expire_at IS NOT NULL AND expire_at > CURRENT_TIMESTAMP",
            (),
            0,
        )
        or 0
    )
    time_filter = msk_time_filter()
    payments_30d = int(
        _fetch_val(
            f"SELECT COUNT(*) FROM transactions WHERE created_date >= {time_filter}",
            ("-30 days",),
            0,
        )
        or 0
    )
    row = _fetch_row(
        f"SELECT COALESCE(SUM(amount_rub), 0) AS s FROM transactions WHERE created_date >= {time_filter}",
        ("-30 days",),
    )
    revenue_30d = float((row or {}).get("s") or 0)

    return {
        "users_total": users_total,
        "trial_used": trial_used,
        "keys_active": keys_active,
        "payments_30d": payments_30d,
        "revenue_30d": round(revenue_30d, 2),
        "design_stats": design_stats,
        "total_picks": total_picks,
        "popular_design": max(design_stats, key=design_stats.get) if design_stats else None,
    }


def tail_webapp_logs(
    lines: int = 80,
    *,
    level: str = "",
    search: str = "",
) -> list[dict[str, str]]:
    import os

    lines = max(10, min(lines, 500))
    level = (level or "").strip().upper()
    search = (search or "").strip().lower()
    log_files = ["logs/bot.log", "bot.log"]
    raw_lines: list[str] = []

    for log_file in log_files:
        if not os.path.exists(log_file):
            continue
        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as fh:
                all_lines = fh.readlines()
            raw_lines = [ln.rstrip() for ln in all_lines if "[WEBAPP]" in ln]
            break
        except OSError:
            continue

    parsed: list[dict[str, str]] = []
    for ln in raw_lines:
        lvl_match = _LOG_LEVEL_RE.search(ln)
        lvl = (lvl_match.group(1).upper() if lvl_match else "INFO")
        if level and lvl != level:
            continue
        if search and search not in ln.lower():
            continue
        parsed.append({"level": lvl, "text": ln})

    return parsed[-lines:]


def export_webapp_logs_text(entries: list[dict[str, str]]) -> str:
    return "\n".join(e.get("text", "") for e in entries)


def restart_webapp_service() -> dict[str, Any]:
    from shop_bot.webhook_server.context import panel_ctx

    controller = getattr(panel_ctx, "bot_controller", None)
    if not controller or not hasattr(controller, "restart_webapp"):
        return {"ok": False, "error": "Bot controller unavailable"}
    return controller.restart_webapp()
