"""Panel administrators and roles storage."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from typing import Any

from shop_bot.data_manager.database import DB_FILE, get_setting, get_db_connection
from shop_bot.data_manager.db.dialect import adapt_sql, first_col, is_postgresql
from shop_bot.data_manager.panel_rbac import (
    ALL_PERMISSIONS,
    DEFAULT_OPERATOR_PERMISSIONS,
    ROLE_PRESETS,
    count_levels,
    full_edit_levels,
    normalize_permission_levels,
    permission_keys,
)
from shop_bot.data_manager.secrets_vault import prepare_setting_for_storage, verify_panel_password

logger = logging.getLogger(__name__)

SUPERADMIN_ROLE_NAME = "Superadmin"
OPERATOR_ROLE_NAME = "Оператор"

_panel_access_lock = threading.Lock()
_panel_access_ready = False


def _connect():
    return get_db_connection()


def _row_to_role(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    raw = json.loads(row["permissions"] or "[]")
    levels = full_edit_levels() if bool(row["is_superadmin"]) else normalize_permission_levels(raw)
    view_n, edit_n = count_levels(levels)
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "permissions": permission_keys(levels),
        "permission_levels": levels,
        "perm_view_count": view_n,
        "perm_edit_count": edit_n,
        "is_superadmin": bool(row["is_superadmin"]),
        "created_at": row["created_at"],
    }


def _row_to_admin(row: sqlite3.Row | None, role: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not row:
        return None
    if role:
        levels = role.get("permission_levels") or normalize_permission_levels(role.get("permissions"))
    else:
        levels = normalize_permission_levels(json.loads(row["permissions"] or "[]"))
        if bool(row["is_superadmin"]):
            levels = full_edit_levels()
    return {
        "id": row["id"],
        "login": row["login"],
        "role_id": row["role_id"],
        "role_name": role["name"] if role else row["role_name"],
        "is_active": bool(row["is_active"]),
        "is_superadmin": bool(role["is_superadmin"]) if role else bool(row["is_superadmin"]),
        "permissions": permission_keys(levels),
        "permission_levels": levels,
        "telegram_user_id": row["telegram_user_id"] if "telegram_user_id" in row.keys() else None,
        "telegram_username": row["telegram_username"] if "telegram_username" in row.keys() else None,
        "auth_security_method": row["auth_security_method"] if "auth_security_method" in row.keys() else "none",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def ensure_panel_access_schema(cursor: sqlite3.Cursor) -> None:
    if is_postgresql():
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS panel_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            permissions TEXT NOT NULL DEFAULT '[]',
            is_superadmin INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS panel_admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role_id INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(role_id) REFERENCES panel_roles(id)
        )
        """
    )


def _ensure_default_roles(cursor: sqlite3.Cursor) -> int:
    cursor.execute("SELECT id FROM panel_roles WHERE is_superadmin = 1 LIMIT 1")
    row = cursor.fetchone()
    if row:
        return int(first_col(row, 0))

    insert_sql = adapt_sql(
        """
        INSERT INTO panel_roles (name, description, permissions, is_superadmin)
        VALUES (?, ?, ?, 1)
        """
    )
    if is_postgresql():
        insert_sql = insert_sql.rstrip() + " RETURNING id"
    cursor.execute(
        insert_sql,
        (SUPERADMIN_ROLE_NAME, "Полный доступ ко всем разделам", json.dumps(full_edit_levels(), ensure_ascii=False)),
    )
    if is_postgresql():
        inserted = cursor.fetchone()
        superadmin_id = int(first_col(inserted, 0))
    else:
        superadmin_id = int(cursor.lastrowid)

    cursor.execute(
        adapt_sql(
            """
            INSERT OR IGNORE INTO panel_roles (name, description, permissions, is_superadmin)
            VALUES (?, ?, ?, 0)
            """
        ),
        (
            OPERATOR_ROLE_NAME,
            "Базовый доступ к пользователям и ключам",
            json.dumps({k: "edit" for k in DEFAULT_OPERATOR_PERMISSIONS}, ensure_ascii=False),
        ),
    )
    return superadmin_id


