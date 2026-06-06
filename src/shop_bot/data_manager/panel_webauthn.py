"""WebAuthn / Passkey authentication for panel administrators."""

from __future__ import annotations

import base64
import json
import logging
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse, urlunparse

from flask import Request

from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import first_col
from shop_bot.data_manager.remnawave_repository import get_setting

logger = logging.getLogger(__name__)

try:
    from webauthn import (
        generate_authentication_options,
        generate_registration_options,
        verify_authentication_response,
        verify_registration_response,
        options_to_json,
    )
    from webauthn.helpers import (
        bytes_to_base64url,
        base64url_to_bytes,
        parse_authentication_credential_json,
        parse_registration_credential_json,
    )
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    WEBAUTHN_AVAILABLE = True
except ImportError:
    WEBAUTHN_AVAILABLE = False


def _connect():
    return get_db_connection()


def is_login_enabled() -> bool:
    return (get_setting("passkey_login_enabled") or "0") == "1"


def is_available() -> bool:
    return WEBAUTHN_AVAILABLE


def ensure_webauthn_schema(cursor: sqlite3.Cursor) -> None:
    from shop_bot.data_manager.db.dialect import is_postgresql

    if is_postgresql():
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS panel_webauthn_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            credential_id TEXT NOT NULL UNIQUE,
            public_key TEXT NOT NULL,
            sign_count INTEGER NOT NULL DEFAULT 0,
            transports TEXT DEFAULT '[]',
            label TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP,
            FOREIGN KEY(admin_id) REFERENCES panel_admins(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_panel_webauthn_admin ON panel_webauthn_credentials(admin_id)"
    )


def _require_webauthn() -> None:
    if not WEBAUTHN_AVAILABLE:
        raise RuntimeError("Библиотека webauthn не установлена")


def _normalize_origin(origin: str) -> str:
    """Strip default ports (:443 / :80) so origin matches browser WebAuthn origin."""
    origin = (origin or "").strip().rstrip("/")
    if not origin:
        return origin
    parsed = urlparse(origin)
    if not parsed.scheme or not parsed.netloc:
        return origin
    host = parsed.hostname or ""
    port = parsed.port
    scheme = parsed.scheme.lower()
    if (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        netloc = host
    elif port:
        netloc = f"{host}:{port}"
    else:
        netloc = host
    return urlunparse((scheme, netloc, "", "", "", ""))


def _origin_from_request(request: Request) -> str:
    scheme = (request.headers.get("X-Forwarded-Proto") or request.scheme or "https").split(",")[0].strip().lower()
    host = (request.headers.get("X-Forwarded-Host") or request.host or "").split(",")[0].strip()
    port_hdr = (request.headers.get("X-Forwarded-Port") or "").split(",")[0].strip()
    if host and ":" not in host and port_hdr.isdigit():
        port = int(port_hdr)
        if (scheme == "https" and port != 443) or (scheme == "http" and port != 80):
            host = f"{host}:{port}"
    return _normalize_origin(f"{scheme}://{host}")


def rp_config(request: Request | None = None) -> tuple[str, str, str]:
    """Return (rp_id, rp_name, origin)."""
    rp_id = (os.getenv("SHOPBOT_RP_ID") or "").strip()
    origin = _normalize_origin((os.getenv("SHOPBOT_RP_ORIGIN") or "").strip())
    if request and not rp_id:
        host = (request.headers.get("X-Forwarded-Host") or request.host or "").split(",")[0].strip()
        rp_id = (host.split(":")[0] if host else "") or "localhost"
    if request and not origin:
        origin = _origin_from_request(request)
    rp_id = (rp_id.split(":")[0] if rp_id else "") or "localhost"
    rp_name = (get_setting("panel_brand_title") or "Remnawave ShopBot").strip()
    return rp_id, rp_name, origin


def _parse_transports(raw: str | list | None) -> list[AuthenticatorTransport] | None:
    """Convert stored JSON/string transports to AuthenticatorTransport enums."""
    if raw is None:
        return None
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if not parsed:
        return None
    result: list[AuthenticatorTransport] = []
    for item in parsed:
        if isinstance(item, AuthenticatorTransport):
            result.append(item)
            continue
        if not isinstance(item, str):
            continue
        try:
            result.append(AuthenticatorTransport(item))
        except ValueError:
            logger.debug("Ignoring unknown WebAuthn transport: %s", item)
    return result or None


def _credential_descriptor(credential_id: str, transports_raw: str | list | None) -> PublicKeyCredentialDescriptor:
    return PublicKeyCredentialDescriptor(
        id=base64url_to_bytes(credential_id),
        transports=_parse_transports(transports_raw),
    )


def _admin_user_id(admin_id: int) -> bytes:
    return int(admin_id).to_bytes(8, byteorder="big", signed=False)


def list_credentials(admin_id: int) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, label, created_at, last_used_at
            FROM panel_webauthn_credentials
            WHERE admin_id = ?
            ORDER BY created_at DESC
            """,
            (admin_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "label": row["label"] or "Passkey",
            "created_at": row["created_at"],
            "last_used_at": row["last_used_at"],
        }
        for row in rows
    ]


def delete_credential(admin_id: int, credential_row_id: int) -> tuple[bool, str]:
    from shop_bot.data_manager.panel_security import can_delete_passkey

    with _connect() as conn:
        count = int(first_col(conn.execute(
            "SELECT COUNT(*) FROM panel_webauthn_credentials WHERE admin_id = ?",
            (admin_id,),
        ).fetchone(), 0))
        row = conn.execute(
            "SELECT id FROM panel_webauthn_credentials WHERE id = ? AND admin_id = ?",
            (credential_row_id, admin_id),
        ).fetchone()
        if not row:
            return False, "Passkey не найден"
        ok, message = can_delete_passkey(admin_id, remaining_count=int(count) - 1)
        if not ok:
            return False, message
        conn.execute("DELETE FROM panel_webauthn_credentials WHERE id = ?", (credential_row_id,))
        conn.commit()
    return True, "Passkey удалён"


def begin_registration(admin_id: int, login: str, request: Request) -> dict[str, Any]:
    _require_webauthn()
    rp_id, rp_name, origin = rp_config(request)

    existing = []
    with _connect() as conn:
        rows = conn.execute(
            "SELECT credential_id, transports FROM panel_webauthn_credentials WHERE admin_id = ?",
            (admin_id,),
        ).fetchall()
        for row in rows:
            existing.append(_credential_descriptor(row["credential_id"], row["transports"]))

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=_admin_user_id(admin_id),
        user_name=login,
        user_display_name=login,
        exclude_credentials=existing,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    return {
        "options": json.loads(options_to_json(options)),
        "challenge": bytes_to_base64url(options.challenge),
        "rp_id": rp_id,
        "origin": origin,
    }


def complete_registration(
    admin_id: int,
    *,
    challenge_b64: str,
    credential: dict[str, Any],
    label: str,
    request: Request,
) -> tuple[bool, str]:
    _require_webauthn()
    rp_id, _, origin = rp_config(request)
    try:
        reg_cred = parse_registration_credential_json(json.dumps(credential))
        verification = verify_registration_response(
            credential=reg_cred,
            expected_challenge=base64url_to_bytes(challenge_b64),
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True,
        )
    except Exception as exc:
        logger.warning("Passkey registration failed: %s", exc)
        return False, "Не удалось зарегистрировать passkey"

    cred_id = bytes_to_base64url(verification.credential_id)
    public_key = bytes_to_base64url(verification.credential_public_key)
    transports = json.dumps(credential.get("response", {}).get("transports") or [])

    with _connect() as conn:
        dup = conn.execute(
            "SELECT id FROM panel_webauthn_credentials WHERE credential_id = ?",
            (cred_id,),
        ).fetchone()
        if dup:
            return False, "Этот passkey уже зарегистрирован"
        conn.execute(
            """
            INSERT INTO panel_webauthn_credentials
            (admin_id, credential_id, public_key, sign_count, transports, label)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                admin_id,
                cred_id,
                public_key,
                int(verification.sign_count),
                transports,
                (label or "Passkey").strip()[:64],
            ),
        )
        conn.commit()
    return True, "Passkey добавлен"


