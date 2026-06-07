import logging
from math import ceil

from flask import jsonify, redirect, render_template, request, session, url_for

from shop_bot.data_manager import panel_access, panel_presence
from shop_bot.data_manager import panel_audit
from shop_bot.data_manager.panel_security import SECURITY_METHOD_LABELS

from shop_bot.data_manager import resource_monitor, speedtest_runner
from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import is_postgresql, sql_vacuum
from shop_bot.data_manager.remnawave_repository import (
    get_all_hosts,
    get_all_ssh_targets,
    get_daily_stats_for_charts,
    get_open_tickets_count,
    get_paginated_transactions,
    get_support_badge_counts,
    get_total_keys_count,
    get_total_spent_by_method,
    get_total_spent_sum,
    get_user_count,
    update_setting,
)
from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.webhook_server.context import panel_ctx
from shop_bot.webhook_server import dashboard_layout as dash_layout

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('dashboard', __name__)


@bp.route('/support/badge-counts.json')
@panel_ctx.login_required
def support_badge_counts_json():
    return jsonify(get_support_badge_counts())


@bp.route('/admin/presence.json')
@panel_ctx.login_required
def admin_presence_json():
    online = [r for r in panel_presence.list_online() if r.get('status') == 'online']
    away = panel_presence.list_away()
    recent = panel_presence.list_recent_seen(limit=12)
    presence_map = panel_presence.presence_by_admin_id()
    self_id = session.get('panel_admin_id')

    roster: list[dict] = []
    for admin in panel_access.list_admins():
        if not admin.get('is_active'):
            continue
        aid = int(admin['id'])
        pres = presence_map.get(aid)
        roster.append({
            'admin_id': aid,
            'login': admin.get('login') or '',
            'role_name': admin.get('role_name') or '',
            'is_superadmin': bool(admin.get('is_superadmin')),
            'status': pres.get('status') if pres else 'offline',
            'active': bool(pres and pres.get('active')),
            'online': bool(pres and pres.get('online')),
            'page_label': (pres or {}).get('page_label'),
            'online_seconds_ago': (pres or {}).get('online_seconds_ago'),
            'device_label': (pres or {}).get('device_label'),
            'session_duration_sec': (pres or {}).get('session_duration_sec'),
            'is_self': aid == self_id,
        })

    status_order = {'online': 0, 'away': 1, 'offline': 2}
    roster.sort(
        key=lambda x: (
            status_order.get(x.get('status'), 9),
            (x.get('login') or '').lower(),
        ),
    )

    return jsonify({
        'ok': True,
        'online_count': len(online),
        'away_count': len(away),
        'self_id': self_id,
        'items': online + away,
        'online': online,
        'away': away,
        'recent': recent,
        'roster': roster,
        'stats': {
            'online': len(online),
            'away': len(away),
            'active_total': len(online) + len(away),
            'admins_active': len(roster),
        },
        'can_manage_admins': bool(
            session.get('panel_is_superadmin')
            or 'settings_access' in (session.get('panel_permissions') or [])
        ),
    })


@bp.route('/admin/presence/<int:admin_id>.json')
@panel_ctx.login_required
def admin_presence_detail_json(admin_id: int):
    admin = panel_access.get_admin(admin_id)
    if not admin:
        return jsonify({'ok': False, 'error': 'Администратор не найден'}), 404
    viewer_id = session.get('panel_admin_id')
    can_manage = bool(
        session.get('panel_is_superadmin')
        or 'settings_access' in (session.get('panel_permissions') or [])
    )
    if admin_id != viewer_id and not can_manage:
        return jsonify({'ok': False, 'error': 'Недостаточно прав'}), 403
    presence = panel_presence.get_presence(admin_id)
    security = (admin.get('auth_security_method') or 'none').strip().lower()
    recent = panel_audit.list_for_admin(admin_id, limit=10)
    last_login = next((r for r in recent if (r.get('action') or '') == 'login.success'), None)
    return jsonify({
        'ok': True,
        'admin': {
            'id': admin['id'],
            'login': admin['login'],
            'role_name': admin.get('role_name') or '',
            'is_superadmin': bool(admin.get('is_superadmin')),
            'is_active': bool(admin.get('is_active')),
            'telegram_username': admin.get('telegram_username'),
            'security_method': security,
            'security_label': SECURITY_METHOD_LABELS.get(security, security),
            'created_at': admin.get('created_at'),
            'updated_at': admin.get('updated_at'),
            'is_self': session.get('panel_admin_id') == admin_id,
        },
        'presence': presence,
        'last_login': {
            'created_at': last_login.get('created_at') if last_login else None,
            'ip': last_login.get('ip') if last_login else None,
        } if last_login else None,
        'can_manage_admins': bool(
            session.get('panel_is_superadmin')
            or 'settings_access' in (session.get('panel_permissions') or [])
        ),
        'settings_access_url': url_for('settings_tab_page', tab='access'),
        'recent_actions': [
            {
                'action': row.get('action') or '',
                'action_label': row.get('action_label') or row.get('action') or '',
                'summary': row.get('summary') or '',
                'created_at': row.get('created_at'),
                'ip': row.get('ip') or '',
            }
            for row in recent
        ],
    })