def migrate_legacy_panel_admin(cursor: sqlite3.Cursor) -> None:
    cursor.execute("SELECT COUNT(*) FROM panel_admins")
    if int(first_col(cursor.fetchone(), 0)) > 0:
        return

    login = (get_setting("panel_login") or "").strip()
    password_hash = (get_setting("panel_password") or "").strip()
    if not login or not password_hash:
        return

    superadmin_id = _ensure_default_roles(cursor)
    cursor.execute(
        """
        INSERT INTO panel_admins (login, password_hash, role_id, is_active)
        VALUES (?, ?, ?, 1)
        """,
        (login, password_hash, superadmin_id),
    )
    logger.info("Migrated legacy panel admin '%s' into panel_admins", login)


def ensure_panel_access_migrated() -> None:
    global _panel_access_ready
    if _panel_access_ready:
        return
    with _panel_access_lock:
        if _panel_access_ready:
            return
        with _connect() as conn:
            cursor = conn.cursor()
            ensure_panel_access_schema(cursor)
            from shop_bot.data_manager.panel_telegram_auth import ensure_telegram_auth_schema
            from shop_bot.data_manager.panel_totp import ensure_totp_schema
            from shop_bot.data_manager.panel_webauthn import ensure_webauthn_schema
            from shop_bot.data_manager.panel_security import ensure_security_schema

            ensure_totp_schema(cursor)
            ensure_telegram_auth_schema(cursor)
            ensure_webauthn_schema(cursor)
            ensure_security_schema(cursor)
            from shop_bot.data_manager.panel_admin_invites import ensure_invites_schema

            ensure_invites_schema(cursor)
            _ensure_default_roles(cursor)
            migrate_legacy_panel_admin(cursor)
            conn.commit()
        _panel_access_ready = True


def list_roles() -> list[dict[str, Any]]:
    ensure_panel_access_migrated()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT r.*, (SELECT COUNT(*) FROM panel_admins a WHERE a.role_id = r.id) AS admin_count "
            "FROM panel_roles r ORDER BY r.is_superadmin DESC, r.name COLLATE NOCASE"
        ).fetchall()
        result = []
        for row in rows:
            role = _row_to_role(row)
            if role:
                role["admin_count"] = int(row["admin_count"])
                result.append(role)
        return result


def get_role(role_id: int) -> dict[str, Any] | None:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM panel_roles WHERE id = ?", (role_id,)).fetchone()
        return _row_to_role(row)


def save_role(
    *,
    role_id: int | None,
    name: str,
    description: str,
    permissions: list[str] | None = None,
    permission_levels: dict[str, str] | None = None,
    is_superadmin: bool = False,
) -> tuple[bool, str]:
    ensure_panel_access_migrated()
    name = (name or "").strip()
    if len(name) < 2:
        return False, "Название роли: минимум 2 символа"

    if is_superadmin:
        stored_levels = full_edit_levels()
    elif permission_levels is not None:
        stored_levels = normalize_permission_levels(permission_levels)
    else:
        stored_levels = normalize_permission_levels(permissions or [])

    with _connect() as conn:
        cursor = conn.cursor()
        if role_id:
            existing = cursor.execute("SELECT * FROM panel_roles WHERE id = ?", (role_id,)).fetchone()
            if not existing:
                return False, "Роль не найдена"
            if existing["is_superadmin"] and not is_superadmin:
                return False, "Роль Superadmin нельзя ограничить"
            cursor.execute(
                """
                UPDATE panel_roles
                SET name = ?, description = ?, permissions = ?, is_superadmin = ?
                WHERE id = ?
                """,
                (name, description.strip(), json.dumps(stored_levels, ensure_ascii=False), int(is_superadmin), role_id),
            )
        else:
            cursor.execute(
                """
                INSERT INTO panel_roles (name, description, permissions, is_superadmin)
                VALUES (?, ?, ?, ?)
                """,
                (name, description.strip(), json.dumps(stored_levels, ensure_ascii=False), int(is_superadmin)),
            )
        conn.commit()
    return True, "Роль сохранена"


