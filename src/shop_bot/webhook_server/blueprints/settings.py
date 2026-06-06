import asyncio
import json
import logging
import os
import re
import secrets
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from hmac import compare_digest
from pathlib import Path

from flask import current_app, flash, jsonify, make_response, redirect, render_template, request, send_file, session, url_for

from shop_bot.data_manager import backup_manager
from shop_bot.data_manager import db_admin
from shop_bot.data_manager import panel_access
from shop_bot.data_manager import panel_audit
from shop_bot.data_manager import panel_security
from shop_bot.data_manager import panel_telegram_auth
from shop_bot.data_manager import panel_totp
from shop_bot.data_manager import panel_webauthn
from shop_bot.data_manager import panel_stepup
from shop_bot.data_manager.panel_rbac import DOCK_COVERAGE, PERMISSION_GROUPS, PERMISSION_RISK, ROLE_PRESETS, allows_permission, normalize_permission_levels
from shop_bot.data_manager.remnawave_repository import (
    add_device_tier,
    create_host,
    create_plan,
    delete_device_tier,
    delete_host,
    delete_plan,
    get_all_hosts,
    get_all_settings,
    get_all_ssh_targets,
    get_device_tiers,
    get_latest_speedtest,
    get_plans_for_host,
    get_setting,
    toggle_host_visibility,
    update_host_button_style,
    update_host_description,
    update_host_device_mode,
    update_host_name,
    update_host_remnawave_settings,
    update_host_ssh_settings,
    update_host_subscription_url,
    update_host_traffic_settings,
    update_host_url,
    update_other_setting,
    update_plan,
    update_setting,
)
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.data_manager.panel_rbac import SETTINGS_TAB_PERMISSIONS
from shop_bot.webhook_server.constants import (
    ALL_SETTINGS_KEYS,
    SETTINGS_FORM_TABS,
    SETTINGS_NAV_GROUPS,
    SETTINGS_TAB_CHECKBOXES,
    SETTINGS_TAB_IDS,
    SETTINGS_TAB_OTHER_KEYS,
    SETTINGS_TAB_SECTIONS,
    SETTINGS_TAB_TEXT_KEYS,
)
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server.panel_http import external_url_root
from shop_bot.webhook_server.modules import stealth_login

logger = logging.getLogger(__name__)


def _recent_db_backups(limit: int = 8) -> list[dict]:
    items = []
    try:
        bdir = backup_manager.BACKUPS_DIR
        for p in sorted(bdir.glob('db-backup-*.zip'), key=lambda x: x.stat().st_mtime, reverse=True)[:limit]:
            try:
                st = p.stat()
                items.append({
                    'name': p.name,
                    'mtime': datetime.fromtimestamp(st.st_mtime, tz=timezone(timedelta(hours=3))).strftime('%Y-%m-%d %H:%M'),
                    'size': st.st_size,
                    'size_label': db_admin.format_bytes(st.st_size),
                })
            except Exception:
                pass
    except Exception:
        pass
    return items


def _database_api_guard(scope: str | None = None) -> tuple[int | None, tuple | None]:
    from shop_bot.data_manager import panel_stepup as ps

    if not _user_can_settings_tab('database'):
        return None, (jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403)
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return None, (jsonify({'ok': False, 'error': 'auth_required'}), 401)
    check_scope = scope or ps.SCOPE_DATABASE
    if not ps.has_valid_stepup(check_scope):
        return None, (jsonify({'ok': False, 'error': 'stepup_required'}), 403)
    return admin_id, None


def _destructive_stepup_required() -> bool:
    from shop_bot.data_manager import panel_stepup as ps

    admin_id = _current_panel_admin_id()
    if not admin_id:
        return False
    if ps.required_stepup_method(admin_id) is None:
        return False
    return ps.has_valid_stepup(ps.SCOPE_DESTRUCTIVE)


def _database_source_from_request(body: dict | None = None) -> str:
    payload = body or {}
    return db_admin.normalize_db_source(
        payload.get('source') or request.args.get('source') or session.get('database_view_source'),
    )


def _current_panel_admin_id() -> int | None:
    raw = session.get('panel_admin_id')
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('settings', __name__)


def _user_can_settings_tab(tab: str) -> bool:
    if session.get('panel_is_superadmin'):
        return True
    if tab == 'content':
        perms = session.get('panel_permissions') or []
        return 'settings_content' in perms or 'settings_mail_templates' in perms
    if tab == 'audit':
        perms = session.get('panel_permissions') or []
        return 'settings_audit' in perms or 'settings_access' in perms
    perm = SETTINGS_TAB_PERMISSIONS.get(tab)
    if not perm:
        return False
    return perm in (session.get('panel_permissions') or [])


def _user_can_settings_access_edit() -> bool:
    if session.get('panel_is_superadmin'):
        return True
    levels = session.get('panel_permission_levels') or normalize_permission_levels(
        session.get('panel_permissions') or []
    )
    return allows_permission(levels, 'settings_access', require_edit=True)


def _user_can_audit() -> bool:
    if session.get('panel_is_superadmin'):
        return True
    perms = session.get('panel_permissions') or []
    return 'settings_audit' in perms or 'settings_access' in perms


def _audit_filter_args() -> dict:
    actions_raw = (request.args.get('actions') or '').strip()
    actions = [a.strip() for a in actions_raw.split(',') if a.strip()] if actions_raw else None
    admin_id = request.args.get('admin_id', type=int)
    return {
        'q': request.args.get('q') or '',
        'admin_login': request.args.get('admin') or '',
        'admin_id': admin_id,
        'action': request.args.get('action') or '',
        'actions': actions,
        'group': request.args.get('group') or '',
        'ip': request.args.get('ip') or '',
        'date_from': request.args.get('date_from') or '',
        'date_to': request.args.get('date_to') or '',
    }


def _humanized_audit_entries(limit: int = 60) -> list[dict]:
    return [panel_audit.humanize_entry(e) for e in panel_audit.list_recent(limit)]


def _mail_client_ip() -> str:
    forwarded = (request.headers.get('X-Forwarded-For') or '').strip()
    if forwarded:
        return forwarded.split(',')[0].strip()
    return (request.remote_addr or '').strip()


def _normalize_mail_fields(raw: dict) -> tuple[dict[str, str], str | None]:
    from shop_bot.data_manager.smtp_template_security import normalize_template_fields

    fields = {
        k: str(raw.get(k, ''))
        for k in ('subject', 'headline', 'body', 'cta_label', 'cta_url', 'preheader')
    }
    return normalize_template_fields(fields)


def _first_allowed_settings_tab() -> str:
    for tab in SETTINGS_TAB_IDS:
        if tab == 'webapp' and not panel_ctx.webapp_exists:
            continue
        if _user_can_settings_tab(tab):
            return tab
    return 'panel'


def _save_tab_settings(tab: str) -> None:
    if tab not in SETTINGS_FORM_TABS:
        return

    for key, default in SETTINGS_TAB_CHECKBOXES.get(tab, {}).items():
        values = request.form.getlist(key)
        update_setting(key, values[-1] if values else default)

    for key, default in SETTINGS_TAB_OTHER_KEYS.get(tab, {}).items():
        values = request.form.getlist(key)
        update_other_setting(key, values[-1] if values else default)

    for key in SETTINGS_TAB_TEXT_KEYS.get(tab, []):
        if key in request.form:
            val = request.form.get(key)
            if tab == "panel" and key == "smtp_password" and not (val or "").strip():
                continue
            update_setting(key, val)

    if tab == 'stealth-login':
        update_setting('stealth_login_hotkey', stealth_login.normalize_hotkey(request.form.get('stealth_login_hotkey')))
        update_setting('stealth_login_decoy', stealth_login.normalize_decoy(request.form.get('stealth_login_decoy')))
        update_setting('stealth_login_clicks_count', str(stealth_login.normalize_clicks_count(request.form.get('stealth_login_clicks_count'))))
        update_setting('stealth_login_clicks_window_ms', str(stealth_login.normalize_clicks_window_ms(request.form.get('stealth_login_clicks_window_ms'))))
        update_setting('stealth_login_history_path', stealth_login.normalize_history_path(request.form.get('stealth_login_history_path')))
        update_setting('stealth_login_secret_param', stealth_login.normalize_secret_param(request.form.get('stealth_login_secret_param')))
        update_setting('stealth_login_secret_value', stealth_login.normalize_secret_value(request.form.get('stealth_login_secret_value')))

    if tab == 'payments':
        pay_info = {
            'id': 1 if request.form.get('pay_info_id') else 0,
            'username': 1 if request.form.get('pay_info_username') else 0,
            'first_name': 1 if request.form.get('pay_info_first_name') else 0,
            'host_name': 1 if request.form.get('pay_info_host_name') else 0,
        }
        update_setting('pay_info_comment', json.dumps(pay_info))