@bp.route('/brand-title', methods=['POST'])
@panel_ctx.login_required
def update_brand_title_route():
    title = (request.form.get('title') or '').strip()
    if not title:
        return jsonify({"ok": False, "error": "empty"}), 400
    try:
        update_setting('panel_brand_title', title)
        return jsonify({"ok": True, "title": title})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/')
@panel_ctx.login_required
def index():
    return redirect(url_for('dashboard_page'))

def _monitor_ssh_hosts():
    try:
        all_hosts = get_all_hosts()
        return [
            h for h in all_hosts
            if h.get('ssh_host') and (h.get('ssh_password') or h.get('ssh_key_path'))
        ]
    except Exception:
        return []


def _monitor_ssh_targets():
    try:
        all_ssh_targets = get_all_ssh_targets()
        return [
            t for t in all_ssh_targets
            if t.get('ssh_host') and (t.get('ssh_password') or t.get('ssh_key_path'))
        ]
    except Exception:
        return []


@bp.route('/dashboard')
@panel_ctx.login_required
def dashboard_page():
    common_data = panel_ctx.get_common_template_data()
    admin_id = session.get('panel_admin_id')
    layout = dash_layout.get_admin_layout(admin_id)
    from shop_bot.webhook_server.services.onboarding_checklist import build_onboarding_checklist

    return render_template(
        'dashboard.html',
        hosts=_monitor_ssh_hosts(),
        ssh_targets=_monitor_ssh_targets(),
        stats={},
        chart_data={},
        transactions=[],
        recent_trials=[],
        trials_current_page=1,
        trials_total_pages=1,
        current_page=1,
        total_pages=1,
        dashboard_layout=layout,
        onboarding_checklist=build_onboarding_checklist(),
        **common_data
    )


@bp.route('/dashboard/layout/config.json')
@panel_ctx.login_required
def dashboard_layout_config():
    admin_id = session.get('panel_admin_id')
    return jsonify({
        'ok': True,
        'catalog': dash_layout.catalog_for_client(),
        'layout': dash_layout.get_admin_layout(admin_id),
        'is_superadmin': bool(session.get('panel_is_superadmin')),
    })


@bp.route('/dashboard/layout/prefs', methods=['GET'])
@panel_ctx.login_required
def dashboard_layout_prefs_get():
    admin_id = session.get('panel_admin_id')
    return jsonify({
        'ok': True,
        'layout': dash_layout.get_admin_layout(admin_id),
        'global_layout': dash_layout.get_global_layout(),
    })


@bp.route('/dashboard/layout/prefs', methods=['POST'])
@panel_ctx.login_required
def dashboard_layout_prefs_save():
    payload = request.get_json(silent=True) or {}
    layout = payload.get('layout')
    if not isinstance(layout, dict):
        return jsonify({'ok': False, 'error': 'Некорректный layout'}), 400
    admin_id = session.get('panel_admin_id')
    if not admin_id:
        return jsonify({'ok': False, 'error': 'Не авторизован'}), 401
    scope = (payload.get('scope') or 'admin').strip().lower()
    try:
        if scope == 'global' and session.get('panel_is_superadmin'):
            saved = dash_layout.save_global_layout(layout)
            panel_ctx.audit('dashboard.layout_global', {'admin_id': admin_id})
        else:
            saved = dash_layout.save_admin_layout(admin_id, layout)
            panel_ctx.audit('dashboard.layout_save', {'admin_id': admin_id})
        return jsonify({'ok': True, 'layout': saved})
    except Exception as exc:
        logger.error('dashboard layout save failed: %s', exc)
        return jsonify({'ok': False, 'error': str(exc)}), 500


