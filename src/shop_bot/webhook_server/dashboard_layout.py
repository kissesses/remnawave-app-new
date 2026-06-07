"""Dashboard widget registry and layout preferences."""

from __future__ import annotations

import json
import logging
from copy import deepcopy
from typing import Any

from shop_bot.data_manager.remnawave_repository import get_setting, update_setting

logger = logging.getLogger(__name__)

GLOBAL_LAYOUT_KEY = "panel_dashboard_layout"
ADMIN_PREFS_PREFIX = "panel_dashboard_prefs_"

VALID_TABS = ("overview", "analytics", "activity")
WORKSPACE_TABS = ("analytics", "activity")
PINNED_TAB = "overview"
VALID_INCOME_PERIODS = ("today", "7d", "30d", "3m", "6m", "12m", "all")
VALID_STATS_COLUMNS = (2, 3, 4, 5)
VALID_TITLE_SIZES = ("sm", "md", "lg")
VALID_CARD_STYLES = ("glass", "flat", "outline")
VALID_DENSITIES = ("compact", "normal", "relaxed")
VALID_TAB_STYLES = ("glass", "minimal", "solid")

WIDGET_CATALOG: list[dict[str, Any]] = [
    # Header
    {"id": "chip_bot", "tab": "header", "label": "Статус бота", "group": "header", "icon": "smart_toy"},
    {"id": "chip_support", "tab": "header", "label": "Support-бот", "group": "header", "icon": "support_agent"},
    {"id": "chip_tickets", "tab": "header", "label": "Тикеты (ссылка)", "group": "header", "icon": "confirmation_number"},
    {"id": "chip_nodes", "tab": "header", "label": "Ноды (ссылка)", "group": "header", "icon": "hub"},
    # Overview stats
    {"id": "stat_users", "tab": "overview", "label": "Пользователей", "group": "core", "icon": "group"},
    {"id": "stat_keys", "tab": "overview", "label": "Ключей", "group": "core", "icon": "vpn_key"},
    {"id": "stat_earned", "tab": "overview", "label": "Заработано", "group": "core", "icon": "payments"},
    {"id": "stat_hosts", "tab": "overview", "label": "Серверов", "group": "core", "icon": "dns"},
    {"id": "stat_tickets", "tab": "overview", "label": "Тикеты", "group": "core", "icon": "confirmation_number"},
    {"id": "stat_yookassa", "tab": "overview", "label": "YooKassa", "group": "payments", "icon": "account_balance_wallet", "payment": True},
    {"id": "stat_platega", "tab": "overview", "label": "Platega", "group": "payments", "icon": "credit_card", "payment": True},
    {"id": "stat_stars", "tab": "overview", "label": "TG Stars", "group": "payments", "icon": "grade", "payment": True},
    {"id": "stat_cryptobot", "tab": "overview", "label": "CryptoBot", "group": "payments", "icon": "currency_bitcoin", "payment": True},
    {"id": "stat_heleket_ton", "tab": "overview", "label": "Heleket / Ton", "group": "payments", "icon": "payments", "payment": True},
    {"id": "stat_no_purchases", "tab": "overview", "label": "Не купили ключ", "group": "segments", "icon": "person_off"},
    {"id": "stat_inactive_buyers", "tab": "overview", "label": "Нет активных", "group": "segments", "icon": "history"},
    {"id": "stat_trials", "tab": "overview", "label": "На триале", "group": "segments", "icon": "card_giftcard"},
    {"id": "stat_active_buyers", "tab": "overview", "label": "Купили ключ", "group": "segments", "icon": "verified_user"},
    {"id": "stat_active_keys", "tab": "overview", "label": "Активные ключи", "group": "segments", "icon": "vpn_key"},
    # Analytics
    {"id": "analytics_income", "tab": "analytics", "label": "Аналитика доходов", "group": "charts", "icon": "payments"},
    {"id": "analytics_users", "tab": "analytics", "label": "Новые пользователи", "group": "charts", "icon": "person_add"},
    {"id": "analytics_keys", "tab": "analytics", "label": "Новые ключи", "group": "charts", "icon": "vpn_key"},
    # Activity
    {"id": "activity_speedtest", "tab": "activity", "label": "Speedtest SSH", "group": "activity", "icon": "speed"},
    {"id": "activity_transactions", "tab": "activity", "label": "Транзакции", "group": "activity", "icon": "receipt_long"},
    {"id": "activity_trials", "tab": "activity", "label": "Триалы", "group": "activity", "icon": "card_giftcard"},
]

