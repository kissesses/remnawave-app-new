from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.connection import _exec, _fetch_row, _fetch_list, _fetch_val

# ===========================


# ===== GET_SETTING =====
def get_setting(key: str, default: str | None = None) -> str | None:
    row = _fetch_row("SELECT value FROM bot_settings WHERE key = ?", (key,), f"Не удалось получить настройку '{key}'")
    if not row:
        return default
    if key == "panel_password":
        return row["value"]
    from shop_bot.data_manager.secrets_vault import resolve_setting_from_storage
    return resolve_setting_from_storage(key, row["value"])


# =======================


# ===== GET_ADMIN_IDS =====
def get_admin_ids() -> set[int]:
    ids: set[int] = set()
    try:
        single = get_setting("admin_telegram_id")
        if single:
            try:
                ids.add(int(single))
            except Exception:
                pass
        multi_raw = get_setting("admin_telegram_ids")
        if multi_raw:
            s = (multi_raw or "").strip()

            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    for v in arr:
                        try:
                            ids.add(int(v))
                        except Exception:
                            pass
                    return ids
            except Exception:
                pass

            parts = [p for p in re.split(r"[\s,]+", s) if p]
            for p in parts:
                try:
                    ids.add(int(p))
                except Exception:
                    pass
    except Exception as e:
        logging.warning(f"Ошибка get_admin_ids: {e}")
    return ids

# =========================


# ===== IS_ADMIN =====
def is_admin(user_id: int) -> bool:
    try:
        return int(user_id) in get_admin_ids()
    except Exception: return False

# ====================================


# ===== GET_ALL_SETTINGS =====
def get_all_settings() -> dict:
    rows = _fetch_list("SELECT key, value FROM bot_settings", (), "Не удалось получить все настройки")
    from shop_bot.data_manager.secrets_vault import resolve_setting_from_storage
    settings: dict = {}
    for row in rows:
        key = row["key"]
        if key == "panel_password":
            settings[key] = ""
        else:
            settings[key] = resolve_setting_from_storage(key, row["value"])
    return settings


# ============================


# ===== UPDATE_SETTING =====
def update_setting(key: str, value: str):
    from shop_bot.data_manager.secrets_vault import prepare_setting_for_storage
    stored = prepare_setting_for_storage(key, value)
    if stored is None and key == "panel_password":
        return
    cursor = _exec(
        "INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)",
        (key, stored if stored is not None else ""),
        f"Не удалось обновить настройку '{key}'"
    )
    if cursor: logging.info(f"Настройка '{key}' обновлена.")

# ===============================


# ===== GET_OTHER_VALUE =====
def get_other_value(key: str) -> str | None:
    return _fetch_val("SELECT value FROM other WHERE key = ?", (key,), None, f"Не удалось получить other-значение для {key}")

# =========================


# ===== SET_OTHER_VALUE =====
def set_other_value(key: str, value: str) -> bool:
    cursor = _exec(
        "INSERT OR REPLACE INTO other (key, value) VALUES (?, ?)",
        (key, value),
        f"Не удалось установить other-значение для {key}"
    )
    return cursor is not None

# ====================================


# ===== GET_OTHER_SETTING =====
def get_other_setting(key: str, default: Any = None) -> Any:
    val = get_other_value(key)
    return val if val is not None else default

# =========================


# ===== UPDATE_OTHER_SETTING =====
def update_other_setting(key: str, value: Any) -> bool:
    return set_other_value(key, str(value))



def get_all_other_settings() -> dict:
    rows = _fetch_list("SELECT key, value FROM other", (), "Не удалось получить other-настройки")
    return {row['key']: row['value'] for row in rows}


# ===========================================
# ===== WEBAPP SETTINGS =====
# Проверка и получение настроек веб-приложения
def get_webapp_settings() -> dict:
    row = _fetch_row("SELECT * FROM webapp_settings WHERE id = 1")
    return dict(row) if row else {}


# Обновление настроек веб-приложения
def update_webapp_settings(
    webapp_title: str = None,
    webapp_domen: str = None,
    webapp_enable: int = None,
    webapp_logo: str = None,
    webapp_icon: str = None,
    tg_fullscreen: int = None,
    webapp_default_design: str = None,
    webapp_enabled_designs: str = None,
    webapp_theme_picker: int = None,
) -> bool:
    try:
        updates = []
        params = []
        if webapp_title is not None:
            updates.append("webapp_title = ?")
            params.append(webapp_title)
        if webapp_domen is not None:
            updates.append("webapp_domen = ?")
            params.append(webapp_domen)
        if webapp_enable is not None:
            updates.append("webapp_enable = ?")
            params.append(int(webapp_enable))
        if webapp_logo is not None:
            updates.append("webapp_logo = ?")
            params.append(webapp_logo)
        if webapp_icon is not None:
            updates.append("webapp_icon = ?")
            params.append(webapp_icon)
        if tg_fullscreen is not None:
            updates.append("tg_fullscreen = ?")
            params.append(int(tg_fullscreen))
        if webapp_default_design is not None:
            updates.append("webapp_default_design = ?")
            params.append(webapp_default_design)
        if webapp_enabled_designs is not None:
            updates.append("webapp_enabled_designs = ?")
            params.append(webapp_enabled_designs)
        if webapp_theme_picker is not None:
            updates.append("webapp_theme_picker = ?")
            params.append(int(webapp_theme_picker))
        
        if not updates:
            return False
        
        # Строим SQL запрос
        sql = f"UPDATE webapp_settings SET {', '.join(updates)} WHERE id = 1"
        return _exec(sql, tuple(params))
    except Exception as e:
        logging.error(f"Ошибка при обновлении настроек webapp: {e}")
        return False