def _load_settings_page_context(tab: str) -> dict:
    current_settings = get_all_settings()
    try:
        pay_info = json.loads(current_settings.get('pay_info_comment', '{}'))
    except (ValueError, TypeError):
        pay_info = {}

    current_admin_id = session.get('panel_admin_id')
    totp_info = panel_totp.totp_status(current_admin_id) if current_admin_id else {'enabled': False, 'pending_setup': False}
    security_info = panel_security.security_status(int(current_admin_id)) if current_admin_id else {
        'method': 'none', 'effective_method': 'none', 'configured': True, 'needs_setup': False,
        'forced_totp': panel_totp.require_totp_globally(), 'label': 'Только пароль',
    }

    ctx: dict = {
        'active_tab': tab,
        'pay_info': pay_info,
        'totp_info': totp_info,
        'security_info': security_info,
        'require_totp_global': panel_totp.require_totp_globally(),
        'security_methods': panel_security.SECURITY_METHOD_LABELS,
        'security_method_descriptions': panel_security.SECURITY_METHOD_DESCRIPTIONS,
        'webapp': {},
        'settings_nav_groups': SETTINGS_NAV_GROUPS,
        'tab_sections': SETTINGS_TAB_SECTIONS.get(tab, []),
    }

    try:
        from shop_bot.webhook_server.modules.update import get_current_version, get_image_tag_label
        ctx['app_version'] = get_current_version()
        ctx['app_image_tag'] = get_image_tag_label()
    except Exception:
        ctx['app_version'] = ''
        ctx['app_image_tag'] = ''

    if tab == 'stealth-login':
        ctx['stealth_login_meta'] = stealth_login.build_settings_meta(
            current_settings,
            url_for('login_page'),
        )

    if tab == 'database':
        admin_id = _current_panel_admin_id() or 0
        gate = panel_stepup.stepup_gate_meta(admin_id)
        ctx['database_gate'] = gate
        ctx['telegram_bot_username'] = (current_settings.get('telegram_bot_username') or '').strip().lstrip('@')
        if gate.get('unlocked'):
            db_source = db_admin.normalize_db_source(session.get('database_view_source'))
            ctx['database_source'] = db_source
            ctx['database_overview'] = db_admin.get_overview(db_source)
            ctx['database_sources'] = [
                {'id': s, 'label': db_admin.SOURCE_LABELS[s]} for s in db_admin.DATABASE_SOURCES
            ]
            try:
                ctx['backup_delivery'] = backup_manager.get_backup_config()
            except Exception:
                ctx['backup_delivery'] = {}
            ctx['database_recent_backups'] = _recent_db_backups()
            ctx['remnawave_db_configured'] = bool(
                (ctx.get('backup_delivery') or {}).get('remnawave_configured'),
            )

    if tab == 'panel':
        try:
            from shop_bot.data_manager.db.dialect import is_postgresql
            admins_active = len([a for a in panel_access.list_admins() if a.get('is_active')])
        except Exception:
            admins_active = 0
        ctx['panel_system_meta'] = {
            'version': ctx.get('app_version') or '',
            'image_tag': ctx.get('app_image_tag') or '',
            'db_engine': 'PostgreSQL' if is_postgresql() else 'SQLite',
            'wal_enabled': current_settings.get('enable_wal_mode') == '1',
            'admins_count': admins_active,
        }

    if tab == 'payments':
        ctx['base_url'] = external_url_root(request, domain_setting=current_settings.get('domain'))

    if tab in ('bot', 'panel'):
        try:
            ctx['backup_delivery'] = backup_manager.get_backup_config()
        except Exception:
            ctx['backup_delivery'] = {}

    if tab == 'hosts':
        hosts = get_all_hosts()
        for host in hosts:
            host['plans'] = get_plans_for_host(host['host_name'])
            host['device_tiers'] = get_device_tiers(host['host_name'])
            try:
                host['latest_speedtest'] = get_latest_speedtest(host['host_name'])
            except Exception:
                host['latest_speedtest'] = None
        ctx['hosts'] = hosts
        try:
            ctx['ssh_targets'] = get_all_ssh_targets()
        except Exception:
            ctx['ssh_targets'] = []

    if tab == 'panel':
        backups = []
        try:
            bdir = backup_manager.BACKUPS_DIR
            for p in sorted(bdir.glob('db-backup-*.zip'), key=lambda x: x.stat().st_mtime, reverse=True):
                try:
                    st = p.stat()
                    backups.append({
                        'name': p.name,
                        'mtime': datetime.fromtimestamp(st.st_mtime, tz=timezone(timedelta(hours=3))).strftime('%Y-%m-%d %H:%M'),
                        'size': st.st_size,
                    })
                except Exception:
                    pass
        except Exception:
            pass
        ctx['backups'] = backups

    if tab == 'referrals':
        from shop_bot.data_manager import referral_analytics
        try:
            ctx['referral_meta'] = referral_analytics.get_referral_overview()
        except Exception:
            ctx['referral_meta'] = {}
        try:
            ctx['seller_ref_overrides'] = referral_analytics.get_seller_ref_overrides()
        except Exception:
            ctx['seller_ref_overrides'] = []

    if tab == 'access':
        edit_role_id = request.args.get('role_id', type=int)
        edit_admin_id = request.args.get('admin_id', type=int)
        common_data = panel_ctx.get_common_template_data()
        totp_qr_data_uri = None
        if current_admin_id and totp_info.get('pending_setup'):
            setup_uri = panel_totp.get_setup_uri(
                current_admin_id,
                session.get('panel_login') or '',
                common_data.get('brand_title') or 'Remnawave App',
            )
            if setup_uri:
                totp_qr_data_uri = panel_ctx.qr_data_uri(setup_uri)
        ctx.update({
            'panel_roles': panel_access.list_roles(),
            'panel_admins': panel_access.list_admins(),
            'permission_groups': PERMISSION_GROUPS,
            'permission_risk': PERMISSION_RISK,
            'role_presets': ROLE_PRESETS,
            'dock_coverage': [{'perm': p, 'label': l} for p, l in DOCK_COVERAGE],
            'edit_role': panel_access.get_role(edit_role_id) if edit_role_id else None,
            'edit_admin': panel_access.get_admin(edit_admin_id) if edit_admin_id else None,
            'panel_audit_entries': _humanized_audit_entries(60),
            'totp_qr_data_uri': totp_qr_data_uri,
            'passkeys': panel_webauthn.list_credentials(current_admin_id) if current_admin_id else [],
            'current_admin': panel_access.get_admin(current_admin_id) if current_admin_id else None,
            'telegram_login_setting': panel_telegram_auth.is_login_enabled(),
            'passkey_login_setting': panel_webauthn.is_login_enabled(),
            'passkey_available': panel_webauthn.is_available(),
            'telegram_bot_username': (current_settings.get('telegram_bot_username') or '').strip().lstrip('@'),
        })

    if tab == 'webapp':
        try:
            from shop_bot.data_manager import remnawave_repository as rw_repo
            from shop_bot.webapp.designs import WEBAPP_DESIGNS, parse_enabled_designs

            webapp = rw_repo.get_webapp_settings()
            ctx['webapp'] = webapp
            ctx['webapp_designs'] = WEBAPP_DESIGNS
            ctx['webapp_enabled_design_list'] = parse_enabled_designs(webapp.get('webapp_enabled_designs'))
        except Exception:
            ctx['webapp'] = {}
            ctx['webapp_designs'] = []
            ctx['webapp_enabled_design_list'] = ['classic']

    return ctx


def _render_settings_tab(tab: str):
    if tab not in SETTINGS_TAB_IDS:
        flash('Неизвестный раздел настроек', 'danger')
        return redirect(url_for('settings_tab_page', tab=_first_allowed_settings_tab()))

    if not _user_can_settings_tab(tab):
        flash('Недостаточно прав для этого раздела настроек', 'danger')
        return redirect(url_for('settings_tab_page', tab=_first_allowed_settings_tab()))

    if tab == 'webapp' and not panel_ctx.webapp_exists:
        flash('WebApp не установлен', 'warning')
        return redirect(url_for('settings_tab_page', tab=_first_allowed_settings_tab()))

    if tab == 'mail-templates':
        return redirect(url_for('settings_tab_page', tab='content') + '#mail')

    common_data = panel_ctx.get_common_template_data()
    tab_ctx = _load_settings_page_context(tab)
    return render_template(
        'settings.html',
        **common_data,
        **tab_ctx,
    )


@bp.route('/settings', methods=['GET'])
@panel_ctx.login_required
def settings_page():
    """Redirect legacy /settings and /settings?tab= to per-tab pages."""
    legacy_tab = (request.args.get('tab') or '').strip()
    if legacy_tab and legacy_tab in SETTINGS_TAB_IDS:
        return redirect(url_for('settings_tab_page', tab=legacy_tab, **{
            k: v for k, v in request.args.items() if k != 'tab'
        }))
    return redirect(url_for('settings_tab_page', tab=_first_allowed_settings_tab()))


@bp.route('/settings/<tab>', methods=['GET', 'POST'])
@panel_ctx.login_required
def settings_tab_page(tab: str):
    tab = (tab or '').strip().lower()
    if request.method == 'POST':
        if tab not in SETTINGS_FORM_TABS:
            flash('Этот раздел не поддерживает общее сохранение', 'warning')
            return redirect(url_for('settings_tab_page', tab=tab))
        _save_tab_settings(tab)
        flash('Настройки сохранены.', 'success')
        panel_ctx.audit('settings.save', {'tab': tab})
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': True, 'message': 'Настройки сохранены.'})
        return redirect(url_for('settings_tab_page', tab=tab))

    return _render_settings_tab(tab)


@bp.route('/settings/database/info.json', methods=['GET'])
@panel_ctx.login_required
def settings_database_info():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return jsonify({'ok': False, 'error': 'auth_required'}), 401
    if not panel_stepup.has_valid_stepup():
        return jsonify({'ok': False, 'error': 'stepup_required'}), 403
    source = db_admin.normalize_db_source(request.args.get('source') or session.get('database_view_source'))
    return jsonify({
        'ok': True,
        'source': source,
        'overview': db_admin.get_overview(source),
        'backups': _recent_db_backups() if source == 'shopbot' else [],
        'remaining_sec': panel_stepup.stepup_remaining_seconds(),
    })


@bp.route('/settings/database/source', methods=['POST'])
@panel_ctx.login_required
def settings_database_source():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    if not _current_panel_admin_id() or not panel_stepup.has_valid_stepup():
        return jsonify({'ok': False, 'error': 'stepup_required'}), 403
    body = request.get_json(silent=True) or {}
    source = db_admin.normalize_db_source(body.get('source'))
    session['database_view_source'] = source
    return jsonify({
        'ok': True,
        'source': source,
        'overview': db_admin.get_overview(source),
    })


@bp.route('/settings/database/maintenance/analyze', methods=['POST'])
@panel_ctx.login_required
def settings_database_maintenance():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id or not panel_stepup.has_valid_stepup():
        return jsonify({'ok': False, 'error': 'stepup_required'}), 403
    body = request.get_json(silent=True) or {}
    source = db_admin.normalize_db_source(body.get('source') or session.get('database_view_source'))
    ok, message = db_admin.run_maintenance_analyze(source)
    if ok:
        panel_ctx.audit('db.maintenance', {'action': 'analyze', 'source': source})
    status = 200 if ok else 500
    return jsonify({'ok': ok, 'message': message}), status


@bp.route('/settings/database/tables.json', methods=['GET'])
@panel_ctx.login_required
def settings_database_tables():
    _, err = _database_api_guard()
    if err:
        return err
    source = _database_source_from_request()
    try:
        tables = db_admin.list_tables(source)
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    return jsonify({'ok': True, 'source': source, 'tables': tables})


@bp.route('/settings/database/tables/<table_name>.json', methods=['GET'])
@panel_ctx.login_required
def settings_database_table_detail(table_name: str):
    _, err = _database_api_guard()
    if err:
        return err
    source = _database_source_from_request()
    try:
        table = db_admin.validate_table_name(table_name)
        detail = db_admin.get_table_detail(source, table)
        page = max(1, int(request.args.get('page') or 1))
        limit = max(1, min(int(request.args.get('limit') or 50), 200))
        order_by = (request.args.get('order_by') or '').strip() or None
        order_dir = (request.args.get('order_dir') or 'asc').strip()
        browse = db_admin.browse_table(
            source, table, page=page, limit=limit, order_by=order_by, order_dir=order_dir,
        )
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    return jsonify({'ok': True, 'source': source, 'detail': detail, 'browse': browse})


@bp.route('/settings/database/tables/<table_name>/delete', methods=['POST'])
@panel_ctx.login_required
def settings_database_table_delete(table_name: str):
    admin_id, err = _database_api_guard()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    source = _database_source_from_request(body)
    try:
        table = db_admin.validate_table_name(table_name)
        deleted, message = db_admin.delete_table_rows(source, table, body.get('keys') or [])
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    if deleted:
        panel_ctx.audit('db.delete_rows', {
            'source': source, 'table': table, 'count': deleted, 'admin_id': admin_id,
        })
    status = 200 if deleted else 400
    return jsonify({'ok': bool(deleted), 'deleted': deleted, 'message': message}), status


@bp.route('/settings/database/tables/<table_name>/truncate', methods=['POST'])
@panel_ctx.login_required
def settings_database_table_truncate(table_name: str):
    admin_id, err = _database_api_guard()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    source = _database_source_from_request(body)
    try:
        table = db_admin.validate_table_name(table_name)
        ok, message = db_admin.truncate_table(source, table, body.get('confirm') or '')
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    if ok:
        panel_ctx.audit('db.truncate', {'source': source, 'table': table, 'admin_id': admin_id})
    status = 200 if ok else 400
    return jsonify({'ok': ok, 'message': message}), status


