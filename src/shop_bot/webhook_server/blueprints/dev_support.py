"""Developer Support — client panel routes (pairing, tickets via remote hub)."""

from __future__ import annotations

import logging

from flask import abort, jsonify, redirect, render_template, request, session, url_for
from werkzeug.utils import secure_filename

from shop_bot.data_manager import dev_support_client as dsc
from shop_bot.data_manager.panel_rbac import allows_permission, normalize_permission_levels
from shop_bot.webhook_server.blueprints.base import Blueprint
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.modules.update import get_current_version

logger = logging.getLogger(__name__)

bp = Blueprint("dev_support", __name__)


def _panel_domain() -> str:
    return dsc.resolve_panel_domain(request.host)


def _session_levels():
    levels = session.get("panel_permission_levels")
    if isinstance(levels, dict) and levels:
        return levels
    return normalize_permission_levels(session.get("panel_permissions") or [])


def _can_dev_support(*, edit: bool = False) -> bool:
    if session.get("panel_is_superadmin"):
        return True
    return allows_permission(_session_levels(), "dev_support", require_edit=edit)


def _require_access(*, edit: bool = False):
    if not dsc.is_enabled():
        return jsonify({"ok": False, "error": "disabled", "message": "Developer Support отключён"}), 404
    if not _can_dev_support(edit=edit):
        return jsonify({"ok": False, "error": "forbidden", "message": "Недостаточно прав"}), 403
    return None


@bp.route("/developer-support", methods=["GET"])
@panel_ctx.login_required
def developer_support_page():
    if not dsc.is_enabled():
        if not session.get("panel_is_superadmin"):
            abort(404)
        return render_template(
            "developer_support.html",
            **panel_ctx.get_common_template_data(),
            dev_support_enabled=False,
            dev_support_state={},
            app_version=get_current_version(),
            panel_domain=_panel_domain(),
        )
    if not _can_dev_support(edit=False):
        from flask import flash as _flash, redirect as _redirect, url_for as _url_for
        _flash("Недостаточно прав для раздела «Поддержка разработчика»", "danger")
        return _redirect(_url_for("dashboard_page"))

    domain = _panel_domain()
    state = dsc.get_public_state(domain)
    return render_template(
        "developer_support.html",
        **panel_ctx.get_common_template_data(),
        dev_support_enabled=True,
        dev_support_state=state,
        app_version=get_current_version(),
        panel_domain=domain,
    )


@bp.route("/developer-support/state.json", methods=["GET"])
@panel_ctx.login_required
def developer_support_state_json():
    denied = _require_access(edit=False)
    if denied:
        return denied
    return jsonify({"ok": True, **dsc.get_public_state(_panel_domain())})


@bp.route("/developer-support/pairing/start", methods=["POST"])
@panel_ctx.login_required
def developer_support_pairing_start():
    denied = _require_access(edit=True)
    if denied:
        return denied
    if dsc.get_status() == dsc.STATUS_ACTIVE:
        return jsonify({"ok": False, "message": "Панель уже привязана. Сначала отзовите привязку."}), 400

    ok, message, data = dsc.start_pairing(panel_domain=_panel_domain(), version=get_current_version())
    if ok:
        panel_ctx.audit("dev_support.pairing_started", {"panel_domain": _panel_domain()})
        return jsonify({"ok": True, "message": message, **(data or {})})
    return jsonify({"ok": False, "message": message}), 502


@bp.route("/developer-support/pairing/poll", methods=["GET"])
@panel_ctx.login_required
def developer_support_pairing_poll():
    denied = _require_access(edit=False)
    if denied:
        return denied

    ok, message, data = dsc.poll_pairing(panel_domain=_panel_domain(), version=get_current_version())
    if ok and data and data.get("status") == dsc.STATUS_ACTIVE:
        panel_ctx.audit("dev_support.paired", {"installation_id": data.get("installation_id")})
    status_code = 200 if ok else 502
    return jsonify({"ok": ok, "message": message, **(data or {})}), status_code


@bp.route("/developer-support/pairing/revoke", methods=["POST"])
@panel_ctx.login_required
def developer_support_pairing_revoke():
    denied = _require_access(edit=True)
    if denied:
        return denied
    dsc.revoke_binding()
    panel_ctx.audit("dev_support.revoked", {})
    return jsonify({"ok": True, "message": "Привязка отозвана"})