def begin_authentication(request: Request, *, admin_id: int | None = None) -> dict[str, Any]:
    _require_webauthn()
    rp_id, _, origin = rp_config(request)

    allow_credentials = []
    with _connect() as conn:
        if admin_id is not None:
            rows = conn.execute(
                """
                SELECT c.credential_id, c.transports
                FROM panel_webauthn_credentials c
                JOIN panel_admins a ON a.id = c.admin_id
                WHERE c.admin_id = ? AND a.is_active = 1
                """,
                (int(admin_id),),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT credential_id, transports FROM panel_webauthn_credentials"
            ).fetchall()
        for row in rows:
            allow_credentials.append(_credential_descriptor(row["credential_id"], row["transports"]))
    if admin_id is not None and not allow_credentials:
        raise RuntimeError("Для этой учётной записи passkey не настроен")

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    return {
        "options": json.loads(options_to_json(options)),
        "challenge": bytes_to_base64url(options.challenge),
        "origin": origin,
        "rp_id": rp_id,
    }


def complete_authentication(
    *,
    challenge_b64: str,
    credential: dict[str, Any],
    request: Request,
) -> tuple[dict[str, Any] | None, str]:
    """Return (admin_dict, error_message)."""
    _require_webauthn()
    from shop_bot.data_manager import panel_access

    rp_id, _, origin = rp_config(request)
    try:
        auth_cred = parse_authentication_credential_json(json.dumps(credential))
        cred_id = bytes_to_base64url(auth_cred.raw_id)
    except Exception as exc:
        logger.warning("Passkey auth parse failed: %s", exc)
        return None, "Некорректные данные passkey"

    with _connect() as conn:
        row = conn.execute(
            """
            SELECT c.*, a.is_active
            FROM panel_webauthn_credentials c
            JOIN panel_admins a ON a.id = c.admin_id
            WHERE c.credential_id = ?
            """,
            (cred_id,),
        ).fetchone()
        if not row or not row["is_active"]:
            return None, "Passkey не найден"

        try:
            verification = verify_authentication_response(
                credential=auth_cred,
                expected_challenge=base64url_to_bytes(challenge_b64),
                expected_rp_id=rp_id,
                expected_origin=origin,
                credential_public_key=base64url_to_bytes(row["public_key"]),
                credential_current_sign_count=int(row["sign_count"]),
                require_user_verification=True,
            )
        except Exception as exc:
            logger.warning("Passkey auth verify failed: %s", exc)
            return None, "Passkey не прошёл проверку"

        conn.execute(
            """
            UPDATE panel_webauthn_credentials
            SET sign_count = ?, last_used_at = ?
            WHERE id = ?
            """,
            (
                int(verification.new_sign_count),
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                row["id"],
            ),
        )
        conn.commit()
        admin_id = int(row["admin_id"])

    admin = panel_access.get_admin(admin_id)
    if not admin:
        return None, "Администратор не найден"
    return admin, ""