@bp.route('/settings/database/tables/<table_name>/export.csv', methods=['GET'])
@panel_ctx.login_required
def settings_database_table_export(table_name: str):
    _, err = _database_api_guard()
    if err:
        return err
    source = _database_source_from_request()
    try:
        table = db_admin.validate_table_name(table_name)
        name, csv_data = db_admin.export_table_csv(source, table)
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    from flask import Response
    return Response(
        csv_data,
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{name}.csv"'},
    )


@bp.route('/settings/database/query', methods=['POST'])
@panel_ctx.login_required
def settings_database_query():
    admin_id, err = _database_api_guard()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    source = _database_source_from_request(body)
    sql = (body.get('sql') or '').strip()
    try:
        result = db_admin.execute_readonly_query(source, sql)
    except ValueError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 400
    except Exception as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 500
    panel_ctx.audit('db.query', {'source': source, 'admin_id': admin_id, 'rows': result.get('count', 0)})
    return jsonify({'ok': True, 'source': source, 'result': result})


@bp.route('/settings/database/stats.json', methods=['GET'])
@panel_ctx.login_required
def settings_database_stats():
    _, err = _database_api_guard()
    if err:
        return err
    source = _database_source_from_request()
    return jsonify({'ok': True, 'source': source, 'stats': db_admin.get_connection_stats(source)})


@bp.route('/settings/database/maintenance', methods=['POST'])
@panel_ctx.login_required
def settings_database_maintenance_action():
    admin_id, err = _database_api_guard()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    source = _database_source_from_request(body)
    action = (body.get('action') or 'analyze').strip().lower()
    table = (body.get('table') or '').strip() or None
    ok, message = db_admin.run_maintenance(source, action, table)
    if ok:
        panel_ctx.audit('db.maintenance', {
            'action': action, 'source': source, 'table': table, 'admin_id': admin_id,
        })
    status = 200 if ok else 500
    return jsonify({'ok': ok, 'message': message}), status


@bp.route('/settings/database/stepup/totp', methods=['POST'])
@panel_ctx.login_required
def settings_database_stepup_totp():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return jsonify({'ok': False, 'error': 'auth_required'}), 401
    body = request.get_json(silent=True) or {}
    code = (body.get('code') or '').strip()
    ok, message = panel_stepup.verify_totp_stepup(admin_id, code)
    if ok:
        panel_ctx.audit('db.stepup', {'method': 'totp'})
        return jsonify({'ok': True, 'remaining_sec': panel_stepup.stepup_remaining_seconds()})
    return jsonify({'ok': False, 'error': message or 'Неверный код'}), 401


@bp.route('/settings/database/stepup/passkey/options', methods=['POST'])
@panel_ctx.login_required
def settings_database_stepup_passkey_options():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return jsonify({'ok': False, 'error': 'auth_required'}), 401
    if panel_stepup.required_stepup_method(admin_id) != panel_security.SECURITY_PASSKEY:
        return jsonify({'ok': False, 'error': 'Passkey не является вашим способом 2FA'}), 400
    if not panel_webauthn.is_available():
        return jsonify({'ok': False, 'error': 'Passkey недоступен'}), 503
    try:
        begin = panel_webauthn.begin_authentication(request, admin_id=admin_id)
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 503
    session['database_stepup_webauthn_challenge'] = begin['challenge']
    return jsonify({'ok': True, 'options': begin['options']})


@bp.route('/settings/database/stepup/passkey/verify', methods=['POST'])
@panel_ctx.login_required
def settings_database_stepup_passkey_verify():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return jsonify({'ok': False, 'error': 'auth_required'}), 401
    challenge = session.pop('database_stepup_webauthn_challenge', None)
    if not challenge:
        return jsonify({'ok': False, 'error': 'Сессия passkey истекла'}), 400
    body = request.get_json(silent=True) or {}
    ok, message = panel_stepup.verify_passkey_stepup(
        admin_id,
        challenge_b64=challenge,
        credential=body.get('credential') or body,
        request=request,
    )
    if ok:
        panel_ctx.audit('db.stepup', {'method': 'passkey'})
        return jsonify({'ok': True, 'remaining_sec': panel_stepup.stepup_remaining_seconds()})
    return jsonify({'ok': False, 'error': message or 'Passkey не принят'}), 401


@bp.route('/settings/database/stepup/telegram', methods=['POST'])
@panel_ctx.login_required
def settings_database_stepup_telegram():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    admin_id = _current_panel_admin_id()
    if not admin_id:
        return jsonify({'ok': False, 'error': 'auth_required'}), 401
    payload = request.get_json(silent=True) or request.form.to_dict()
    ok, message = panel_stepup.verify_telegram_stepup(admin_id, payload)
    if ok:
        panel_ctx.audit('db.stepup', {'method': 'telegram'})
        return jsonify({'ok': True, 'remaining_sec': panel_stepup.stepup_remaining_seconds()})
    return jsonify({'ok': False, 'error': message or 'Telegram не принят'}), 401