WIDGET_IDS = frozenset(w["id"] for w in WIDGET_CATALOG)

WIDGET_GROUPS: dict[str, str] = {
    "header": "Шапка",
    "core": "Основные метрики",
    "payments": "Платежи",
    "segments": "Сегменты пользователей",
    "charts": "Графики",
    "activity": "Активность",
}

TAB_LABELS: dict[str, str] = {
    "overview": "KPI на главной",
    "analytics": "Аналитика",
    "activity": "Активность",
}


def _default_widgets_for_tab(tab: str) -> list[str]:
    return [w["id"] for w in WIDGET_CATALOG if w["tab"] == tab]


def default_layout() -> dict[str, Any]:
    return {
        "tabs": list(WORKSPACE_TABS),
        "widgets": {tab: _default_widgets_for_tab(tab) for tab in VALID_TABS},
        "header_widgets": _default_widgets_for_tab("header"),
        "options": {
            "title": "",
            "subtitle": "",
            "default_tab": "analytics",
            "stats_columns": 5,
            "hide_payments_default": False,
            "default_income_period": "30d",
            "refresh_interval_ms": 120000,
            "compact_header": False,
            "show_eyebrow": True,
            "title_size": "md",
            "stats_density": "normal",
            "stats_card_style": "glass",
            "tab_style": "glass",
            "content_density": "normal",
        },
    }


def _sanitize_widget_list(items: Any, *, allowed: frozenset[str] | None = None) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for raw in items:
        wid = str(raw or "").strip()
        if not wid or wid in out:
            continue
        if allowed and wid not in allowed:
            continue
        if wid not in WIDGET_IDS:
            continue
        out.append(wid)
    return out