@bp.route('/dashboard/layout/prefs', methods=['DELETE'])
@panel_ctx.login_required
def dashboard_layout_prefs_reset():
    admin_id = session.get('panel_admin_id')
    if not admin_id:
        return jsonify({'ok': False, 'error': 'Не авторизован'}), 401
    dash_layout.reset_admin_layout(admin_id)
    panel_ctx.audit('dashboard.layout_reset', {'admin_id': admin_id})
    return jsonify({'ok': True, 'layout': dash_layout.get_admin_layout(admin_id)})


@bp.route('/monitor')
@panel_ctx.login_required
def monitor_page_redirect():
    return redirect(url_for('dashboard_page') + '#resources')

@bp.route('/dashboard/ssh-targets.json')
@panel_ctx.login_required
def dashboard_ssh_targets_json():
    try:
        ssh_targets = get_all_ssh_targets()
    except Exception:
        ssh_targets = []
    return jsonify({"ok": True, "targets": ssh_targets})

@bp.route('/dashboard/run-speedtests', methods=['POST'])
@panel_ctx.login_required
def run_speedtests_route():
    try:
        speedtest_runner.run_speedtests_for_all_hosts()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@bp.route('/dashboard/stats.partial')
@panel_ctx.login_required
def dashboard_stats_partial():
    hide_payments = request.args.get('hide_payments') == 'true'
    
    stats = {
        "user_count": get_user_count(),
        "total_keys": get_total_keys_count(),
        "total_spent": get_total_spent_sum(),
        "host_count": len(get_all_hosts())
    }

    if not hide_payments:
        stats.update({
            "yookassa_income": get_total_spent_by_method("YooKassa"),
            "platega_income": get_total_spent_by_method("Platega"),
            "stars_income": get_total_spent_by_method("Telegram Stars"),
            "cryptobot_income": get_total_spent_by_method("CryptoBot"),
            "heleket_income": get_total_spent_by_method("Heleket"),
            "tonconnect_income": get_total_spent_by_method("TON Connect")
        })
    else:
        stats.update({
            "yookassa_income": 0.0,
            "platega_income": 0.0,
            "stars_income": 0.0,
            "cryptobot_income": 0.0,
            "heleket_income": 0.0,
            "tonconnect_income": 0.0
        })
        
    common_data = panel_ctx.get_common_template_data()
    try:
        common_data['open_tickets_count'] = get_open_tickets_count()
    except:
        common_data['open_tickets_count'] = 0

    try:
        from shop_bot.data_manager.database import get_dashboard_user_groups
        groups = get_dashboard_user_groups()
        stats["no_purchases_count"] = len(groups["no_purchases"])
        stats["inactive_buyers_count"] = len(groups["inactive_buyers"])
        stats["trials_count"] = len(groups["trials"])
        stats["active_buyers_count"] = len(groups["active_buyers"])
        stats["active_keys_count"] = len(groups["active_keys"])
    except Exception as e:
        logger.error(f"Failed to get user groups stats: {e}")
        stats["no_purchases_count"] = 0
        stats["inactive_buyers_count"] = 0
        stats["trials_count"] = 0
        stats["active_buyers_count"] = 0
        stats["active_keys_count"] = 0

    html = render_template('partials/dashboard_stats.html', stats=stats, **common_data)
    return html.lstrip('\ufeff')