@bp.route('/settings/database/stepup/lock', methods=['POST'])
@panel_ctx.login_required
def settings_database_stepup_lock():
    if not _user_can_settings_tab('database'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    panel_stepup.revoke_all_elevated_stepups()
    panel_ctx.audit('db.stepup.lock')
    return jsonify({'ok': True})


@bp.route('/settings/stealth-decoy/preview/<decoy_id>', methods=['GET'])
@panel_ctx.login_required
def settings_stealth_decoy_preview(decoy_id: str):
    if not _user_can_settings_tab('stealth-login'):
        return 'Forbidden', 403
    body = stealth_login.render_decoy_preview_html(decoy_id)
    resp = make_response(body)
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    resp.headers['Cache-Control'] = 'private, max-age=3600'
    resp.headers['X-Frame-Options'] = 'SAMEORIGIN'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


@bp.route('/settings/smtp/test', methods=['POST'])
@panel_ctx.login_required
def settings_smtp_test():
    if not _user_can_settings_tab('panel'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403

    payload = request.get_json(silent=True) or {}
    to = (payload.get('to') or request.form.get('to') or '').strip()
    from shop_bot.data_manager import smtp_mailer

    overrides = {
        key: payload.get(key)
        for key in (
            'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_username', 'smtp_password',
            'smtp_from_email', 'smtp_from_name', 'smtp_encryption', 'smtp_notify_emails',
        )
        if key in payload
    }
    ok, message = smtp_mailer.send_test_mail(to or None, overrides or None)
    panel_ctx.audit('smtp.test', {'to': to or 'default', 'ok': ok})
    return jsonify({'ok': ok, 'message': message}), (200 if ok else 400)


@bp.route('/settings/mail-templates/data', methods=['GET'])
@panel_ctx.login_required
def settings_mail_templates_data():
    if not _user_can_settings_tab('mail-templates'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import smtp_templates

    meta = []
    for tid in smtp_templates.TEMPLATE_IDS:
        m = smtp_templates.TEMPLATE_META.get(tid, {})
        meta.append({
            'id': tid,
            'label': m.get('label', tid),
            'icon': m.get('icon', 'mail'),
            'audience': m.get('audience', 'user'),
            'desc': m.get('desc', ''),
            'vars': m.get('vars', []),
        })
    return jsonify({
        'ok': True,
        'templates': smtp_templates.get_all_templates(),
        'meta': meta,
        'accent': smtp_templates.get_accent(),
        'footer': smtp_templates.get_footer(),
        'brand': (get_setting('panel_brand_title') or 'Remnawave App').strip(),
    })


@bp.route('/settings/mail-templates/save', methods=['POST'])
@panel_ctx.login_required
def settings_mail_templates_save():
    if not _user_can_settings_tab('mail-templates'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import smtp_templates

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or '').strip()
    if not template_id:
        return jsonify({'ok': False, 'error': 'Не указан шаблон'}), 400
    before = smtp_templates.get_template(template_id) or {}
    fields = {
        k: payload.get(k, '')
        for k in ('subject', 'headline', 'body', 'cta_label', 'cta_url', 'preheader')
    }
    ok_save, err = smtp_templates.save_template(template_id, fields)
    if not ok_save:
        return jsonify({'ok': False, 'error': err or 'Неизвестный шаблон'}), 400
    accent = payload.get('accent')
    if accent:
        smtp_templates.save_accent(str(accent))
    if 'footer' in payload:
        ok_footer, err_footer = smtp_templates.save_footer(str(payload.get('footer') or ''))
        if not ok_footer:
            return jsonify({'ok': False, 'error': err_footer or 'Некорректный подвал'}), 400
    after = smtp_templates.get_template(template_id) or {}
    from shop_bot.data_manager.smtp_template_security import audit_details

    panel_ctx.audit(
        'mail_templates.save',
        audit_details(
            'mail_templates.save',
            template_id=template_id,
            before=before,
            after=after,
            extra={'sanitized': True},
        ),
    )
    return jsonify({'ok': True})


@bp.route('/settings/mail-templates/preview', methods=['POST'])
@panel_ctx.login_required
def settings_mail_templates_preview():
    if not _user_can_settings_tab('mail-templates'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import smtp_templates

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or '').strip()
    draft = payload.get('draft') or {}
    accent = (payload.get('accent') or smtp_templates.get_accent()).strip()

    if not template_id:
        return jsonify({'ok': False, 'error': 'Не указан шаблон'}), 400
    stored = smtp_templates.get_all_templates().get(template_id)
    if not stored:
        return jsonify({'ok': False, 'error': 'Шаблон не найден'}), 404
    fields = dict(stored)
    if isinstance(draft, dict) and draft:
        merged = {**stored, **{
            k: str(draft.get(k, '')) for k in (
                'subject', 'headline', 'body', 'cta_label', 'cta_url', 'preheader'
            )
        }}
        fields, err = _normalize_mail_fields(merged)
        if err:
            return jsonify({'ok': False, 'error': err}), 400
    subject, _, html_doc = smtp_templates.render_from_fields(
        fields,
        smtp_templates.sample_context(template_id),
        accent=accent,
        footer=str(payload['footer']) if 'footer' in payload else None,
    )
    return jsonify({'ok': True, 'subject': subject, 'html': html_doc})


@bp.route('/settings/mail-templates/reset', methods=['POST'])
@panel_ctx.login_required
def settings_mail_templates_reset():
    if not _user_can_settings_tab('mail-templates'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import smtp_templates

    payload = request.get_json(silent=True) or {}
    from shop_bot.data_manager.smtp_template_security import audit_details

    if payload.get('reset_footer'):
        smtp_templates.reset_footer()
        panel_ctx.audit(
            'mail_templates.reset',
            audit_details('mail_templates.reset', template_id='footer'),
        )
        return jsonify({'ok': True, 'footer': smtp_templates.get_footer()})

    template_id = (payload.get('template_id') or '').strip() or None
    before = smtp_templates.get_template(template_id) if template_id else None
    smtp_templates.reset_template(template_id)
    panel_ctx.audit(
        'mail_templates.reset',
        audit_details(
            'mail_templates.reset',
            template_id=template_id or 'all',
            before=before or {},
        ),
    )
    return jsonify({'ok': True, 'templates': smtp_templates.get_all_templates()})


@bp.route('/settings/mail-templates/send-test', methods=['POST'])
@panel_ctx.login_required
def settings_mail_templates_send_test():
    if not _user_can_settings_tab('mail-templates'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import smtp_mailer
    from shop_bot.data_manager import smtp_templates

    from shop_bot.data_manager.smtp_template_security import (
        audit_details,
        check_mail_test_rate_limit,
        validate_test_recipient,
    )

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or 'smtp_test').strip()
    admin_id = session.get('panel_admin_id')
    rate_err = check_mail_test_rate_limit(admin_id=admin_id, ip=_mail_client_ip())
    if rate_err:
        return jsonify({'ok': False, 'error': rate_err}), 429

    to_raw = (payload.get('to') or '').strip()
    if not to_raw:
        cfg = smtp_mailer.get_config()
        to_raw = cfg['recipients'][0] if cfg.get('recipients') else ''
    to = validate_test_recipient(to_raw)
    if not to:
        return jsonify({'ok': False, 'error': 'Укажите корректный email получателя'}), 400

    stored = smtp_templates.get_all_templates().get(template_id)
    if not stored:
        return jsonify({'ok': False, 'error': 'Шаблон не найден'}), 404
    draft = payload.get('draft') or {}
    fields = dict(stored)
    if isinstance(draft, dict) and draft:
        merged = {**stored, **{
            k: str(draft.get(k, '')) for k in (
                'subject', 'headline', 'body', 'cta_label', 'cta_url', 'preheader'
            )
        }}
        fields, err = _normalize_mail_fields(merged)
        if err:
            return jsonify({'ok': False, 'error': err}), 400
    subject, plain, html_doc = smtp_templates.render_from_fields(
        fields,
        smtp_templates.sample_context(template_id),
        footer=str(payload['footer']) if 'footer' in payload else None,
    )
    ok, message = smtp_mailer.send_mail(to=[to], subject=subject, text=plain, html=html_doc)
    panel_ctx.audit(
        'mail_templates.test',
        audit_details(
            'mail_templates.test',
            template_id=template_id,
            after=fields,
            extra={'to': to, 'ok': ok},
        ),
    )
    return jsonify({'ok': ok, 'message': message}), (200 if ok else 400)


@bp.route('/settings/bot-messages/data', methods=['GET'])
@panel_ctx.login_required
def settings_bot_messages_data():
    if not _user_can_settings_tab('content'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import bot_messages

    meta = []
    for tid in bot_messages.TEMPLATE_IDS:
        m = bot_messages.TEMPLATE_META.get(tid, {})
        meta.append({
            'id': tid,
            'label': m.get('label', tid),
            'icon': m.get('icon', 'chat'),
            'audience': m.get('audience', 'user'),
            'category': m.get('category', 'system'),
            'desc': m.get('desc', ''),
            'vars': m.get('vars', []),
        })
    return jsonify({
        'ok': True,
        'templates': bot_messages.get_all_templates(),
        'meta': meta,
        'brand': (get_setting('panel_brand_title') or 'Remnawave App').strip(),
    })


@bp.route('/settings/bot-messages/save', methods=['POST'])
@panel_ctx.login_required
def settings_bot_messages_save():
    if not _user_can_settings_tab('content'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import bot_messages

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or '').strip()
    if not template_id:
        return jsonify({'ok': False, 'error': 'Не указан шаблон'}), 400
    before = bot_messages.get_template(template_id) or {}
    ok_save, err = bot_messages.save_template(template_id, str(payload.get('text') or ''))
    if not ok_save:
        return jsonify({'ok': False, 'error': err or 'Ошибка сохранения'}), 400
    after = bot_messages.get_template(template_id) or {}
    panel_ctx.audit('bot_messages.save', {
        'template_id': template_id,
        'before': before,
        'after': after,
    })
    return jsonify({'ok': True})


@bp.route('/settings/bot-messages/preview', methods=['POST'])
@panel_ctx.login_required
def settings_bot_messages_preview():
    if not _user_can_settings_tab('content'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import bot_messages

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or '').strip()
    draft_text = payload.get('text')
    if not template_id:
        return jsonify({'ok': False, 'error': 'Не указан шаблон'}), 400
    text = str(draft_text if draft_text is not None else bot_messages.get_template_text(template_id))
    ctx = bot_messages.sample_context(template_id)
    rendered = bot_messages.render_vars(text, ctx)
    rendered = re.sub(r'\n{3,}', '\n\n', rendered).strip()
    return jsonify({'ok': True, 'html': rendered, 'length': len(rendered)})


@bp.route('/settings/bot-messages/reset', methods=['POST'])
@panel_ctx.login_required
def settings_bot_messages_reset():
    if not _user_can_settings_tab('content'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import bot_messages

    payload = request.get_json(silent=True) or {}
    template_id = (payload.get('template_id') or '').strip() or None
    before = bot_messages.get_template(template_id) if template_id else None
    bot_messages.reset_template(template_id)
    panel_ctx.audit('bot_messages.reset', {'template_id': template_id or 'all', 'before': before or {}})
    return jsonify({'ok': True, 'templates': bot_messages.get_all_templates()})


@bp.route('/settings/access/roles', methods=['POST'])
@panel_ctx.login_required
def settings_access_role_save():
    from shop_bot.data_manager.panel_rbac import ALL_PERMISSIONS

    role_id = request.form.get('role_id', type=int)
    name = (request.form.get('role_name') or '').strip()
    description = (request.form.get('role_description') or '').strip()
    permissions = request.form.getlist('permissions')
    permission_levels: dict[str, str] = {}
    for key in ALL_PERMISSIONS:
        val = (request.form.get(f'perm_level_{key}') or '').strip().lower()
        if val in ('view', 'edit'):
            permission_levels[key] = val
    existing = panel_access.get_role(role_id) if role_id else None
    is_superadmin = bool(existing and existing.get('is_superadmin'))
    ok, message = panel_access.save_role(
        role_id=role_id,
        name=name,
        description=description,
        permissions=permissions if not permission_levels else None,
        permission_levels=permission_levels or None,
        is_superadmin=is_superadmin,
    )
    if ok:
        panel_ctx.audit('role.save', {'role_id': role_id, 'name': name})
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))

@bp.route('/settings/access/roles/<int:role_id>/delete', methods=['POST'])
@panel_ctx.login_required
def settings_access_role_delete(role_id: int):
    ok, message = panel_access.delete_role(role_id)
    if ok:
        panel_ctx.audit('role.delete', {'role_id': role_id})
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))

@bp.route('/settings/access/admins', methods=['POST'])
@panel_ctx.login_required
def settings_access_admin_save():
    admin_id = request.form.get('admin_id', type=int)
    login = (request.form.get('admin_login') or '').strip()
    password = request.form.get('admin_password') or None
    if password == '':
        password = None
    role_id = request.form.get('admin_role_id', type=int)
    is_active = '1' in request.form.getlist('admin_is_active')
    ok, message = panel_access.save_admin(
        admin_id=admin_id,
        login=login,
        password=password,
        role_id=role_id or 0,
        is_active=is_active,
    )
    if ok:
        panel_ctx.audit('admin.save', {'admin_id': admin_id, 'login': login, 'role_id': role_id})
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))

@bp.route('/settings/access/invites/list', methods=['GET'])
@panel_ctx.login_required
def settings_access_invites_list():
    if not _user_can_settings_tab('access'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import panel_admin_invites

    can_manage = _user_can_settings_access_edit()
    invites = panel_admin_invites.list_invites()
    base_url = request.url_root.rstrip('/')
    payload = []
    for inv in invites:
        item = panel_admin_invites.sanitize_invite_for_api(
            inv,
            include_secrets=False,
            include_url=can_manage,
            base_url=base_url,
        )
        if can_manage and inv.get('status') == 'active':
            item['can_copy'] = bool(item.get('url'))
            item['can_revoke'] = True
        payload.append(item)
    active = sum(1 for i in invites if i.get('status') == 'active')
    return jsonify({'ok': True, 'invites': payload, 'active_count': active, 'can_manage': can_manage})


@bp.route('/settings/access/invites', methods=['POST'])
@panel_ctx.login_required
def settings_access_invite_create():
    if not _user_can_settings_access_edit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import panel_admin_invites

    payload = request.get_json(silent=True) if request.is_json else request.form.to_dict()
    try:
        role_id = int(payload.get('role_id') or 0)
    except (TypeError, ValueError):
        role_id = 0
    note = (payload.get('note') or '').strip()
    email_hint = (payload.get('email_hint') or '').strip()
    try:
        expires_days = int(payload.get('expires_days') or panel_admin_invites.DEFAULT_EXPIRES_DAYS)
    except (TypeError, ValueError):
        expires_days = panel_admin_invites.DEFAULT_EXPIRES_DAYS
    try:
        max_uses = int(payload.get('max_uses') or panel_admin_invites.DEFAULT_MAX_USES)
    except (TypeError, ValueError):
        max_uses = panel_admin_invites.DEFAULT_MAX_USES

    ok, message, invite, raw_token = panel_admin_invites.create_invite(
        role_id=role_id,
        created_by_admin_id=session.get('panel_admin_id'),
        created_by_login=session.get('panel_login') or '',
        note=note,
        email_hint=email_hint,
        expires_days=expires_days,
        max_uses=max_uses,
    )
    if ok and invite and raw_token:
        base_url = request.url_root.rstrip('/')
        invite_payload = panel_admin_invites.sanitize_invite_for_api(
            invite,
            include_secrets=True,
            raw_token=raw_token,
            base_url=base_url,
        )
        panel_ctx.audit('invite.created', {
            'token_prefix': invite.get('token_prefix') or raw_token[:8],
            'role_id': invite['role_id'],
            'role_name': invite.get('role_name'),
            'expires_at': invite.get('expires_at'),
            'max_uses': invite.get('max_uses'),
            'note': note[:120] if note else '',
        })
        return jsonify({'ok': True, 'message': message, 'invite': invite_payload})
    return jsonify({'ok': False, 'error': message}), 400


@bp.route('/settings/access/invites/<int:invite_id>/url', methods=['GET'])
@panel_ctx.login_required
def settings_access_invite_url(invite_id: int):
    if not _user_can_settings_access_edit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import panel_admin_invites

    invite = panel_admin_invites.get_invite_by_id(invite_id)
    if not invite:
        return jsonify({'ok': False, 'error': 'Приглашение не найдено'}), 404
    if invite.get('status') != 'active':
        return jsonify({'ok': False, 'error': 'Ссылка недоступна для неактивного приглашения'}), 400

    base_url = request.url_root.rstrip('/')
    url = panel_admin_invites.get_invite_url(invite, base_url=base_url)
    if not url:
        return jsonify({
            'ok': False,
            'error': 'Ссылка недоступна — создайте новое приглашение или обновите ссылку',
            'can_regenerate': True,
        }), 404

    panel_ctx.audit('invite.url_viewed', {
        'invite_id': invite_id,
        'token_prefix': invite.get('token_prefix') or '',
        'role_name': invite.get('role_name'),
    })
    return jsonify({'ok': True, 'url': url})


@bp.route('/settings/access/invites/<int:invite_id>/regenerate', methods=['POST'])
@panel_ctx.login_required
def settings_access_invite_regenerate(invite_id: int):
    if not _user_can_settings_access_edit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import panel_admin_invites

    ok, message, invite, raw_token = panel_admin_invites.regenerate_invite_token(invite_id)
    if not ok:
        return jsonify({'ok': False, 'error': message}), 400

    base_url = request.url_root.rstrip('/')
    invite_payload = panel_admin_invites.sanitize_invite_for_api(
        invite or {},
        include_secrets=True,
        raw_token=raw_token,
        base_url=base_url,
    )
    panel_ctx.audit('invite.regenerated', {
        'invite_id': invite_id,
        'token_prefix': (invite or {}).get('token_prefix') or '',
        'role_name': (invite or {}).get('role_name'),
    })
    return jsonify({'ok': True, 'message': message, 'invite': invite_payload, 'url': invite_payload.get('url')})


@bp.route('/settings/access/invites/<int:invite_id>/revoke', methods=['POST'])
@panel_ctx.login_required
def settings_access_invite_revoke(invite_id: int):
    if not _user_can_settings_access_edit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    from shop_bot.data_manager import panel_admin_invites

    ok, message, invite = panel_admin_invites.revoke_invite_by_id(invite_id)
    if ok:
        panel_ctx.audit('invite.revoked', {
            'token_prefix': (invite or {}).get('token_prefix') or '',
            'role_name': (invite or {}).get('role_name'),
        })
        invite_payload = panel_admin_invites.sanitize_invite_for_api(
            invite or {},
            include_secrets=False,
        ) if invite else None
        return jsonify({'ok': True, 'message': message, 'invite': invite_payload})
    return jsonify({'ok': False, 'error': message}), 400

@bp.route('/settings/access/admins/<int:admin_id>/delete', methods=['POST'])
@panel_ctx.login_required
def settings_access_admin_delete(admin_id: int):
    ok, message = panel_access.delete_admin(
        admin_id,
        current_admin_id=session.get('panel_admin_id'),
    )
    if ok:
        panel_ctx.audit('admin.delete', {'admin_id': admin_id})
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))

