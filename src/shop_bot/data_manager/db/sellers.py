from __future__ import annotations

import sqlite3
import time
from datetime import datetime, timezone, timedelta
import logging
from pathlib import Path
import json
import re
from typing import Any

logger = logging.getLogger(__name__)

from shop_bot.data_manager.db.connection import DB_FILE, _exec, _fetch_row, _exec_with_check

# ===========================


# ===== ADD_SELLER_USER =====
def add_seller_user(user_id: int, seller_sale: float = 0, seller_ref: float = 0, seller_uuid: str = "0") -> int | None:
    cursor = _exec(
        """
        INSERT OR REPLACE INTO seller_users (user_id, seller_sale, seller_ref, seller_uuid) 
        VALUES (?, ?, ?, ?)
        """,
        (user_id, seller_sale, seller_ref, str(seller_uuid)),
        "Не удалось добавить продавца"
    )
    return cursor.lastrowid if cursor else None


# =======================


# ===== GET_SELLER_USER =====
def get_seller_user(user_id: int) -> dict | None:
    row = _fetch_row("SELECT * FROM seller_users WHERE user_id = ?", (user_id,), f"Не удалось получить продавца {user_id}")
    if not row:
        return {
            "user_id": user_id,
            "seller_sale": 0.0,
            "seller_ref": 0.0,
            "seller_uuid": "0",
        }
    return row


# =======================


# ===== DELETE_SELLER_USER =====
def delete_seller_user(user_id: int) -> bool:
    cursor = _exec("DELETE FROM seller_users WHERE user_id = ?", (user_id,), f"Не удалось удалить продавца {user_id}")
    return cursor is not None

