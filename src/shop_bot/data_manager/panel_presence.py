"""Online presence for panel administrators."""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any

from shop_bot.security.rate_store import _get_redis

logger = logging.getLogger(__name__)

PRESENCE_TTL_SEC = 180
ONLINE_THRESHOLD_SEC = 120
AWAY_THRESHOLD_SEC = 45
SESSION_GAP_SEC = 1800

_memory: dict[int, dict[str, Any]] = {}
_memory_lock = threading.Lock()

PAGE_LABELS: dict[str, str] = {
    "dashboard_page": "Главная",
    "users_page": "Пользователи",
    "admin_keys_page": "Ключи",
    "support_list_page": "Поддержка",
    "support_ticket_page": "Тикет поддержки",
    "button_constructor_page": "Кнопки",
    "node_page": "Ноды",
    "backups_page": "Бэкапы",
    "settings_page": "Настройки",
    "settings_tab_page": "Настройки",
    "settings_smtp_test": "Настройки · SMTP",
    "settings_mail_templates_data": "Mail Studio",
    "settings_mail_templates_save": "Mail Studio",
    "settings_mail_templates_preview": "Mail Studio",
    "settings_mail_templates_test": "Mail Studio",
    "settings_mail_templates_reset": "Mail Studio",
    "admin_presence_json": "Панель",
    "admin_presence_detail_json": "Панель",
    "dashboard_layout_config_json": "Dashboard Studio",
    "dashboard_layout_prefs": "Dashboard Studio",
    "project_info_route": "О проекте",
    "check_updates_route": "Проверка обновлений",
    "update_apply_route": "Обновление",
    "totp_setup_page": "2FA",
    "login_page": "Вход",
}


def _page_label(endpoint: str | None, path: str | None = None) -> str:
    if endpoint and endpoint in PAGE_LABELS:
        return PAGE_LABELS[endpoint]
    if path:
        if path.startswith("/settings"):
            return "Настройки"
        if path.startswith("/support"):
            return "Поддержка"
        if path.startswith("/users"):
            return "Пользователи"
        if path.startswith("/admin/keys"):
            return "Ключи"
    if not endpoint:
        return "Панель"
    return PAGE_LABELS.get(endpoint, "Панель")


def _device_label(user_agent: str | None) -> str:
    ua = (user_agent or "").strip()
    if not ua:
        return ""
    mobile = bool(re.search(r"Mobile|Android|iPhone|iPad", ua, re.I))
    if re.search(r"Edg/", ua):
        return "Edge · моб." if mobile else "Edge"
    if re.search(r"Chrome/", ua) and not re.search(r"Edg/", ua):
        return "Chrome · моб." if mobile else "Chrome"
    if re.search(r"Firefox/", ua):
        return "Firefox · моб." if mobile else "Firefox"
    if re.search(r"Safari/", ua) and not re.search(r"Chrome/", ua):
        return "Safari · моб." if mobile else "Safari"
    return "Мобильный" if mobile else "Браузер"


def _read_row(admin_id: int) -> dict[str, Any] | None:
    client = _get_redis()
    if client:
        try:
            raw = client.get(f"panel:presence:{int(admin_id)}")
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("presence redis read failed: %s", exc)
    with _memory_lock:
        return dict(_memory[int(admin_id)]) if int(admin_id) in _memory else None


def touch(
    admin_id: int,
    *,
    login: str,
    role_name: str | None = None,
    endpoint: str | None = None,
    path: str | None = None,
    user_agent: str | None = None,
) -> None:
    now = time.time()
    prev = _read_row(admin_id) or {}
    last_seen = float(prev.get("last_seen") or 0)
    session_started = float(prev.get("session_started") or now)
    if last_seen and (now - last_seen) > SESSION_GAP_SEC:
        session_started = now
    elif prev.get("session_started"):
        session_started = float(prev["session_started"])

    payload = {
        "admin_id": int(admin_id),
        "login": login or "",
        "role_name": role_name or "",
        "endpoint": endpoint or "",
        "path": (path or "")[:200],
        "page_label": _page_label(endpoint, path),
        "device_label": _device_label(user_agent),
        "session_started": session_started,
        "last_seen": now,
    }
    client = _get_redis()
    if client:
        try:
            key = f"panel:presence:{admin_id}"
            client.setex(key, PRESENCE_TTL_SEC, json.dumps(payload, ensure_ascii=False))
            client.sadd("panel:presence:ids", str(admin_id))
            client.expire("panel:presence:ids", PRESENCE_TTL_SEC)
            return
        except Exception as exc:
            logger.warning("presence redis touch failed: %s", exc)
    with _memory_lock:
        _memory[int(admin_id)] = payload
        cutoff = now - PRESENCE_TTL_SEC
        for aid in list(_memory.keys()):
            if float(_memory[aid].get("last_seen") or 0) < cutoff:
                _memory.pop(aid, None)