@bp.route('/settings/access/totp/begin', methods=['POST'])
@panel_ctx.login_required
def settings_totp_begin():
    admin_id = session.get('panel_admin_id')
    if not admin_id:
        flash('Сессия недействительна', 'danger')
        return panel_ctx.totp_flow_redirect()
    secret = panel_totp.generate_secret()
    panel_totp.store_pending_secret(admin_id, secret)
    panel_ctx.audit('totp.setup_begin')
    flash('Сканируйте QR или введите секретный ключ ниже', 'success')
    return panel_ctx.totp_flow_redirect()

@bp.route('/settings/access/totp/enable', methods=['POST'])
@panel_ctx.login_required
def settings_totp_enable():
    admin_id = session.get('panel_admin_id')
    code = (request.form.get('totp_code') or '').strip()
    ok, message = panel_totp.enable_totp(admin_id, code)
    if ok:
        panel_ctx.audit('totp.enabled')
    flash(message, 'success' if ok else 'danger')
    return panel_ctx.totp_flow_redirect(success=ok)

@bp.route('/settings/access/totp/disable', methods=['POST'])
@panel_ctx.login_required
def settings_totp_disable():
    admin_id = session.get('panel_admin_id')
    code = (request.form.get('totp_code') or '').strip()
    ok, message = panel_totp.disable_totp(admin_id, code)
    if ok:
        panel_ctx.audit('totp.disabled')
    flash(message, 'success' if ok else 'danger')
    return panel_ctx.totp_flow_redirect()

@bp.route('/settings/access/totp/cancel', methods=['POST'])
@panel_ctx.login_required
def settings_totp_cancel():
    admin_id = session.get('panel_admin_id')
    panel_totp.cancel_setup(admin_id)
    flash('Настройка 2FA отменена', 'info')
    return panel_ctx.totp_flow_redirect()


@bp.route('/settings/access/security-method', methods=['POST'])
@panel_ctx.login_required
def settings_security_method_save():
    admin_id = session.get('panel_admin_id')
    method = (request.form.get('auth_security_method') or panel_security.SECURITY_NONE).strip()
    if panel_totp.require_totp_globally() and method == panel_security.SECURITY_NONE:
        method = panel_security.SECURITY_TOTP
    ok, message = panel_security.set_security_method(int(admin_id), method)
    flash(message, 'success' if ok else 'danger')
    if ok:
        panel_ctx.audit('security.method_changed', {'method': method})
    return panel_ctx.totp_flow_redirect(success=ok)


@bp.route('/settings/access/auth-methods', methods=['POST'])
@panel_ctx.login_required
def settings_access_auth_methods():
    if not session.get('panel_is_superadmin') and 'settings_access' not in (session.get('panel_permissions') or []):
        flash('Недостаточно прав', 'danger')
        return redirect(url_for('settings_tab_page', tab='access'))

    for key, default in SETTINGS_TAB_CHECKBOXES.get('access', {}).items():
        update_setting(key, '1' if request.form.get(key) else default)

    panel_ctx.audit('auth_methods.updated', {
        'telegram_login_enabled': request.form.get('telegram_login_enabled') == 'on',
        'passkey_login_enabled': request.form.get('passkey_login_enabled') == 'on',
    })
    flash('Методы входа обновлены', 'success')
    return redirect(url_for('settings_tab_page', tab='access'))


@bp.route('/settings/access/telegram/link', methods=['POST'])
@panel_ctx.login_required
def settings_telegram_link():
    admin_id = session.get('panel_admin_id')
    payload = request.get_json(silent=True) or request.form.to_dict()
    ok, message = panel_telegram_auth.link_telegram_to_admin(int(admin_id), payload)
    if ok:
        panel_ctx.audit('telegram.linked', {'telegram_id': payload.get('id')})
    if request.is_json or request.headers.get('Accept') == 'application/json':
        status = 200 if ok else 400
        return jsonify({'ok': ok, 'message': message}), status
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))


@bp.route('/settings/access/telegram/unlink', methods=['POST'])
@panel_ctx.login_required
def settings_telegram_unlink():
    admin_id = session.get('panel_admin_id')
    ok, message = panel_telegram_auth.unlink_telegram_from_admin(int(admin_id))
    if ok:
        panel_ctx.audit('telegram.unlinked')
    if request.is_json or request.headers.get('Accept') == 'application/json':
        status = 200 if ok else 400
        return jsonify({'ok': ok, 'message': message}), status
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))


@bp.route('/settings/access/passkey/register/options', methods=['POST'])
@panel_ctx.login_required
def settings_passkey_register_options():
    admin_id = session.get('panel_admin_id')
    login = session.get('panel_login') or ''
    try:
        begin = panel_webauthn.begin_registration(int(admin_id), login, request)
    except RuntimeError as exc:
        return jsonify({'ok': False, 'error': str(exc)}), 503
    session['webauthn_reg_challenge'] = begin['challenge']
    return jsonify({'ok': True, 'options': begin['options']})


@bp.route('/settings/access/passkey/register/complete', methods=['POST'])
@panel_ctx.login_required
def settings_passkey_register_complete():
    admin_id = session.get('panel_admin_id')
    body = request.get_json(silent=True) or {}
    challenge = session.pop('webauthn_reg_challenge', None)
    if not challenge:
        return jsonify({'ok': False, 'error': 'Сессия регистрации истекла'}), 400
    ok, message = panel_webauthn.complete_registration(
        int(admin_id),
        challenge_b64=challenge,
        credential=body.get('credential') or body,
        label=(body.get('label') or 'Passkey').strip(),
        request=request,
    )
    if ok:
        panel_ctx.audit('passkey.registered', {'label': body.get('label')})
    return jsonify({'ok': ok, 'message': message}), (200 if ok else 400)


@bp.route('/settings/access/passkey/<int:credential_id>/delete', methods=['POST'])
@panel_ctx.login_required
def settings_passkey_delete(credential_id: int):
    admin_id = session.get('panel_admin_id')
    ok, message = panel_webauthn.delete_credential(int(admin_id), credential_id)
    if ok:
        panel_ctx.audit('passkey.deleted', {'credential_id': credential_id})
    if request.is_json or request.headers.get('Accept') == 'application/json':
        return jsonify({'ok': ok, 'message': message}), (200 if ok else 400)
    flash(message, 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='access'))

@bp.route('/settings/access/roles/<int:role_id>/duplicate', methods=['POST'])
@panel_ctx.login_required
def settings_access_role_duplicate(role_id: int):
    if not _user_can_settings_tab('access'):
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    ok, message, new_id = panel_access.duplicate_role(role_id)
    if ok:
        panel_ctx.audit('role.save', {'role_id': new_id, 'duplicated_from': role_id})
    if request.is_json or request.headers.get('Accept') == 'application/json':
        return jsonify({'ok': ok, 'message': message, 'role_id': new_id}), (200 if ok else 400)
    flash(message, 'success' if ok else 'danger')
    if ok and new_id:
        return redirect(url_for('settings_tab_page', tab='access', role_id=new_id))
    return redirect(url_for('settings_tab_page', tab='access'))


@bp.route('/settings/access/audit/list', methods=['GET'])
@panel_ctx.login_required
def settings_access_audit_list():
    if not _user_can_audit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    offset = request.args.get('offset', 0, type=int)
    limit = request.args.get('limit', 40, type=int)
    rows, total = panel_audit.list_filtered(
        **_audit_filter_args(),
        offset=offset,
        limit=limit,
    )
    return jsonify({
        'ok': True,
        'entries': [panel_audit.humanize_entry(e) for e in rows],
        'total': total,
        'offset': max(0, offset),
        'limit': limit,
    })


@bp.route('/settings/access/audit/export')
@panel_ctx.login_required
def settings_access_audit_export():
    if not _user_can_audit():
        flash('Недостаточно прав', 'danger')
        return redirect(url_for('settings_tab_page', tab='access'))
    from io import BytesIO

    filters = _audit_filter_args()
    csv_text = panel_audit.export_csv_filtered(**filters, limit=10000)
    ts = get_msk_time().strftime('%Y%m%d-%H%M%S')
    panel_ctx.audit('audit.export', {'rows': csv_text.count(chr(10)), 'filtered': bool(any(filters.values()))})
    payload = BytesIO(csv_text.encode('utf-8-sig'))
    payload.seek(0)
    return send_file(
        payload,
        mimetype='text/csv; charset=utf-8',
        as_attachment=True,
        download_name=f'panel-audit-{ts}.csv',
    )


@bp.route('/settings/audit/stats', methods=['GET'])
@panel_ctx.login_required
def settings_audit_stats():
    if not _user_can_audit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    return jsonify({'ok': True, **panel_audit.get_stats()})


@bp.route('/settings/audit/catalog', methods=['GET'])
@panel_ctx.login_required
def settings_audit_catalog():
    if not _user_can_audit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    return jsonify({
        'ok': True,
        'groups': panel_audit.ACTION_GROUPS,
        'actions': panel_audit.list_action_catalog(),
        'admins': panel_audit.list_distinct_admins(),
    })