def normalize_layout(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = default_layout()
    if not isinstance(raw, dict):
        return base

    tabs = _sanitize_widget_list(raw.get("tabs"))
    tabs = [t for t in tabs if t in VALID_TABS] or list(WORKSPACE_TABS)
    tabs = [t for t in tabs if t in WORKSPACE_TABS and t != 'resources'] or list(WORKSPACE_TABS)

    widgets_in: dict[str, Any] = raw.get("widgets") if isinstance(raw.get("widgets"), dict) else {}
    widgets: dict[str, list[str]] = {}
    for tab in VALID_TABS:
        incoming = widgets_in.get(tab)
        cleaned = _sanitize_widget_list(incoming)
        widgets[tab] = cleaned or _default_widgets_for_tab(tab)

    header_widgets = _sanitize_widget_list(raw.get("header_widgets"))
    if not header_widgets:
        header_widgets = _default_widgets_for_tab("header")

    opts_in = raw.get("options") if isinstance(raw.get("options"), dict) else {}
    options = deepcopy(base["options"])
    title = str(opts_in.get("title") or "").strip()[:120]
    subtitle = str(opts_in.get("subtitle") or "").strip()[:200]
    if title:
        options["title"] = title
    if subtitle:
        options["subtitle"] = subtitle

    default_tab = str(opts_in.get("default_tab") or "analytics")
    if default_tab in ("overview", "resources"):
        default_tab = "analytics"
    if default_tab not in WORKSPACE_TABS:
        default_tab = "analytics"
    options["default_tab"] = default_tab

    try:
        cols = int(opts_in.get("stats_columns", options["stats_columns"]))
    except (TypeError, ValueError):
        cols = 5
    if cols not in VALID_STATS_COLUMNS:
        cols = 5
    options["stats_columns"] = cols

    options["hide_payments_default"] = bool(opts_in.get("hide_payments_default", False))

    period = str(opts_in.get("default_income_period") or "30d")
    if period not in VALID_INCOME_PERIODS:
        period = "30d"
    options["default_income_period"] = period

    try:
        refresh = int(opts_in.get("refresh_interval_ms", options["refresh_interval_ms"]))
    except (TypeError, ValueError):
        refresh = 120000
    options["refresh_interval_ms"] = max(30_000, min(refresh, 600_000))

    options["compact_header"] = bool(opts_in.get("compact_header", False))

    options["show_eyebrow"] = bool(opts_in.get("show_eyebrow", True))

    title_size = str(opts_in.get("title_size") or "md")
    if title_size not in VALID_TITLE_SIZES:
        title_size = "md"
    options["title_size"] = title_size

    stats_density = str(opts_in.get("stats_density") or "normal")
    if stats_density not in VALID_DENSITIES:
        stats_density = "normal"
    options["stats_density"] = stats_density

    card_style = str(opts_in.get("stats_card_style") or "glass")
    if card_style not in VALID_CARD_STYLES:
        card_style = "glass"
    options["stats_card_style"] = card_style

    tab_style = str(opts_in.get("tab_style") or "glass")
    if tab_style not in VALID_TAB_STYLES:
        tab_style = "glass"
    options["tab_style"] = tab_style

    content_density = str(opts_in.get("content_density") or "normal")
    if content_density not in VALID_DENSITIES:
        content_density = "normal"
    options["content_density"] = content_density

    return {
        "tabs": tabs,
        "widgets": widgets,
        "header_widgets": header_widgets,
        "options": options,
    }


def _load_json_setting(key: str) -> dict[str, Any] | None:
    raw = get_setting(key)
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def get_global_layout() -> dict[str, Any]:
    stored = _load_json_setting(GLOBAL_LAYOUT_KEY)
    return normalize_layout(stored)


def get_admin_layout(admin_id: int | str | None) -> dict[str, Any]:
    global_layout = get_global_layout()
    if admin_id is None:
        return global_layout
    stored = _load_json_setting(f"{ADMIN_PREFS_PREFIX}{admin_id}")
    if not stored:
        return global_layout
    merged = deepcopy(global_layout)
    admin_norm = normalize_layout(stored)
    merged["tabs"] = admin_norm["tabs"]
    merged["widgets"] = admin_norm["widgets"]
    merged["header_widgets"] = admin_norm["header_widgets"]
    merged["options"] = {**global_layout["options"], **admin_norm["options"]}
    return normalize_layout(merged)


def save_admin_layout(admin_id: int | str, layout: dict[str, Any]) -> dict[str, Any]:
    clean = normalize_layout(layout)
    key = f"{ADMIN_PREFS_PREFIX}{admin_id}"
    update_setting(key, json.dumps(clean, ensure_ascii=False))
    return clean


def save_global_layout(layout: dict[str, Any]) -> dict[str, Any]:
    clean = normalize_layout(layout)
    update_setting(GLOBAL_LAYOUT_KEY, json.dumps(clean, ensure_ascii=False))
    return clean


def reset_admin_layout(admin_id: int | str) -> None:
    key = f"{ADMIN_PREFS_PREFIX}{admin_id}"
    update_setting(key, "")


def catalog_for_client() -> dict[str, Any]:
    return {
        "widgets": WIDGET_CATALOG,
        "groups": WIDGET_GROUPS,
        "tabs": [{"id": t, "label": TAB_LABELS[t]} for t in WORKSPACE_TABS],
        "pinned_tab": {"id": PINNED_TAB, "label": TAB_LABELS[PINNED_TAB]},
        "defaults": default_layout(),
    }