def _seconds_ago(last_seen: float | None, now: float) -> int | None:
    if not last_seen:
        return None
    return max(0, int(now - float(last_seen)))


def _presence_status(seconds_ago: int | None) -> str:
    if seconds_ago is None:
        return "offline"
    if seconds_ago <= AWAY_THRESHOLD_SEC:
        return "online"
    if seconds_ago <= ONLINE_THRESHOLD_SEC:
        return "away"
    return "offline"


def _is_online(last_seen: float | None, threshold: int = ONLINE_THRESHOLD_SEC) -> bool:
    if not last_seen:
        return False
    return (time.time() - float(last_seen)) <= threshold


def _iter_presence_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    client = _get_redis()
    if client:
        try:
            ids = client.smembers("panel:presence:ids") or []
            for raw_id in ids:
                key = f"panel:presence:{raw_id}"
                raw = client.get(key)
                if not raw:
                    continue
                try:
                    rows.append(json.loads(raw))
                except json.JSONDecodeError:
                    continue
            return rows
        except Exception as exc:
            logger.warning("presence redis list failed: %s", exc)
    with _memory_lock:
        return [dict(row) for row in _memory.values()]


def _public_row(row: dict[str, Any], now: float) -> dict[str, Any]:
    last_seen = float(row.get("last_seen") or 0)
    ago = _seconds_ago(last_seen, now) if last_seen else None
    status = _presence_status(ago)
    session_started = float(row.get("session_started") or 0)
    session_duration = max(0, int(now - session_started)) if session_started else None
    return {
        "admin_id": int(row.get("admin_id") or 0),
        "login": row.get("login") or "",
        "role_name": row.get("role_name") or "",
        "page_label": row.get("page_label") or _page_label(row.get("endpoint"), row.get("path")),
        "endpoint": row.get("endpoint") or "",
        "path": row.get("path") or "",
        "device_label": row.get("device_label") or "",
        "last_seen": last_seen,
        "online_seconds_ago": ago,
        "session_started": session_started or None,
        "session_duration_sec": session_duration,
        "status": status,
        "online": status in ("online", "away"),
        "active": status == "online",
    }


def presence_by_admin_id() -> dict[int, dict[str, Any]]:
    now = time.time()
    out: dict[int, dict[str, Any]] = {}
    for row in _iter_presence_rows():
        last_seen = float(row.get("last_seen") or 0)
        if not last_seen or (now - last_seen) > PRESENCE_TTL_SEC:
            continue
        pub = _public_row(row, now)
        out[pub["admin_id"]] = pub
    return out


def _sorted_public(rows: list[dict[str, Any]], now: float) -> list[dict[str, Any]]:
    items = [_public_row(row, now) for row in rows]
    status_order = {"online": 0, "away": 1, "offline": 2}
    items.sort(
        key=lambda x: (
            status_order.get(x.get("status"), 9),
            float(x.get("last_seen") or 0) * -1,
            (x.get("login") or "").lower(),
        ),
    )
    return items


def list_online(threshold: int = ONLINE_THRESHOLD_SEC) -> list[dict[str, Any]]:
    threshold = max(30, min(int(threshold), PRESENCE_TTL_SEC))
    now = time.time()
    rows = []
    for row in _iter_presence_rows():
        last_seen = float(row.get("last_seen") or 0)
        if _is_online(last_seen, threshold):
            pub = _public_row(row, now)
            if pub["status"] in ("online", "away"):
                rows.append(row)
    return _sorted_public(rows, now)


def list_away(threshold: int = ONLINE_THRESHOLD_SEC) -> list[dict[str, Any]]:
    now = time.time()
    rows = []
    for row in _iter_presence_rows():
        pub = _public_row(row, now)
        if pub["status"] == "away":
            rows.append(row)
    return _sorted_public(rows, now)


def list_recent_seen(limit: int = 12) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 30))
    now = time.time()
    rows = []
    for row in _iter_presence_rows():
        last_seen = float(row.get("last_seen") or 0)
        if not last_seen or (now - last_seen) > PRESENCE_TTL_SEC:
            continue
        rows.append(row)
    items = _sorted_public(rows, now)
    return items[:limit]


def get_presence(admin_id: int) -> dict[str, Any] | None:
    row = _read_row(admin_id)
    if row:
        return _public_row(row, time.time())
    return None