def delete_role(role_id: int) -> tuple[bool, str]:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM panel_roles WHERE id = ?", (role_id,)).fetchone()
        if not row:
            return False, "Роль не найдена"
        if row["is_superadmin"]:
            return False, "Роль Superadmin нельзя удалить"
        count = int(first_col(conn.execute("SELECT COUNT(*) FROM panel_admins WHERE role_id = ?", (role_id,)).fetchone(), 0))
        if int(count) > 0:
            return False, "Сначала переназначьте или удалите администраторов с этой ролью"
        conn.execute("DELETE FROM panel_roles WHERE id = ?", (role_id,))
        conn.commit()
    return True, "Роль удалена"


def duplicate_role(role_id: int) -> tuple[bool, str, int | None]:
    ensure_panel_access_migrated()
    source = get_role(role_id)
    if not source:
        return False, "Роль не найдена", None
    if source.get("is_superadmin"):
        return False, "Superadmin нельзя копировать", None

    base_name = f"{source['name']} (копия)"
    name = base_name
    suffix = 2
    existing_names = {r["name"].lower() for r in list_roles()}
    while name.lower() in existing_names:
        name = f"{base_name} {suffix}"
        suffix += 1

    with _connect() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO panel_roles (name, description, permissions, is_superadmin)
            VALUES (?, ?, ?, 0)
            """,
            (
                name,
                (source.get("description") or "").strip(),
                json.dumps(source.get("permission_levels") or normalize_permission_levels(source.get("permissions")), ensure_ascii=False),
            ),
        )
        new_id = int(cursor.lastrowid)
        conn.commit()
    return True, f"Роль «{name}» создана", new_id


def list_admins() -> list[dict[str, Any]]:
    ensure_panel_access_migrated()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT a.*, r.name AS role_name, r.permissions, r.is_superadmin
            FROM panel_admins a
            JOIN panel_roles r ON r.id = a.role_id
            ORDER BY a.login COLLATE NOCASE
            """
        ).fetchall()
        return [_row_to_admin(row) for row in rows if row]


def get_admin(admin_id: int) -> dict[str, Any] | None:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT a.*, r.name AS role_name, r.permissions, r.is_superadmin
            FROM panel_admins a
            JOIN panel_roles r ON r.id = a.role_id
            WHERE a.id = ?
            """,
            (admin_id,),
        ).fetchone()
        return _row_to_admin(row)


def get_admin_by_login(login: str) -> dict[str, Any] | None:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT a.*, r.name AS role_name, r.permissions, r.is_superadmin
            FROM panel_admins a
            JOIN panel_roles r ON r.id = a.role_id
            WHERE lower(a.login) = lower(?) AND a.is_active = 1
            """,
            ((login or "").strip(),),
        ).fetchone()
        return _row_to_admin(row)


