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

from shop_bot.data_manager.db.dialect import msk_time_filter, sql_order_datetime
from shop_bot.data_manager.db.connection import (
    DB_FILE,
    _exec,
    _fetch_row,
    _fetch_list,
)





# ==========================================


# ===== INSERT_RESOURCE_METRIC =====
def insert_resource_metric(
    scope: str,
    object_name: str,
    cpu_percent: float | None = None,
    mem_percent: float | None = None,
    disk_percent: float | None = None,
    load1: float | None = None,
    net_bytes_sent: int | None = None,
    net_bytes_recv: int | None = None,
    raw_json: str | None = None
) -> int | None:
    cursor = _exec(
        """
        INSERT INTO resource_metrics (
            scope, object_name, cpu_percent, mem_percent, disk_percent, load1, 
            net_bytes_sent, net_bytes_recv, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            (scope or '').strip(), (object_name or '').strip(),
            cpu_percent, mem_percent, disk_percent, load1, 
            net_bytes_sent, net_bytes_recv, raw_json
        ),
        f"Не удалось сохранить метрики ресурсов scope={scope} object={object_name}"
    )
    return cursor.lastrowid if cursor else None



# ==================================


# ===== GET_LATEST_RESOURCE_METRIC =====
def get_latest_resource_metric(scope: str, object_name: str) -> dict | None:
    return _fetch_row(
        """
        SELECT * FROM resource_metrics
        WHERE scope = ? AND object_name = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        ((scope or '').strip(), (object_name or '').strip()),
        f"Не удалось получить последние метрики ресурсов scope={scope} object={object_name}"
    )



# ======================================


# ===== GET_RESOURCE_METRICS =====
def get_resource_metrics(
    scope: str,
    object_name: str,
    limit: int = 20
) -> list[dict]:
    return _fetch_list(
        f"""
        SELECT *
        FROM resource_metrics
        WHERE scope = ? AND object_name = ?
        ORDER BY {sql_order_datetime('created_at')} DESC
        LIMIT ?
        """,
        ((scope or '').strip(), (object_name or '').strip(), limit),
        f"Не удалось получить метрики ресурсов scope={scope} object={object_name}"
    )



# ==============================


# ===== GET_METRICS_SERIES =====
def get_metrics_series(scope: str, object_name: str, *, since_hours: int = 24, limit: int = 500) -> list[dict]:
    if since_hours == 1:
        hours_filter = 2
    else:
        hours_filter = max(1, int(since_hours))
    
    rows = _fetch_list(
        f'''
        SELECT created_at, cpu_percent, mem_percent, disk_percent, load1
        FROM resource_metrics
        WHERE scope = ? AND object_name = ?
            AND created_at >= {msk_time_filter()}
        ORDER BY created_at ASC
        LIMIT ?
        ''',
        (
            (scope or '').strip(),
            (object_name or '').strip(),
            f'-{hours_filter} hours',
            max(10, int(limit)),
        ),
        f"Не удалось получить серию метрик для {scope}/{object_name}"
    )
    logging.debug(f"get_metrics_series: {scope}/{object_name}, since_hours={since_hours}, found {len(rows)} records")
    return rows

