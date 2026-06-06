from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.connection import get_db_connection, _exec, _fetch_row, _fetch_list, _exec_with_check, _get_count_stat
from shop_bot.data_manager.db.schema import _ensure_default_button_configs

# ==========================


# ===== GET_BUTTON_CONFIGS =====
def get_button_configs(menu_type: str, include_inactive: bool = False) -> list[dict]:
    query = """
        SELECT * FROM button_configs 
        WHERE menu_type = ? 
        ORDER BY sort_order, row_position, column_position
    """
    if not include_inactive:
        query = """
            SELECT * FROM button_configs 
            WHERE menu_type = ? AND is_active = 1 
            ORDER BY sort_order, row_position, column_position
        """
        
    rows = _fetch_list(query, (menu_type,), f"Не удалось получить конфиг кнопок для {menu_type}")
    
    if not rows and menu_type in ("main_menu", "admin_menu", "profile_menu", "support_menu", "key_info_menu"):
        try:
            count = _get_count_stat("SELECT COUNT(*) as c FROM button_configs")
            if count == 0:
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    _ensure_default_button_configs(cursor)
                    conn.commit()
                rows = _fetch_list(query, (menu_type,), f"Не удалось получить конфиг кнопок для {menu_type}")
        except Exception as e:
            logging.error(f"Не удалось инициализировать дефолтные кнопки: {e}")
            
    return [dict(r) for r in rows]

# ============================


# ===== GET_BUTTON_CONFIG =====
def get_button_config(menu_type: str, button_id: str) -> dict | None:
    row = _fetch_row(
        """
        SELECT * FROM button_configs 
        WHERE menu_type = ? AND button_id = ?
        """,
        (menu_type, button_id),
        f"Не удалось получить конфиг кнопки {menu_type}/{button_id}"
    )
    return dict(row) if row else None


# =============================


# ===== CREATE_BUTTON_CONFIG =====
def create_button_config(menu_type: str, button_id: str, text: str, callback_data: str = None, 
                        url: str = None, row_position: int = 0, column_position: int = 0, 
                        button_width: int = 1, metadata: str = None, 
                        button_color: str = None, emoji_id: str = None) -> bool:
    cursor = _exec(
        """
        INSERT OR REPLACE INTO button_configs 
        (menu_type, button_id, text, callback_data, url, row_position, column_position, button_width, metadata, button_color, emoji_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (menu_type, button_id, text, callback_data, url, row_position, column_position, button_width, metadata, button_color, emoji_id),
        "Не удалось создать конфиг кнопки"
    )
    if cursor: logging.info(f"Конфиг кнопки создан: {menu_type}/{button_id}"); return True
    return False

# ================================


# ===== UPDATE_BUTTON_CONFIG =====
def update_button_config(button_id: int, text: str = None, callback_data: str = None, 
                        url: str = None, row_position: int = None, column_position: int = None, 
                        button_width: int = None, is_active: bool = None, sort_order: int = None, 
                        metadata: str = None, button_color: str = None, emoji_id: str = None) -> bool:
    logging.info(f"update_button_config called for {button_id}: text={text}, callback_data={callback_data}, url={url}, row={row_position}, col={column_position}, active={is_active}, sort={sort_order}")
    
    updates = []
    params = []
    
    if text is not None:
        updates.append("text = ?")
        params.append(text)
    if callback_data is not None:
        updates.append("callback_data = ?")
        params.append(callback_data)
    if url is not None:
        updates.append("url = ?")
        params.append(url)
    if row_position is not None:
        updates.append("row_position = ?")
        params.append(row_position)
    if column_position is not None:
        updates.append("column_position = ?")
        params.append(column_position)
    if button_width is not None:
        updates.append("button_width = ?")
        params.append(button_width)
    if is_active is not None:
        updates.append("is_active = ?")
        params.append(1 if is_active else 0)
    if sort_order is not None:
        updates.append("sort_order = ?")
        params.append(sort_order)
    if metadata is not None:
        updates.append("metadata = ?")
        params.append(metadata)
    if button_color is not None:
        updates.append("button_color = ?")
        params.append(button_color if button_color else None)
    if emoji_id is not None:
        updates.append("emoji_id = ?")
        params.append(emoji_id if emoji_id else None)
    
    if not updates: return True
        
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(button_id)
    
    query = f"UPDATE button_configs SET {', '.join(updates)} WHERE id = ?"
    cursor = _exec(query, params, f"Не удалось обновить конфиг кнопки {button_id}")
    
    if cursor and cursor.rowcount > 0: logging.info(f"Конфиг кнопки {button_id} успешно обновлён"); return True
    if cursor and cursor.rowcount == 0: logging.warning(f"Кнопка с id {button_id} не найдена")
    return False

# ================================


# ===== REORDER_BUTTON_CONFIGS =====
def reorder_button_configs(menu_type: str, button_orders: list[dict]) -> bool:
    try:
        logging.info(f"Reordering {len(button_orders)} buttons for {menu_type}")
        with get_db_connection() as conn:
            cursor = conn.cursor()
            for order_data in button_orders:
                button_id = order_data.get('button_id')
                sort_order = order_data.get('sort_order', 0)
                row_position = order_data.get('row_position', 0)
                column_position = order_data.get('column_position', 0)
                button_width = order_data.get('button_width', None)
                is_active = order_data.get('is_active')
                
                set_clauses = [
                    "sort_order = ?",
                    "row_position = ?",
                    "column_position = ?",
                    "updated_at = CURRENT_TIMESTAMP"
                ]
                query_params = [sort_order, row_position, column_position]

                if button_width is not None:
                    set_clauses.insert(3, "button_width = ?")
                    query_params.insert(3, int(button_width))
                
                if is_active is not None:
                    set_clauses.insert(len(set_clauses)-1, "is_active = ?")
                    query_params.insert(len(query_params), 1 if is_active else 0)

                query_params.append(menu_type)
                query_params.append(button_id)

                cursor.execute(
                    f"""
                    UPDATE button_configs 
                    SET {', '.join(set_clauses)}
                    WHERE menu_type = ? AND button_id = ?
                    """,
                    query_params,
                )
            conn.commit()
            return True
    except Exception as e:
        logging.error(f"Failed to reorder button configs for {menu_type}: {e}")
        return False

# ==================================


# ===== UPDATE_EXISTING_MY_KEYS_BUTTON =====
def update_existing_my_keys_button():
    cursor = _exec(
        "UPDATE button_configs SET button_id = 'my_keys' WHERE button_id = 'keys'",
        (),
        "Не удалось обновить button_id keys -> my_keys",
    )
    return cursor is not None

# ==========================================


# ===== DELETE_BUTTON_CONFIG =====
def delete_button_config(button_id: int) -> bool:
    cursor = _exec("DELETE FROM button_configs WHERE id = ?", (button_id,), f"Не удалось удалить конфиг кнопки {button_id}")
    if cursor: logging.info(f"Конфиг кнопки {button_id} удалён"); return True
    return False

