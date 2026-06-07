import asyncio
import logging
from math import ceil

from flask import current_app, jsonify, render_template, request, session

from shop_bot.data_manager.panel_rbac import allows_permission, normalize_permission_levels
from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.remnawave_repository import (
    get_all_hosts,
    get_key_by_id,
    get_paginated_trial_eligible,
    get_paginated_trials,
    get_trial_activations_series,
    get_trial_stats,
    get_user,
    get_user_by_username,
    update_setting,
)
from shop_bot.services.trial_service import create_trial_key, resolve_trial_host
from shop_bot.webhook_server.blueprints.base import Blueprint
from shop_bot.webhook_server.blueprints.keys import (
    _adjust_single_key_expiry,
    _delete_single_key_record,
)
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

bp = Blueprint('trials', __name__)

def _session_levels():
    levels = session.get('panel_permission_levels')
    if levels is not None:
        return normalize_permission_levels(levels)
    return normalize_permission_levels(session.get('panel_permissions') or [])


def _can_edit(permission: str) -> bool:
    if session.get('panel_is_superadmin'):
        return True
    return allows_permission(_session_levels(), permission, require_edit=True)


TRIAL_SETTINGS_KEYS = (
    'trial_enabled',
    'trial_duration_days',
    'trial_traffic_limit_gb',
    'trial_hwid_limit',
    'trial_host_id',
)


def _is_trial_key(key: dict | None) -> bool:
    email = (key or {}).get('key_email') or ''
    return str(email).lower().startswith('trial_')


def _resolve_user_id(payload: dict) -> int | None:
    raw_id = payload.get('telegram_id') or payload.get('user_id')
    if raw_id is not None:
        try:
            return int(raw_id)
        except (TypeError, ValueError):
            pass
    username = (payload.get('username') or '').strip().lstrip('@')
    if username:
        user = get_user_by_username(username)
        if user:
            return int(user.get('telegram_id') or 0) or None
    return None


@bp.route('/trials')
@panel_ctx.login_required
def trials_page():
    all_hosts = get_all_hosts(visible_only=False) or []
    grant_hosts = get_all_hosts(visible_only=True) or []
    stats = get_trial_stats()
    common = panel_ctx.get_common_template_data()
    return render_template(
        'trials.html',
        hosts=all_hosts,
        grant_hosts=grant_hosts,
        stats=stats,
        trial_settings_keys=TRIAL_SETTINGS_KEYS,
        **common,
    )


@bp.route('/trials/stats.json')
@panel_ctx.login_required
def trials_stats_json():
    days = request.args.get('days', 30, type=int)
    return jsonify({
        'ok': True,
        'stats': get_trial_stats(),
        'series': get_trial_activations_series(days=days),
    })


@bp.route('/trials/list.partial')
@panel_ctx.login_required
def trials_list_partial():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int)
    per_page = max(5, min(per_page, 50))
    view = (request.args.get('view') or 'active').strip().lower()

    if view == 'eligible':
        items, total = get_paginated_trial_eligible(page=page, per_page=per_page)
        template = 'partials/trial_eligible_rows.html'
    else:
        status = view if view in ('active', 'expired', 'all') else 'active'
        items, total = get_paginated_trials(page=page, per_page=per_page, status=status)
        template = 'partials/trial_key_rows.html'

    total_pages = ceil(total / per_page) if per_page else 1
    html = render_template(template, items=items, view=view)

    if request.args.get('ajax_pagination') or request.args.get('lazy_load'):
        return jsonify({
            'ok': True,
            'html': html.lstrip('\ufeff'),
            'current_page': page,
            'total_pages': total_pages,
            'total': total,
            'view': view,
        })
    return html