@bp.route("/developer-support/tickets", methods=["POST"])
@panel_ctx.login_required
def developer_support_ticket_create():
    denied = _require_access(edit=True)
    if denied:
        return denied
    if dsc.get_status() != dsc.STATUS_ACTIVE:
        return jsonify({"ok": False, "message": "Сначала привяжите панель к Support Hub"}), 400

    subject = request.form.get("subject") or ""
    description = request.form.get("description") or ""
    include_diag = request.form.get("include_diagnostics") in ("1", "true", "on", "yes")

    attachment = None
    upload = request.files.get("attachment")
    if upload and upload.filename:
        filename = secure_filename(upload.filename)
        if not filename:
            return jsonify({"ok": False, "message": "Некорректное имя файла"}), 400
        file_bytes = upload.read()
        attachment = (filename, file_bytes, upload.mimetype or "application/octet-stream")

    ok, message, data = dsc.create_ticket(
        subject=subject,
        description=description,
        panel_domain=_panel_domain(),
        version=get_current_version(),
        admin_id=session.get("panel_admin_id"),
        admin_login=session.get("panel_login"),
        admin_role=session.get("panel_role_name"),
        include_diagnostics=include_diag,
        attachment=attachment,
    )
    if ok:
        panel_ctx.audit("dev_support.ticket_created", {"ticket_id": (data or {}).get("ticket_id"), "subject": subject[:80]})
        return jsonify({"ok": True, "message": message, **(data or {})})
    return jsonify({"ok": False, "message": message}), 502


@bp.route("/developer-support/tickets.json", methods=["GET"])
@panel_ctx.login_required
def developer_support_tickets_json():
    denied = _require_access(edit=False)
    if denied:
        return denied
    if dsc.get_status() != dsc.STATUS_ACTIVE:
        return jsonify({"ok": True, "items": []})
    ok, err, items = dsc.list_tickets()
    if not ok:
        return jsonify({"ok": False, "message": err}), 502
    return jsonify({"ok": True, "items": items})


@bp.route("/developer-support/tickets/<int:ticket_id>.json", methods=["GET"])
@panel_ctx.login_required
def developer_support_ticket_json(ticket_id: int):
    denied = _require_access(edit=False)
    if denied:
        return denied
    ok, err, data = dsc.get_ticket(ticket_id)
    if not ok:
        return jsonify({"ok": False, "message": err}), 502
    return jsonify({"ok": True, "ticket": data})


@bp.route("/developer-support/tickets/<int:ticket_id>/reply", methods=["POST"])
@panel_ctx.login_required
def developer_support_ticket_reply(ticket_id: int):
    denied = _require_access(edit=True)
    if denied:
        return denied

    message = ""
    attachment = None
    content_type = (request.content_type or "").lower()
    if content_type.startswith("multipart/form-data"):
        message = request.form.get("message") or ""
        upload = request.files.get("attachment")
        if upload and upload.filename:
            filename = secure_filename(upload.filename)
            if filename:
                file_bytes = upload.read()
                attachment = (filename, file_bytes, upload.mimetype or "application/octet-stream")
    else:
        payload = request.get_json(silent=True) or {}
        message = payload.get("message") or request.form.get("message") or ""

    ok, msg, data = dsc.reply_ticket(ticket_id, message, attachment=attachment)
    if ok:
        return jsonify({"ok": True, "message": msg, **(data or {})})
    return jsonify({"ok": False, "message": msg}), 502


@bp.route("/developer-support/tickets/<int:ticket_id>/attachments/<int:attachment_id>", methods=["GET"])
@panel_ctx.login_required
def developer_support_ticket_attachment(ticket_id: int, attachment_id: int):
    denied = _require_access(edit=False)
    if denied:
        return denied
    ok, err, content, headers = dsc.fetch_attachment(ticket_id, attachment_id)
    if not ok or not content:
        abort(404 if ok else 502, err or "Not found")

    from flask import Response
    resp = Response(content, mimetype=headers.get("content-type", "application/octet-stream"))
    disposition = headers.get("content-disposition")
    if disposition:
        resp.headers["Content-Disposition"] = disposition
    return resp