@bp.route('/settings/audit/list', methods=['GET'])
@panel_ctx.login_required
def settings_audit_list():
    if not _user_can_audit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    offset = request.args.get('offset', 0, type=int)
    limit = request.args.get('limit', 50, type=int)
    rows, total = panel_audit.list_filtered(
        **_audit_filter_args(),
        offset=offset,
        limit=limit,
    )
    return jsonify({
        'ok': True,
        'entries': [panel_audit.humanize_entry(e) for e in rows],
        'total': total,
        'offset': max(0, offset),
        'limit': limit,
    })


@bp.route('/settings/audit/entry/<int:entry_id>', methods=['GET'])
@panel_ctx.login_required
def settings_audit_entry(entry_id: int):
    if not _user_can_audit():
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    entry = panel_audit.get_entry(entry_id)
    if not entry:
        return jsonify({'ok': False, 'error': 'Запись не найдена'}), 404
    return jsonify({'ok': True, 'entry': entry})


@bp.route('/settings/audit/export')
@panel_ctx.login_required
def settings_audit_export():
    if not _user_can_audit():
        flash('Недостаточно прав', 'danger')
        return redirect(url_for('settings_tab_page', tab='audit'))
    from io import BytesIO

    filters = _audit_filter_args()
    csv_text = panel_audit.export_csv_filtered(**filters, limit=10000)
    ts = get_msk_time().strftime('%Y%m%d-%H%M%S')
    panel_ctx.audit('audit.export', {'rows': csv_text.count(chr(10)), 'filtered': bool(any(filters.values()))})
    payload = BytesIO(csv_text.encode('utf-8-sig'))
    payload.seek(0)
    return send_file(
        payload,
        mimetype='text/csv; charset=utf-8',
        as_attachment=True,
        download_name=f'panel-audit-{ts}.csv',
    )


@bp.route('/api/settings/update-pay-info', methods=['POST'])
@panel_ctx.login_required
def update_pay_info_api():
    data = request.get_json()
    if not data:
         return jsonify({'status': 'error', 'message': 'No data provided'}), 400
        
    field = data.get('field')
    value = data.get('value')
    
    valid_fields = ['id', 'username', 'first_name', 'host_name']
    if field not in valid_fields:
        return jsonify({'status': 'error', 'message': f'Invalid field: {field}'}), 400
        
    try:
        current_json = get_setting('pay_info_comment')
        pay_info = json.loads(current_json) if current_json else {}
    except (ValueError, TypeError):
        pay_info = {}
        

         
    pay_info[field] = 1 if value else 0
    
    update_setting('pay_info_comment', json.dumps(pay_info))
    return jsonify({'status': 'success', 'pay_info': pay_info})






@bp.route('/admin/db/backup', methods=['POST'])
@panel_ctx.login_required
def backup_db_route():
    try:
        created = backup_manager.create_backup_file()
        zip_path = created.path
        if not zip_path or not os.path.isfile(zip_path):
            flash('Не удалось создать бэкап БД.', 'danger')
            return redirect(request.referrer or url_for('backups_page'))

        return send_file(str(zip_path), as_attachment=True, download_name=os.path.basename(zip_path))
    except Exception as e:
        logger.error(f"Ошибка резервного копирования БД: {e}")
        flash('Ошибка при создании бэкапа.', 'danger')
        return redirect(request.referrer or url_for('backups_page'))

@bp.route('/admin/db/restore', methods=['POST'])
@panel_ctx.login_required
def restore_db_route():
    from shop_bot.data_manager import panel_stepup as ps

    if ps.required_stepup_method(_current_panel_admin_id() or 0) and not ps.has_valid_stepup(ps.SCOPE_DESTRUCTIVE):
        flash('Подтвердите 2FA перед восстановлением (Настройки → База данных или баннер ниже).', 'warning')
        return panel_ctx.safe_redirect(request.referrer, 'backups_page')
    try:

        existing = (request.form.get('existing_backup') or '').strip()
        ok = False
        result: dict = {}
        restore_db = request.form.get('restore_database', '1') != '0'
        restore_files = request.form.get('restore_files') == '1'
        restore_rw = request.form.get('restore_remnawave') == '1'
        backup_password = (request.form.get('backup_password') or '').strip() or None
        if existing:

            candidate = backup_manager.resolve_backup_path(existing)
            if candidate and os.path.isfile(candidate):
                result = backup_manager.restore_from_file(
                    candidate,
                    restore_database=restore_db,
                    restore_files=restore_files,
                    restore_remnawave=restore_rw,
                    backup_password=backup_password,
                )
                ok = result.get('ok')
            else:
                flash('Выбранный бэкап не найден.', 'danger')
                return redirect(request.referrer or url_for('backups_page'))
        else:

            file = request.files.get('db_file')
            if not file or file.filename == '':
                flash('Файл для восстановления не выбран.', 'warning')
                return redirect(request.referrer or url_for('backups_page'))
            filename = file.filename.lower()
            if not (filename.endswith('.zip') or filename.endswith('.sql') or filename.endswith('.db')):
                flash('Поддерживаются файлы .zip, .sql или .db', 'warning')
                return redirect(request.referrer or url_for('backups_page'))
            ts = get_msk_time().strftime('%Y%m%d-%H%M%S')
            dest_dir = backup_manager.BACKUPS_DIR
            try:
                dest_dir.mkdir(parents=True, exist_ok=True)
            except Exception:
                pass
            dest_path = dest_dir / f"uploaded-{ts}-{os.path.basename(filename)}"
            file.save(dest_path)
            result = backup_manager.restore_from_file(
                dest_path,
                restore_database=restore_db,
                restore_files=restore_files,
                restore_remnawave=restore_rw,
                backup_password=backup_password,
            )
            ok = result.get('ok')
        if ok:
            parts = []
            if result.get('database_restored'):
                parts.append('база shopbot')
            if result.get('files_restored'):
                parts.append(f"файлов: {result['files_restored']}")
            if result.get('remnawave_restored'):
                parts.append('Remnawave')
            flash(
                'Восстановление выполнено' + (f" ({', '.join(parts)})" if parts else '') + '.',
                'success',
            )
            panel_ctx.audit('db.restore', {'source': existing or 'upload'})
        else:
            err = '; '.join(result.get('errors') or []) or 'неизвестная ошибка'
            flash(f'Восстановление не удалось: {err[:400]}', 'danger')
        return redirect(request.referrer or url_for('backups_page'))
    except Exception as e:
        logger.error(f"Ошибка восстановления БД: {e}", exc_info=True)
        flash('Ошибка при восстановлении БД.', 'danger')
        return redirect(request.referrer or url_for('backups_page'))

@bp.route('/update-host-subscription', methods=['POST'])
@panel_ctx.login_required
def update_host_subscription_route():
    host_name = (request.form.get('host_name') or '').strip()
    sub_url = (request.form.get('host_subscription_url') or '').strip()
    if not host_name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Не указан хост'}), 400
        flash('Не указан хост для обновления ссылки подписки.', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    ok = update_host_subscription_url(host_name, sub_url or None)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'Ссылка подписки обновлена' if ok else 'Не удалось обновить ссылку'})

    if ok:
        flash('Ссылка подписки для хоста обновлена.', 'success')
    else:
        flash('Не удалось обновить ссылку подписки для хоста (возможно, хост не найден).', 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-description', methods=['POST'])
@panel_ctx.login_required
def update_host_description_route():
    host_name = (request.form.get('host_name') or '').strip()
    description = (request.form.get('host_description') or '').strip()
    if not host_name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Не указан хост'}), 400
        flash('Не указан хост для обновления описания.', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    ok = update_host_description(host_name, description or None)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'Описание обновлено' if ok else 'Не удалось обновить описание'})

    if ok:
        flash('Описание для хоста обновлено.', 'success')
    else:
        flash('Не удалось обновить описание для хоста (возможно, хост не найден).', 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-traffic-settings', methods=['POST'])
@panel_ctx.login_required
def update_host_traffic_settings_route():
    host_name = (request.form.get('host_name') or '').strip()
    strategy = (request.form.get('traffic_limit_strategy') or 'NO_RESET')
    
    if not host_name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Не указан хост'}), 400
        flash('Не указан хост для обновления настроек трафика.', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))
        
    ok = update_host_traffic_settings(host_name, strategy)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'Настройки трафика обновлены' if ok else 'Не удалось обновить настройки'})

    if ok:
        flash('Настройки трафика для хоста обновлены.', 'success')
    else:
        flash('Не удалось обновить настройки трафика (возможно, хост не найден).', 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))