@bp.route('/trials/settings', methods=['POST'])
@panel_ctx.login_required
def trials_settings_save():
    if not _can_edit('settings_panel'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    values = request.form.getlist('trial_enabled')
    update_setting('trial_enabled', values[-1] if values else 'false')

    for key in ('trial_duration_days', 'trial_traffic_limit_gb', 'trial_hwid_limit', 'trial_host_id'):
        if key in request.form:
            update_setting(key, request.form.get(key) or '')

    panel_ctx.audit('trial.settings_save', {'keys': list(TRIAL_SETTINGS_KEYS)})
    return jsonify({'ok': True, 'message': 'Настройки пробного периода сохранены'})


@bp.route('/trials/grant', methods=['POST'])
@panel_ctx.login_required
def trials_grant():
    if not _can_edit('users'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    payload = request.get_json(silent=True) or {}
    user_id = _resolve_user_id(payload)
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_not_found'}), 404

    user = get_user(user_id)
    if not user:
        return jsonify({'ok': False, 'error': 'user_not_found'}), 404
    if user.get('is_banned'):
        return jsonify({'ok': False, 'error': 'user_banned'}), 400

    hosts = get_all_hosts(visible_only=True) or []
    if not hosts:
        return jsonify({'ok': False, 'error': 'no_hosts'}), 400

    host_name = (payload.get('host_name') or '').strip()
    forced = (payload.get('trial_host_id') or '').strip()
    if not host_name:
        host_name = resolve_trial_host(hosts, forced) or ''
    if not host_name or not any(h.get('host_name') == host_name for h in hosts):
        return jsonify({'ok': False, 'error': 'host_required', 'hosts': [h.get('host_name') for h in hosts]}), 400

    if user.get('trial_used') and not payload.get('force'):
        return jsonify({'ok': False, 'error': 'trial_already_used'}), 400

    loop = current_app.config.get('EVENT_LOOP')
    bot = panel_ctx.bot_controller.get_bot_instance()

    async def _run():
        return await create_trial_key(user_id, host_name, bot=bot, set_used=True)

    try:
        if loop and loop.is_running():
            future = asyncio.run_coroutine_threadsafe(_run(), loop)
            result = future.result(timeout=60)
        else:
            result = asyncio.run(_run())
    except Exception as exc:
        logger.error('trial grant failed for %s: %s', user_id, exc, exc_info=True)
        return jsonify({'ok': False, 'error': 'grant_failed'}), 500

    if not result.get('ok'):
        return jsonify(result), 400

    panel_ctx.audit('trial.grant', {'user_id': user_id, 'host_name': host_name, 'key_id': result.get('key_id')})
    return jsonify(result)


@bp.route('/trials/reset-flag', methods=['POST'])
@panel_ctx.login_required
def trials_reset_flag():
    if not _can_edit('users'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    payload = request.get_json(silent=True) or {}
    user_id = _resolve_user_id(payload)
    if not user_id:
        return jsonify({'ok': False, 'error': 'user_not_found'}), 404

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET trial_used = 0 WHERE telegram_id = ?', (user_id,))
        conn.commit()

    panel_ctx.audit('trial.reset_flag', {'user_id': user_id})
    return jsonify({'ok': True, 'trial_used': False, 'message': 'Флаг пробного периода сброшен'})


@bp.route('/trials/keys/<int:key_id>/extend', methods=['POST'])
@panel_ctx.login_required
def trials_extend_key(key_id: int):
    if not _can_edit('keys'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    payload = request.get_json(silent=True) or request.form
    try:
        delta_days = int((payload or {}).get('delta_days', 0))
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'invalid_delta'}), 400
    if delta_days == 0:
        return jsonify({'ok': False, 'error': 'delta_required'}), 400

    key = get_key_by_id(key_id)
    if not key or not _is_trial_key(key):
        return jsonify({'ok': False, 'error': 'not_trial_key'}), 404

    success, err = _adjust_single_key_expiry(key, delta_days, notify_user=True)
    if not success:
        return jsonify({'ok': False, 'error': err or 'failed'}), 500

    panel_ctx.audit('trial.extend', {'key_id': key_id, 'delta_days': delta_days})
    return jsonify({'ok': True})


@bp.route('/trials/keys/<int:key_id>/revoke', methods=['POST'])
@panel_ctx.login_required
def trials_revoke_key(key_id: int):
    if not _can_edit('keys'):
        return jsonify({'ok': False, 'error': 'forbidden'}), 403

    key = get_key_by_id(key_id)
    if not key or not _is_trial_key(key):
        return jsonify({'ok': False, 'error': 'not_trial_key'}), 404

    success, err = _delete_single_key_record(key)
    if not success:
        return jsonify({'ok': False, 'error': err or 'failed'}), 500

    panel_ctx.audit('trial.revoke', {'key_id': key_id, 'user_id': key.get('user_id')})
    return jsonify({'ok': True, 'message': 'Пробный ключ отозван'})
