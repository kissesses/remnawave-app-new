"""Developer Support Hub client — pairing, Ed25519 signing, ticket API."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from shop_bot.data_manager.remnawave_repository import get_setting, update_setting
from shop_bot.data_manager.secrets_vault import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)

SETTING_INSTALLATION_UUID = "dev_support_installation_uuid"
SETTING_SETUP_SALT = "dev_support_setup_salt"
SETTING_INSTALLATION_ID = "dev_support_installation_id"
SETTING_PRIVATE_KEY = "dev_support_private_key_enc"
SETTING_PUBLIC_KEY = "dev_support_public_key"
SETTING_PAIRING_DEVICE = "dev_support_pairing_device_code"
SETTING_PAIRING_USER = "dev_support_pairing_user_code"
SETTING_PAIRING_EXPIRES = "dev_support_pairing_expires_at"
SETTING_STATUS = "dev_support_status"

STATUS_UNPAIRED = "unpaired"
STATUS_PENDING = "pending"
STATUS_ACTIVE = "active"

ALLOWED_ATTACHMENT_EXT = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".txt", ".log", ".zip"})
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_SUBJECT_LEN = 120
MAX_DESCRIPTION_LEN = 8000

SECRET_SETTING_KEYS = frozenset({
    "remnawave_api_token", "telegram_bot_token", "support_bot_token",
    "yookassa_secret_key", "cryptobot_token", "heleket_api_key", "tonapi_key",
    "ton_webhook_secret", "yoomoney_secret", "yoomoney_api_token",
    "yoomoney_client_secret", "platega_api_key", "smtp_password",
    "backup_master_password", "panel_password", "SHOPBOT_SECRET_KEY",
    "SHOPBOT_MASTER_KEY", "POSTGRES_PASSWORD", "REDIS_PASSWORD",
})


def get_hub_url() -> str:
    return (os.environ.get("DEVELOPER_SUPPORT_HUB_URL") or "").strip().rstrip("/")


def is_enabled() -> bool:
    if (os.environ.get("DEVELOPER_SUPPORT_ENABLED") or "0").strip() not in ("1", "true", "yes"):
        return False
    return bool(get_hub_url())


def get_bind_url(request_host: str | None = None) -> str:
    base = get_hub_url()
    return f"{base}/bind" if base else ""


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_panel_identity() -> tuple[str, str]:
    """Return (installation_uuid, setup_salt)."""
    inst_uuid = (get_setting(SETTING_INSTALLATION_UUID) or "").strip()
    if not inst_uuid:
        inst_uuid = str(uuid.uuid4())
        update_setting(SETTING_INSTALLATION_UUID, inst_uuid)
    salt = (get_setting(SETTING_SETUP_SALT) or "").strip()
    if not salt:
        salt = secrets.token_hex(32)
        update_setting(SETTING_SETUP_SALT, salt)
    return inst_uuid, salt


def resolve_panel_domain(request_host: str | None = None) -> str:
    origin = (os.environ.get("SHOPBOT_RP_ORIGIN") or "").strip()
    if origin:
        return origin.replace("https://", "").replace("http://", "").split("/")[0]
    domain = (get_setting("domain") or "").strip()
    if domain:
        return domain.replace("https://", "").replace("http://", "").split("/")[0]
    return (request_host or "").split(":")[0]


def get_panel_fingerprint(panel_domain: str) -> str:
    inst_uuid, salt = ensure_panel_identity()
    payload = f"{inst_uuid}|{panel_domain}|{salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def get_status() -> str:
    status = (get_setting(SETTING_STATUS) or STATUS_UNPAIRED).strip()
    installation_id = (get_setting(SETTING_INSTALLATION_ID) or "").strip()
    if status == STATUS_ACTIVE and installation_id:
        return STATUS_ACTIVE
    if status == STATUS_PENDING:
        expires = (get_setting(SETTING_PAIRING_EXPIRES) or "").strip()
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > exp_dt:
                    clear_pairing_state()
                    return STATUS_UNPAIRED
            except ValueError:
                pass
        return STATUS_PENDING
    return STATUS_UNPAIRED


def get_public_state(panel_domain: str) -> dict[str, Any]:
    status = get_status()
    return {
        "enabled": is_enabled(),
        "hub_url": get_hub_url(),
        "bind_url": get_bind_url(panel_domain),
        "status": status,
        "installation_id": (get_setting(SETTING_INSTALLATION_ID) or "").strip() or None,
        "panel_fingerprint": get_panel_fingerprint(panel_domain),
        "user_code": (get_setting(SETTING_PAIRING_USER) or "").strip() or None,
        "pairing_expires_at": (get_setting(SETTING_PAIRING_EXPIRES) or "").strip() or None,
        "public_key": (get_setting(SETTING_PUBLIC_KEY) or "").strip() or None,
    }


def clear_pairing_state() -> None:
    for key in (SETTING_PAIRING_DEVICE, SETTING_PAIRING_USER, SETTING_PAIRING_EXPIRES):
        update_setting(key, "")
    if get_status() != STATUS_ACTIVE:
        update_setting(SETTING_STATUS, STATUS_UNPAIRED)


def _load_private_key() -> Ed25519PrivateKey | None:
    raw = decrypt_secret(get_setting(SETTING_PRIVATE_KEY))
    if not raw:
        return None
    try:
        return Ed25519PrivateKey.from_private_bytes(base64.b64decode(raw))
    except Exception as exc:
        logger.warning("dev_support private key load failed: %s", exc)
        return None


def _generate_keypair() -> tuple[str, str]:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    priv_b64 = base64.b64encode(
        private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    ).decode("ascii")
    pub_b64 = base64.b64encode(
        public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode("ascii")
    return priv_b64, pub_b64


def revoke_binding() -> None:
    for key in (
        SETTING_INSTALLATION_ID, SETTING_PRIVATE_KEY, SETTING_PUBLIC_KEY,
        SETTING_PAIRING_DEVICE, SETTING_PAIRING_USER, SETTING_PAIRING_EXPIRES,
    ):
        update_setting(key, "")
    update_setting(SETTING_STATUS, STATUS_UNPAIRED)


def start_pairing(*, panel_domain: str, version: str) -> tuple[bool, str, dict[str, Any] | None]:
    if not is_enabled():
        return False, "Developer Support не включён (DEVELOPER_SUPPORT_ENABLED / HUB URL)", None

    priv_b64, pub_b64 = _generate_keypair()
    update_setting(SETTING_PRIVATE_KEY, encrypt_secret(priv_b64) or priv_b64)
    update_setting(SETTING_PUBLIC_KEY, pub_b64)

    panel_fp = get_panel_fingerprint(panel_domain)
    payload = {
        "panel_fp": panel_fp,
        "panel_domain": panel_domain,
        "version": version,
    }
    ok, err, data = _hub_post("/v1/pairing/init", payload, signed=False)
    if not ok or not data:
        return False, err or "Не удалось начать привязку", None

    device_code = data.get("device_code") or ""
    user_code = data.get("user_code") or ""
    expires_in = int(data.get("expires_in") or 600)
    if not device_code or not user_code:
        return False, "Некорректный ответ хаба", None

    expires_at = datetime.now(timezone.utc).timestamp() + expires_in
    expires_iso = datetime.fromtimestamp(expires_at, tz=timezone.utc).replace(microsecond=0).isoformat()

    update_setting(SETTING_PAIRING_DEVICE, encrypt_secret(device_code) or device_code)
    update_setting(SETTING_PAIRING_USER, user_code)
    update_setting(SETTING_PAIRING_EXPIRES, expires_iso)
    update_setting(SETTING_STATUS, STATUS_PENDING)

    return True, "Код привязки создан", {
        "user_code": user_code,
        "bind_url": data.get("bind_url") or get_bind_url(panel_domain),
        "expires_in": expires_in,
        "expires_at": expires_iso,
        "panel_fingerprint": panel_fp,
    }


def poll_pairing(*, panel_domain: str, version: str) -> tuple[bool, str, dict[str, Any] | None]:
    if get_status() != STATUS_PENDING:
        return False, "Нет активной сессии привязки", None

    device_code = decrypt_secret(get_setting(SETTING_PAIRING_DEVICE))
    pub_b64 = (get_setting(SETTING_PUBLIC_KEY) or "").strip()
    if not device_code or not pub_b64:
        return False, "Сессия привязки повреждена", None

    panel_fp = get_panel_fingerprint(panel_domain)
    payload = {
        "device_code": device_code,
        "public_key": pub_b64,
        "panel_fp": panel_fp,
        "panel_domain": panel_domain,
        "version": version,
    }
    ok, err, data = _hub_post("/v1/pairing/complete", payload, signed=False)
    if not ok:
        if data and data.get("status") == "pending":
            return True, "Ожидание подтверждения на хабе", {"status": "pending"}
        return False, err or "Ошибка привязки", data

    if not data or data.get("status") != "active":
        return True, "Ожидание подтверждения", {"status": data.get("status") if data else "pending"}

    installation_id = (data.get("installation_id") or "").strip()
    if not installation_id:
        return False, "Хаб не вернул installation_id", None

    update_setting(SETTING_INSTALLATION_ID, installation_id)
    update_setting(SETTING_STATUS, STATUS_ACTIVE)
    for key in (SETTING_PAIRING_DEVICE, SETTING_PAIRING_USER, SETTING_PAIRING_EXPIRES):
        update_setting(key, "")

    return True, "Панель привязана", {
        "status": STATUS_ACTIVE,
        "installation_id": installation_id,
    }


def _sign_headers(body_bytes: bytes) -> dict[str, str]:
    installation_id = (get_setting(SETTING_INSTALLATION_ID) or "").strip()
    private_key = _load_private_key()
    if not installation_id or not private_key:
        raise RuntimeError("Installation not paired")

    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    nonce = secrets.token_urlsafe(24)
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    message = f"{timestamp}\n{nonce}\n{body_hash}".encode("utf-8")
    signature = base64.b64encode(private_key.sign(message)).decode("ascii")
    return {
        "X-Installation-Id": installation_id,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
        "Content-Type": "application/json",
    }


def _hub_post(path: str, payload: dict[str, Any], *, signed: bool) -> tuple[bool, str | None, dict[str, Any] | None]:
    return _hub_request("POST", path, json_body=payload, signed=signed)


def _hub_get(path: str, *, signed: bool = True) -> tuple[bool, str | None, dict[str, Any] | None]:
    return _hub_request("GET", path, json_body=None, signed=signed)


def _hub_request(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None,
    signed: bool,
    timeout: float = 30.0,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    hub = get_hub_url()
    if not hub:
        return False, "DEVELOPER_SUPPORT_HUB_URL не задан", None

    url = f"{hub}{path}"
    if method == "GET":
        body_bytes = b""
    else:
        body_bytes = json.dumps(json_body or {}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Accept": "application/json", "User-Agent": "RemnawaveShopBot-DevSupport/1.0"}
    if signed:
        try:
            headers.update(_sign_headers(body_bytes))
        except RuntimeError as exc:
            return False, str(exc), None
    elif json_body is not None:
        headers["Content-Type"] = "application/json"

    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.request(method, url, content=body_bytes if method != "GET" else None, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("dev_support hub request failed: %s", exc)
        return False, "Не удалось связаться с Support Hub", None

    try:
        data = resp.json() if resp.content else {}
    except json.JSONDecodeError:
        data = {}

    if resp.status_code >= 400:
        msg = (data.get("message") if isinstance(data, dict) else None) or resp.reason_phrase
        return False, msg or f"HTTP {resp.status_code}", data if isinstance(data, dict) else None
    return True, None, data if isinstance(data, dict) else {}


def build_diagnostics() -> dict[str, Any]:
    from shop_bot.webhook_server.modules.update import get_current_version

    keys_safe: dict[str, str] = {}
    sensitive_patterns = ("token", "password", "secret", "key", "api")
    try:
        from shop_bot.data_manager.remnawave_repository import get_all_settings
        raw = get_all_settings() or {}
    except Exception:
        raw = {}
    for k, v in raw.items():
        kl = k.lower()
        if any(p in kl for p in sensitive_patterns) or k in SECRET_SETTING_KEYS:
            keys_safe[k] = "***" if v else ""
        else:
            val = str(v or "")[:200]
            keys_safe[k] = val

    return {
        "generated_at": _now_iso(),
        "shopbot_version": get_current_version(),
        "python_version": os.environ.get("PYTHON_VERSION", ""),
        "database": "postgresql" if "postgresql" in (os.environ.get("SHOPBOT_DATABASE_URL") or "") else "unknown",
        "settings_redacted": keys_safe,
    }


def create_ticket(
    *,
    subject: str,
    description: str,
    panel_domain: str,
    version: str,
    admin_id: int | None,
    admin_login: str | None,
    admin_role: str | None,
    include_diagnostics: bool = False,
    attachment: tuple[str, bytes, str] | None = None,
) -> tuple[bool, str, dict[str, Any] | None]:
    subject = (subject or "").strip()[:MAX_SUBJECT_LEN]
    description = (description or "").strip()[:MAX_DESCRIPTION_LEN]
    if len(subject) < 3:
        return False, "Тема: минимум 3 символа", None
    if len(description) < 10:
        return False, "Описание: минимум 10 символов", None

    payload: dict[str, Any] = {
        "subject": subject,
        "description": description,
        "shopbot_version": version,
        "panel_domain": panel_domain,
        "admin_id": admin_id,
        "admin_login": admin_login,
        "admin_role": admin_role,
        "panel_fingerprint": get_panel_fingerprint(panel_domain),
    }
    if include_diagnostics:
        payload["diagnostics"] = build_diagnostics()

    if attachment:
        filename, file_bytes, mime = attachment
        err_msg = _validate_attachment(filename, file_bytes)
        if err_msg:
            return False, err_msg, None
        ok, err, data = _hub_multipart("/v1/tickets", payload, filename, file_bytes, mime)
        if not ok:
            return False, err or "Не удалось создать тикет", data
        return True, "Тикет отправлен", data

    ok, err, data = _hub_post("/v1/tickets", payload, signed=True)
    if not ok:
        return False, err or "Не удалось создать тикет", data
    return True, "Тикет отправлен", data


def _validate_attachment(filename: str, file_bytes: bytes) -> str | None:
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_ATTACHMENT_EXT:
        return f"Файл не разрешён ({ext})"
    if len(file_bytes) > MAX_ATTACHMENT_BYTES:
        return "Файл больше 10 MB"
    return None


def _hub_multipart(
    path: str,
    payload: dict[str, Any],
    filename: str | None,
    file_bytes: bytes | None,
    mime: str,
) -> tuple[bool, str | None, dict[str, Any] | None]:
    hub = get_hub_url()
    if not hub:
        return False, "DEVELOPER_SUPPORT_HUB_URL не задан", None

    meta_json = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    try:
        sign_headers = _sign_headers(meta_json)
        sign_headers.pop("Content-Type", None)
    except RuntimeError as exc:
        return False, str(exc), None

    headers = {
        "Accept": "application/json",
        "User-Agent": "RemnawaveShopBot-DevSupport/1.0",
        **sign_headers,
    }
    files: dict[str, tuple] = {
        "meta": ("meta.json", meta_json, "application/json"),
    }
    if filename and file_bytes is not None:
        files["attachment"] = (filename, file_bytes, mime or "application/octet-stream")

    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resp = client.post(f"{hub}{path}", headers=headers, files=files)
    except httpx.HTTPError as exc:
        logger.warning("dev_support multipart failed: %s", exc)
        return False, "Не удалось связаться с Support Hub", None

    try:
        data = resp.json() if resp.content else {}
    except json.JSONDecodeError:
        data = {}
    if resp.status_code >= 400:
        msg = (data.get("message") if isinstance(data, dict) else None) or resp.reason_phrase
        return False, msg or f"HTTP {resp.status_code}", data if isinstance(data, dict) else None
    return True, None, data if isinstance(data, dict) else {}


def _hub_get_binary(path: str) -> tuple[bool, str | None, bytes, dict[str, str]]:
    hub = get_hub_url()
    if not hub:
        return False, "DEVELOPER_SUPPORT_HUB_URL не задан", b"", {}

    headers = {"Accept": "*/*", "User-Agent": "RemnawaveShopBot-DevSupport/1.0"}
    try:
        sign_headers = _sign_headers(b"")
        headers.update(sign_headers)
    except RuntimeError as exc:
        return False, str(exc), b"", {}

    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resp = client.get(f"{hub}{path}", headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("dev_support download failed: %s", exc)
        return False, "Не удалось связаться с Support Hub", b"", {}

    if resp.status_code >= 400:
        try:
            data = resp.json()
            msg = data.get("message") if isinstance(data, dict) else resp.reason_phrase
        except json.JSONDecodeError:
            msg = resp.reason_phrase
        return False, msg or f"HTTP {resp.status_code}", b"", {}

    out_headers = {
        "content-type": resp.headers.get("content-type", "application/octet-stream"),
        "content-disposition": resp.headers.get("content-disposition", ""),
    }
    return True, None, resp.content, out_headers


def list_tickets() -> tuple[bool, str | None, list[dict[str, Any]]]:
    ok, err, data = _hub_get("/v1/tickets")
    if not ok:
        return False, err, []
    items = data.get("items") if isinstance(data, dict) else []
    return True, None, items if isinstance(items, list) else []


def get_ticket(ticket_id: int) -> tuple[bool, str | None, dict[str, Any] | None]:
    ok, err, data = _hub_get(f"/v1/tickets/{ticket_id}")
    if not ok:
        return False, err, None
    return True, None, data


def reply_ticket(
    ticket_id: int,
    message: str,
    *,
    attachment: tuple[str, bytes, str] | None = None,
) -> tuple[bool, str, dict[str, Any] | None]:
    message = (message or "").strip()[:4000]
    has_file = attachment is not None
    if len(message) < 2 and not has_file:
        return False, "Сообщение или вложение обязательны", None

    if has_file:
        filename, file_bytes, mime = attachment
        err_msg = _validate_attachment(filename, file_bytes)
        if err_msg:
            return False, err_msg, None
        ok, err, data = _hub_multipart(
            f"/v1/tickets/{ticket_id}/reply",
            {"message": message},
            filename,
            file_bytes,
            mime,
        )
    else:
        ok, err, data = _hub_post(f"/v1/tickets/{ticket_id}/reply", {"message": message}, signed=True)

    if not ok:
        return False, err or "Не удалось отправить ответ", data
    return True, "Ответ отправлен", data


def fetch_attachment(ticket_id: int, attachment_id: int) -> tuple[bool, str | None, bytes, dict[str, str]]:
    return _hub_get_binary(f"/v1/tickets/{ticket_id}/attachments/{attachment_id}")