@bp.route('/dashboard/transactions.partial')
@panel_ctx.login_required
def dashboard_transactions_partial():
    page = request.args.get('page', 1, type=int)
    per_page = 8
    transactions, total_transactions = get_paginated_transactions(page=page, per_page=per_page)
    total_pages = ceil(total_transactions / per_page)
    
    if request.args.get('ajax_pagination') or request.args.get('lazy_load'):
        return jsonify({
            "html": render_template('partials/dashboard_transactions.html', transactions=transactions),
            "current_page": page,
            "total_pages": total_pages
        })
        
    return render_template('partials/dashboard_transactions.html', transactions=transactions)

@bp.route('/dashboard/trials.partial')
@panel_ctx.login_required
def dashboard_trials_partial():
    page = request.args.get('page', 1, type=int)
    per_page = 10
    recent_trials, total_trials = rw_repo.get_paginated_trials(page=page, per_page=per_page)
    trials_total_pages = ceil(total_trials / per_page)

    if request.args.get('ajax_pagination') or request.args.get('lazy_load'):
        return jsonify({
            "html": render_template('partials/dashboard_trials.html', recent_trials=recent_trials),
            "current_page": page,
            "total_pages": trials_total_pages
        })
        
    return render_template('partials/dashboard_trials.html', recent_trials=recent_trials)
    return render_template('partials/dashboard_trials.html', recent_trials=recent_trials)


@bp.route('/dashboard/charts.json')
@panel_ctx.login_required
def dashboard_charts_json():
    period = request.args.get('period', '30d')
    mapping = {
        'today': 1,
        '7d': 7,
        '30d': 30,
        '3m': 90,
        '6m': 180,
        '12m': 365,
        'all': 0
    }
    days = mapping.get(period, 30)
    data = get_daily_stats_for_charts(days=days)
    return jsonify(data)

@bp.route('/dashboard/user_groups.json')
@panel_ctx.login_required
def dashboard_user_groups_json():
    try:
        from shop_bot.data_manager.database import get_dashboard_user_groups
        groups = get_dashboard_user_groups()
        return jsonify({"ok": True, "groups": groups})
    except Exception as e:
        logger.error(f"Error fetching user groups: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


@bp.route('/dashboard/monitor/local.json')
@panel_ctx.login_required
def monitor_local_json():
    try:
        data = resource_monitor.get_local_metrics()
    except Exception as e:
        data = {"ok": False, "error": str(e)}
    return jsonify(data)


@bp.route('/dashboard/monitor/host/<host_name>.json')
@panel_ctx.login_required
def monitor_host_json(host_name: str):
    try:
        data = resource_monitor.get_remote_metrics_for_host(host_name)
    except Exception as e:
        data = {"ok": False, "error": str(e)}
    return jsonify(data)


@bp.route('/dashboard/monitor/target/<target_name>.json')
@panel_ctx.login_required
def monitor_target_json(target_name: str):
    try:
        data = resource_monitor.get_remote_metrics_for_target(target_name)
    except Exception as e:
        data = {"ok": False, "error": str(e)}
    return jsonify(data)


@bp.route('/dashboard/monitor/series/<scope>/<name>.json')
@panel_ctx.login_required
def monitor_series_json(scope: str, name: str):
    try:
        hours = int(request.args.get('hours', '24') or '24')
    except Exception:
        hours = 24

    try:
        series = rw_repo.get_metrics_series(scope, name, since_hours=hours, limit=1000)
        return jsonify({"ok": True, "items": series})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@bp.route('/dashboard/monitor/clear-metrics', methods=['POST'])
@panel_ctx.login_required
def monitor_clear_metrics():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM resource_metrics")
        deleted_metrics = cursor.rowcount

        cursor.execute("DELETE FROM host_speedtests")
        deleted_speedtests = cursor.rowcount

        conn.commit()
        vacuum_sql = sql_vacuum()
        if vacuum_sql and not is_postgresql():
            cursor.execute(vacuum_sql)
        conn.close()

        logger.info(
            "Cleared metrics: %s resources, %s speedtests",
            deleted_metrics,
            deleted_speedtests,
        )
        return jsonify({
            "ok": True,
            "message": f"Очищено: {deleted_metrics} метрик, {deleted_speedtests} тестов. БД сжата.",
            "deleted_count": deleted_metrics + deleted_speedtests,
        })
    except Exception as e:
        logger.error("Error clearing metrics: %s", e)
        return jsonify({"ok": False, "error": str(e)}), 500