@bp.route('/update-host-url', methods=['POST'])
@panel_ctx.login_required
def update_host_url_route():
    host_name = (request.form.get('host_name') or '').strip()
    new_url = (request.form.get('host_url') or '').strip()
    if not host_name or not new_url:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Не указан хост или URL'}), 400
        flash('Укажите имя хоста и новый URL.', 'warning')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    ok = update_host_url(host_name, new_url)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'URL хоста обновлён' if ok else 'Не удалось обновить URL'})

    flash('URL хоста обновлён.' if ok else 'Не удалось обновить URL хоста.', 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-remnawave', methods=['POST'])
@panel_ctx.login_required
def update_host_remnawave_route():
    host_name = (request.form.get('host_name') or '').strip()
    base_url = (request.form.get('remnawave_base_url') or '').strip()
    api_token = (request.form.get('remnawave_api_token') or '').strip()
    squad_uuid = (request.form.get('squad_uuid') or '').strip()
    if not host_name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Не указан хост'}), 400
        flash('Не указан хост для обновления Remnawave-настроек.', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    ok = update_host_remnawave_settings(
        host_name,
        remnawave_base_url=base_url or None,
        remnawave_api_token=api_token or None,
        squad_uuid=squad_uuid or None,
    )

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'Remnawave-настройки обновлены' if ok else 'Не удалось обновить Remnawave-настройки'})

    flash('Remnawave-настройки обновлены.' if ok else 'Не удалось обновить Remnawave-настройки.', 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-base-devices', methods=['POST'])
@panel_ctx.login_required
def update_host_base_devices_route():
    host_name = (request.form.get('host_name') or '').strip()
    count = request.form.get('count')
    try:
        count = int(count)
        if count < 1: count = 1
    except Exception:
        count = 1
    if host_name:
        update_setting(f"base_device_{host_name}", str(count))
        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify({'ok': True, 'count': count})
    return jsonify({'ok': False, 'error': 'Invalid request'}), 400


@bp.route('/rename-host', methods=['POST'])
@panel_ctx.login_required
def rename_host_route():
    old_name = (request.form.get('old_host_name') or '').strip()
    new_name = (request.form.get('new_host_name') or '').strip()
    if not old_name or not new_name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': False, 'error': 'Укажите старое и новое имя'}), 400
        flash('Введите старое и новое имя хоста.', 'warning')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    ok = update_host_name(old_name, new_name)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': ok, 'message': 'Имя хоста обновлено' if ok else 'Не удалось переименовать хост'})

    flash('Имя хоста обновлено.' if ok else 'Не удалось переименовать хост.', 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-button-style', methods=['POST'])
@panel_ctx.login_required
def update_host_button_style_route():
    host_name = (request.form.get('host_name') or '').strip()
    button_style = (request.form.get('button_style') or '').strip()
    icon_emoji_id = (request.form.get('icon_emoji_id') or '').strip()
    ok = update_host_button_style(host_name, button_style or None, icon_emoji_id or None)
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'ok': ok})
    flash('Стиль кнопки хоста обновлён.' if ok else 'Ошибка.', 'success' if ok else 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/start-support-bot', methods=['POST'])
@panel_ctx.login_required
def start_support_bot_route():
    loop = current_app.config.get('EVENT_LOOP')
    if loop and loop.is_running():
        panel_ctx.support_bot_controller.set_loop(loop)
    result = panel_ctx.support_bot_controller.start()
    flash(result['message'], 'success' if result['status'] == 'success' else 'danger')
    return redirect(request.referrer or url_for('settings_tab_page', tab='panel'))

def _wait_for_stop(controller, timeout: float = 5.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        status = controller.get_status() or {}
        if not status.get('is_running'):
            return True
        time.sleep(0.1)
    return False

@bp.route('/stop-support-bot', methods=['POST'])
@panel_ctx.login_required
def stop_support_bot_route():
    result = panel_ctx.support_bot_controller.stop()
    _wait_for_stop(panel_ctx.support_bot_controller)
    flash(result['message'], 'success' if result['status'] == 'success' else 'danger')
    return redirect(request.referrer or url_for('settings_tab_page', tab='panel'))

@bp.route('/start-bot', methods=['POST'])
@panel_ctx.login_required
def start_bot_route():
    result = panel_ctx.bot_controller.start()
    if result.get('status') == 'success':
        panel_ctx.audit('bot.start', {'bot': 'main'})
    flash(result['message'], 'success' if result['status'] == 'success' else 'danger')
    return redirect(request.referrer or url_for('dashboard_page'))

@bp.route('/stop-bot', methods=['POST'])
@panel_ctx.login_required
def stop_bot_route():
    result = panel_ctx.bot_controller.stop()
    _wait_for_stop(panel_ctx.bot_controller)
    if result.get('status') == 'success':
        panel_ctx.audit('bot.stop', {'bot': 'main'})
    flash(result['message'], 'success' if result['status'] == 'success' else 'danger')
    return redirect(request.referrer or url_for('dashboard_page'))

@bp.route('/stop-both-bots', methods=['POST'])
@panel_ctx.login_required
def stop_both_bots_route():
    main_result = panel_ctx.bot_controller.stop()
    support_result = panel_ctx.support_bot_controller.stop()

    statuses = []
    categories = []
    for name, res in [('Основной бот', main_result), ('Support-бот', support_result)]:
        if res.get('status') == 'success':
            statuses.append(f"{name}: остановлен")
            categories.append('success')
        else:
            statuses.append(f"{name}: ошибка — {res.get('message')}")
            categories.append('danger')
    _wait_for_stop(panel_ctx.bot_controller)
    _wait_for_stop(panel_ctx.support_bot_controller)
    category = 'danger' if 'danger' in categories else 'success'
    message = ' | '.join(statuses)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'ok': category == 'success', 'message': message})
    
    flash(message, category)
    return redirect(request.referrer or url_for('dashboard_page'))

@bp.route('/start-both-bots', methods=['POST'])
@panel_ctx.login_required
def start_both_bots_route():
    main_result = panel_ctx.bot_controller.start()
    loop = current_app.config.get('EVENT_LOOP')
    if loop and loop.is_running():
        panel_ctx.support_bot_controller.set_loop(loop)
    support_result = panel_ctx.support_bot_controller.start()

    statuses = []
    categories = []
    for name, res in [('Основной бот', main_result), ('Support-бот', support_result)]:
        if res.get('status') == 'success':
            statuses.append(f"{name}: запущен")
            categories.append('success')
        else:
            statuses.append(f"{name}: ошибка — {res.get('message')}")
            categories.append('danger')
    category = 'danger' if 'danger' in categories else 'success'
    message = ' | '.join(statuses)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'ok': category == 'success', 'message': message})
    
    flash(message, category)
    return redirect(request.referrer or url_for('settings_tab_page', tab='panel'))

@bp.route('/add-host', methods=['POST'])
@panel_ctx.login_required
def add_host_route():
    name = (request.form.get('host_name') or '').strip()
    base_url = (request.form.get('remnawave_base_url') or '').strip()
    api_token = (request.form.get('remnawave_api_token') or '').strip()
    squad_uuid = (request.form.get('squad_uuid') or '').strip()
    if not name or not base_url or not api_token:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': False, 'error': 'Укажите название хоста, базовый URL и API токен.'}), 400
        flash('Укажите название хоста, базовый URL и API токен.', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))


    try:
        create_host(
            name=name,
            url=base_url,
            user='',
            passwd='',
            inbound=0,
            subscription_url=None,
        )
    except Exception as e:
        logger.error(f"Не удалось создать хост '{name}': {e}")
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': False, 'error': f"Не удалось создать хост '{name}'."}), 500
        flash(f"Не удалось создать хост '{name}'.", 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))


    try:
        update_host_remnawave_settings(
            name,
            remnawave_base_url=base_url,
            remnawave_api_token=api_token,
            squad_uuid=squad_uuid or None,
        )
    except Exception as e:
        logger.error(f"Не удалось сохранить Remnawave-настройки для '{name}': {e}")
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
             return jsonify({'ok': True, 'message': 'Хост создан, но настройки Remnawave не сохранены'}), 200 # Partial success
        flash('Хост создан, но Remnawave-настройки сохранить не удалось.', 'warning')
        return redirect(url_for('settings_tab_page', tab='hosts'))

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': True, 'message': f"Хост '{name}' успешно добавлен"})

    flash(f"Хост '{name}' успешно добавлен.", 'success')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/delete-host/<host_name>', methods=['POST'])
@panel_ctx.login_required
def delete_host_route(host_name):
    delete_host(host_name)
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         return jsonify({'ok': True, 'message': f"Хост '{host_name}' удален"})
    flash(f"Хост '{host_name}' и все его тарифы были удалены.", 'success')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/toggle-host-visibility/<host_name>', methods=['POST'])
@panel_ctx.login_required
def toggle_host_visibility_route(host_name):
    visible = request.form.get('visible', '1')
    try:
        visible_int = int(visible)
    except (ValueError, TypeError):
        visible_int = 1
    
    ok = toggle_host_visibility(host_name, visible_int)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
         status_text = "показан" if visible_int == 1 else "скрыт"
         return jsonify({'ok': ok, 'message': f"Хост '{host_name}' теперь {status_text}" if ok else "Ошибка обновления видимости"})

    if ok:
        status_text = "показан" if visible_int == 1 else "скрыт"
        flash(f"Хост '{host_name}' теперь {status_text} в меню бота.", 'success')
    else:
        flash(f"Не удалось изменить видимость хоста '{host_name}'.", 'danger')
    return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/add-plan', methods=['POST'])