def get_admin_by_telegram_user_id(telegram_user_id: int) -> dict[str, Any] | None:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT a.*, r.name AS role_name, r.permissions, r.is_superadmin
            FROM panel_admins a
            JOIN panel_roles r ON r.id = a.role_id
            WHERE a.telegram_user_id = ? AND a.is_active = 1
            """,
            (int(telegram_user_id),),
        ).fetchone()
        return _row_to_admin(row)


def save_admin(
    *,
    admin_id: int | None,
    login: str,
    password: str | None,
    role_id: int,
    is_active: bool = True,
    forbid_superadmin_role: bool = False,
) -> tuple[bool, str]:
    ensure_panel_access_migrated()
    login = (login or "").strip()
    if len(login) < 3:
        return False, "Логин: минимум 3 символа"
    if admin_id is None and (not password or len(password) < 16):
        return False, "Пароль: минимум 16 символов"
    if password and len(password) < 16:
        return False, "Пароль: минимум 16 символов"

    role = get_role(role_id)
    if not role:
        return False, "Роль не найдена"
    if forbid_superadmin_role and role.get("is_superadmin"):
        return False, "Роль Superadmin нельзя назначить по приглашению"

    with _connect() as conn:
        cursor = conn.cursor()
        if admin_id:
            existing = cursor.execute("SELECT * FROM panel_admins WHERE id = ?", (admin_id,)).fetchone()
            if not existing:
                return False, "Администратор не найден"
            if password:
                password_hash = prepare_setting_for_storage("panel_password", password)
            else:
                password_hash = existing["password_hash"]
            cursor.execute(
                """
                UPDATE panel_admins
                SET login = ?, password_hash = ?, role_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (login, password_hash, role_id, int(is_active), admin_id),
            )
        else:
            password_hash = prepare_setting_for_storage("panel_password", password or "")
            cursor.execute(
                """
                INSERT INTO panel_admins (login, password_hash, role_id, is_active)
                VALUES (?, ?, ?, ?)
                """,
                (login, password_hash, role_id, int(is_active)),
            )
        conn.commit()

    update_setting_panel_login_sync(login)
    return True, "Администратор сохранён"


def delete_admin(admin_id: int, *, current_admin_id: int | None = None) -> tuple[bool, str]:
    ensure_panel_access_migrated()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT a.*, r.is_superadmin
            FROM panel_admins a
            JOIN panel_roles r ON r.id = a.role_id
            WHERE a.id = ?
            """,
            (admin_id,),
        ).fetchone()
        if not row:
            return False, "Администратор не найден"
        if current_admin_id and admin_id == current_admin_id:
            return False, "Нельзя удалить собственную учётную запись"
        if row["is_superadmin"]:
            count = int(first_col(conn.execute(
                """
                SELECT COUNT(*)
                FROM panel_admins a
                JOIN panel_roles r ON r.id = a.role_id
                WHERE r.is_superadmin = 1 AND a.is_active = 1
                """
            ).fetchone(), 0))
            if int(count) <= 1:
                return False, "Нельзя удалить последнего Superadmin"
        conn.execute("DELETE FROM panel_admins WHERE id = ?", (admin_id,))
        conn.commit()
    return True, "Администратор удалён"


def create_initial_admin(login: str, password: str) -> None:
    ensure_panel_access_migrated()
    with _connect() as conn:
        cursor = conn.cursor()
        superadmin_id = _ensure_default_roles(cursor)
        password_hash = prepare_setting_for_storage("panel_password", password)
        cursor.execute("DELETE FROM panel_admins")
        cursor.execute(
            """
            INSERT INTO panel_admins (login, password_hash, role_id, is_active)
            VALUES (?, ?, ?, 1)
            """,
            (login.strip(), password_hash, superadmin_id),
        )
        conn.commit()
    update_setting_panel_login_sync(login)


def update_setting_panel_login_sync(login: str) -> None:
    from shop_bot.data_manager.database import update_setting

    update_setting("panel_login", login.strip())


def authenticate(login: str, password: str) -> dict[str, Any] | None:
    admin = get_admin_by_login(login)
    if not admin:
        return None
    with _connect() as conn:
        row = conn.execute("SELECT password_hash FROM panel_admins WHERE id = ?", (admin["id"],)).fetchone()
    if not row or not verify_panel_password(row["password_hash"], password or ""):
        return None
    return admin


def session_payload(admin: dict[str, Any]) -> dict[str, Any]:
    if admin.get("is_superadmin"):
        levels = full_edit_levels()
    else:
        levels = normalize_permission_levels(admin.get("permission_levels") or admin.get("permissions"))
    return {
        "panel_admin_id": admin["id"],
        "panel_login": admin["login"],
        "panel_role_name": admin.get("role_name"),
        "panel_is_superadmin": bool(admin.get("is_superadmin")),
        "panel_permissions": permission_keys(levels),
        "panel_permission_levels": levels,
    }