@panel_ctx.login_required
def add_plan_route():
    try:
        host_name = request.form.get('host_name')
        plan_name = request.form.get('plan_name')
        months = int(request.form.get('months'))
        price = float(request.form.get('price'))
        hwid_limit = int(request.form.get('hwid_limit') or 0)
        traffic_limit_gb = int(request.form.get('traffic_limit_gb') or 0)
        
        button_style = (request.form.get('button_style') or '').strip() or None
        icon_emoji_id = (request.form.get('icon_emoji_id') or '').strip() or None
        new_plan_id = create_plan(host_name=host_name, plan_name=plan_name, months=months, price=price, hwid_limit=hwid_limit, traffic_limit_gb=traffic_limit_gb, button_style=button_style, icon_emoji_id=icon_emoji_id)
        
        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            plan = get_plan_by_id(new_plan_id) if new_plan_id else None
            return jsonify({'ok': True, 'plan': plan})
        
        flash(f"Новый тариф для хоста '{host_name}' добавлен.", 'success')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    except Exception as e:
        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify({'ok': False, 'error': str(e)}), 400
        flash(f'Ошибка добавления тарифа: {e}', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/delete-plan/<int:plan_id>', methods=['POST'])
@panel_ctx.login_required
def delete_plan_route(plan_id):
    try:
        delete_plan(plan_id)
        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify({'ok': True})
        flash("Тариф успешно удален.", 'success')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    except Exception as e:
        wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if wants_json:
            return jsonify({'ok': False, 'error': str(e)}), 400
        flash(f'Ошибка удаления тарифа: {e}', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-plan/<int:plan_id>', methods=['POST'])
@panel_ctx.login_required
def update_plan_route(plan_id):
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    try:
        plan_name = (request.form.get('plan_name') or '').strip()
        months = int(request.form.get('months'))
        price = float(request.form.get('price'))
        hwid_limit = int(request.form.get('hwid_limit') or 0)
        traffic_limit_gb = int(request.form.get('traffic_limit_gb') or 0)

        if not plan_name:
            if wants_json:
                return jsonify({'ok': False, 'error': 'Название не может быть пустым'}), 400
            flash('Название тарифа не может быть пустым.', 'danger')
            return redirect(url_for('settings_tab_page', tab='hosts'))

        button_style = (request.form.get('button_style') or '').strip() or None
        icon_emoji_id = (request.form.get('icon_emoji_id') or '').strip() or None
        ok = update_plan(plan_id, plan_name, months, price, hwid_limit=hwid_limit, traffic_limit_gb=traffic_limit_gb, button_style=button_style, icon_emoji_id=icon_emoji_id)
        if ok:
            if wants_json:
                plan = get_plan_by_id(plan_id)
                return jsonify({'ok': True, 'plan': plan})
            flash('Тариф обновлён.', 'success')
        else:
            if wants_json:
                return jsonify({'ok': False, 'error': 'Тариф не найден'}), 404
            flash('Не удалось обновить тариф (возможно, он не найден).', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))
    except Exception as e:
        if wants_json:
            return jsonify({'ok': False, 'error': str(e)}), 400
        flash(f'Ошибка обновления тарифа: {e}', 'danger')
        return redirect(url_for('settings_tab_page', tab='hosts'))

@bp.route('/update-host-device-mode', methods=['POST'])
@panel_ctx.login_required
def update_host_device_mode_route():
    host_name = (request.form.get('host_name') or '').strip()
    mode = request.form.get('device_mode', 'plan')
    if mode not in ('plan', 'tiers'):
        mode = 'plan'
    ok = update_host_device_mode(host_name, mode)
    return jsonify({'ok': ok})

@bp.route('/update-tier-lock-extend', methods=['POST'])
@panel_ctx.login_required
def update_tier_lock_extend_route():
    host_name = (request.form.get('host_name') or '').strip()
    val = 1 if request.form.get('value') == '1' else 0
    from shop_bot.data_manager.database import _exec
    r = _exec("UPDATE xui_hosts SET tier_lock_extend=? WHERE TRIM(host_name)=TRIM(?)", (val, host_name))
    return jsonify({'ok': r > 0})

@bp.route('/add-device-tier', methods=['POST'])
@panel_ctx.login_required
def add_device_tier_route():
    try:
        host_name = (request.form.get('host_name') or '').strip()
        device_count = int(request.form.get('device_count', 0))
        price = float(request.form.get('price', 0))
        tier_id = add_device_tier(host_name, device_count, price)
        return jsonify({'ok': bool(tier_id), 'tier_id': tier_id})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

@bp.route('/delete-device-tier/<int:tier_id>', methods=['POST'])
@panel_ctx.login_required
def delete_device_tier_route(tier_id):
    ok = delete_device_tier(tier_id)
    return jsonify({'ok': ok})

@bp.route('/edit-device-tier/<int:tier_id>', methods=['POST'])
@panel_ctx.login_required
def edit_device_tier_route(tier_id):
    try:
        device_count = int(request.form.get('device_count', 0))
        price = float(request.form.get('price', 0))
        from shop_bot.data_manager.database import update_device_tier
        ok = update_device_tier(tier_id, device_count, price)
        return jsonify({'ok': ok})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 400

def _ym_normalize_redirect_uri(uri: str) -> str:
    return (uri or '').strip().rstrip('/')


def _ym_get_redirect_uri() -> str:
    try:
        saved = _ym_normalize_redirect_uri(get_setting('yoomoney_redirect_uri') or '')
    except Exception:
        saved = ''
    if saved:
        return saved
    root = external_url_root(request, domain_setting=(get_setting('domain') or ''))
    return f'{root}/yoomoney/callback'


def _ym_redirect_after_oauth(*, ok: bool = False):
    if 'logged_in' in session:
        return redirect(url_for('settings_tab_page', tab='payments'))
    next_url = url_for('settings_tab_page', tab='payments')
    return redirect(url_for('login_page', next=next_url))


@bp.route('/yoomoney/connect')
@panel_ctx.login_required
def yoomoney_connect_route():
    client_id = (get_setting('yoomoney_client_id') or '').strip()
    if not client_id:
        flash('Укажите YooMoney client_id в настройках.', 'warning')
        return redirect(url_for('settings_tab_page', tab='payments'))
    redirect_uri = _ym_get_redirect_uri()
    scope = 'operation-history operation-details account-info'
    qs = urllib.parse.urlencode({
        'client_id': client_id,
        'response_type': 'code',
        'scope': scope,
        'redirect_uri': redirect_uri,
    })
    return redirect(f'https://yoomoney.ru/oauth/authorize?{qs}')


@bp.route('/yoomoney/callback')
@panel_ctx.csrf.exempt
def yoomoney_callback_route():
    oauth_error = (request.args.get('error') or '').strip()
    if oauth_error:
        desc = (request.args.get('error_description') or oauth_error).strip()
        flash(f'YooMoney OAuth отклонён: {desc}', 'danger')
        return _ym_redirect_after_oauth()

    code = (request.args.get('code') or '').strip()
    if not code:
        flash('YooMoney: не получен code из OAuth.', 'danger')
        return _ym_redirect_after_oauth()

    client_id = (get_setting('yoomoney_client_id') or '').strip()
    client_secret = (get_setting('yoomoney_client_secret') or '').strip()
    redirect_uri = _ym_get_redirect_uri()
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': client_id,
        'redirect_uri': redirect_uri,
    }
    if client_secret:
        data['client_secret'] = client_secret
    try:
        encoded = urllib.parse.urlencode(data).encode('utf-8')
        req = urllib.request.Request('https://yoomoney.ru/oauth/token', data=encoded, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_text = resp.read().decode('utf-8', errors='ignore')
        try:
            payload = json.loads(resp_text)
        except Exception:
            payload = {}
        token = (payload.get('access_token') or '').strip()
        if not token:
            flash(f"Не удалось получить access_token от YooMoney: {payload}", 'danger')
            return _ym_redirect_after_oauth()
        update_setting('yoomoney_api_token', token)
        flash('YooMoney: токен успешно сохранён.', 'success')
        return _ym_redirect_after_oauth(ok=True)
    except Exception as e:
        logger.error(f"YooMoney OAuth callback error: {e}", exc_info=True)
        flash(f'Ошибка при обмене кода на токен: {e}', 'danger')
    return _ym_redirect_after_oauth()

@bp.route('/yoomoney/check', methods=['GET','POST'])
@panel_ctx.login_required
def yoomoney_check_route():
    token = (get_setting('yoomoney_api_token') or '').strip()
    if not token:
        flash('YooMoney: токен не задан.', 'warning')
        return redirect(url_for('settings_tab_page', tab='payments'))

    try:
        req = urllib.request.Request('https://yoomoney.ru/api/account-info', headers={'Authorization': f'Bearer {token}'}, method='POST')
        with urllib.request.urlopen(req, timeout=15) as resp:
            ai_text = resp.read().decode('utf-8', errors='ignore')
            ai_status = resp.status
            ai_headers = dict(resp.headers)
    except Exception as e:
        flash(f'YooMoney account-info: ошибка запроса: {e}', 'danger')
        return redirect(url_for('settings_tab_page', tab='payments'))
    try:
        ai = json.loads(ai_text)
    except Exception:
        ai = {}
    if ai_status != 200:
        www = ai_headers.get('WWW-Authenticate', '')
        flash(f"YooMoney account-info HTTP {ai_status}. {www}", 'danger')
        return redirect(url_for('settings_tab_page', tab='payments'))
    account = ai.get('account') or ai.get('account_number') or '—'

    try:
        body = urllib.parse.urlencode({'records': '1'}).encode('utf-8')
        req2 = urllib.request.Request('https://yoomoney.ru/api/operation-history', data=body, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req2, timeout=15) as resp2:
            oh_text = resp2.read().decode('utf-8', errors='ignore')
            oh_status = resp2.status
    except Exception as e:
        flash(f'YooMoney operation-history: ошибка запроса: {e}', 'warning')
        oh_status = None
    if oh_status == 200:
        flash(f'YooMoney: токен валиден. Кошелёк: {account}', 'success')
    elif oh_status is not None:
        flash(f'YooMoney operation-history HTTP {oh_status}. Проверьте scope operation-history и соответствие кошелька.', 'danger')
    else:
        flash('YooMoney: не удалось проверить operation-history.', 'warning')
    return redirect(url_for('settings_tab_page', tab='payments'))


MENU_IMAGE_SECTIONS = {
    'profile': 'profile_image',
    'keys': 'keys_image',
    'buy_key': 'buy_key_image',
    'topup': 'topup_image',
    'referral': 'referral_image',
    'support': 'support_image',
    'about': 'about_image',
    'speedtest': 'speedtest_image',
    'howto': 'howto_image',
    'main_menu': 'main_menu_image',
    'topup_amount': 'topup_amount_image',
    'payment': 'payment_image',
    'buy_server': 'buy_server_image',
    'buy_plan': 'buy_plan_image',
    'enter_email': 'enter_email_image',
    'key_info': 'key_info_image',
    'extend_plan': 'extend_plan_image',
    'keys_list': 'keys_list_image',
    'payment_method': 'payment_method_image',
    'key_comments': 'key_comments_image',
    'key_ready': 'key_ready_image',
    'waiting_payment': 'waiting_payment_image',
    'payment_success': 'payment_success_image',
    'devices_list': 'devices_list_image',
}


@bp.route('/upload-menu-image/<section>', methods=['POST'])
@panel_ctx.login_required
def upload_menu_image_route(section):
    if section not in MENU_IMAGE_SECTIONS:
        return jsonify({'ok': False, 'error': 'Неизвестный раздел'}), 400
    
    setting_key = MENU_IMAGE_SECTIONS[section]
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif'}
    MAX_SIZE_BYTES = 10 * 1024 * 1024

    if 'file' not in request.files:
        return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'ok': False, 'error': 'Файл не выбран'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'ok': False, 'error': f'Неподдерживаемый формат. Разрешены: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_SIZE_BYTES:
        return jsonify({'ok': False, 'error': 'Размер файла превышает 10 МБ'}), 400

    try:
        current_image = get_setting(setting_key)
        if current_image and os.path.exists(current_image):
            try:
                os.remove(current_image)
            except Exception:
                pass

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        upload_dir = os.path.join(base_dir, 'modules', 'menu_images')
        os.makedirs(upload_dir, exist_ok=True)

        filename = f"{section}_{int(time.time())}.{ext}"
        filepath = os.path.join(upload_dir, filename)

        file.save(filepath)
        update_setting(setting_key, filepath)

        return jsonify({'ok': True, 'path': filepath})
    except Exception as e:
        logger.error(f"Ошибка загрузки изображения {section}: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@bp.route('/settings/content/menu-image/<section>', methods=['GET'])
@panel_ctx.login_required
def content_menu_image_route(section):
    if section not in MENU_IMAGE_SECTIONS:
        return jsonify({'ok': False, 'error': 'Неизвестный раздел'}), 404

    setting_key = MENU_IMAGE_SECTIONS[section]
    path = get_setting(setting_key)
    if not path or not os.path.isfile(path):
        return jsonify({'ok': False, 'error': 'Изображение не найдено'}), 404

    return send_file(path)


@bp.route('/delete-menu-image/<section>', methods=['POST'])
@panel_ctx.login_required
def delete_menu_image_route(section):
    if section not in MENU_IMAGE_SECTIONS:
        return jsonify({'ok': False, 'error': 'Неизвестный раздел'}), 400
    
    setting_key = MENU_IMAGE_SECTIONS[section]
    try:
        current_image = get_setting(setting_key)
        if current_image and os.path.exists(current_image):
            try:
                os.remove(current_image)
            except Exception as e:
                logger.warning(f"Не удалось удалить файл {current_image}: {e}")

        update_setting(setting_key, '')
        return jsonify({'ok': True})
    except Exception as e:
        logger.error(f"Ошибка удаления изображения {section}: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


@bp.route('/settings/referrals/stats', methods=['GET'])
@panel_ctx.login_required
def settings_referrals_stats_route():
    from shop_bot.data_manager import referral_analytics
    try:
        return jsonify({'ok': True, 'overview': referral_analytics.get_referral_overview()})
    except Exception as exc:
        logger.exception('referrals stats failed')
        return jsonify({'ok': False, 'error': str(exc)}), 500


@bp.route('/settings/referrals/leaderboard', methods=['GET'])
@panel_ctx.login_required
def settings_referrals_leaderboard_route():
    from shop_bot.data_manager import referral_analytics
    try:
        limit = request.args.get('limit', 15, type=int)
        return jsonify({'ok': True, 'items': referral_analytics.get_referral_leaderboard(limit)})
    except Exception as exc:
        logger.exception('referrals leaderboard failed')
        return jsonify({'ok': False, 'error': str(exc)}), 500


@bp.route('/settings/referrals/recent', methods=['GET'])
@panel_ctx.login_required
def settings_referrals_recent_route():
    from shop_bot.data_manager import referral_analytics
    try:
        limit = request.args.get('limit', 20, type=int)
        return jsonify({
            'ok': True,
            'signups': referral_analytics.get_recent_referrals(limit),
            'bonuses': referral_analytics.get_recent_referral_bonuses(limit),
        })
    except Exception as exc:
        logger.exception('referrals recent failed')
        return jsonify({'ok': False, 'error': str(exc)}), 500

