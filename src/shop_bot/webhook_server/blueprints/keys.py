import asyncio
import html as html_escape
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from math import ceil

from flask import current_app, flash, jsonify, redirect, render_template, request, url_for

from shop_bot.data_manager import speedtest_runner
from shop_bot.data_manager.database import _exec, add_seller_user, delete_seller_user, get_plan_by_id, get_seller_user
from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager.remnawave_repository import (
    delete_key_by_id,
    get_all_hosts,
    get_all_keys,
    get_all_users,
    get_latest_speedtest,
    get_plans_for_host,
    get_speedtests,
    get_user,
    update_host_ssh_settings,
    update_key_comment,
)
from shop_bot.data_manager.db.connection import get_msk_time
from shop_bot.modules import remnawave_api
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('keys', __name__)

_EXPIRY_FMT = '%Y-%m-%d %H:%M:%S'


def _parse_expiry_ts(key: dict) -> float | None:
    exp = key.get('expire_at') or key.get('expiry_date')
    if not exp:
        return None
    try:
        if isinstance(exp, (int, float)):
            val = float(exp)
            return val / 1000.0 if val > 1e12 else val
        return datetime.strptime(str(exp).strip(), _EXPIRY_FMT).timestamp()
    except Exception:
        return None


def _is_gift_key(key: dict) -> bool:
    return (key.get('user_id') or 0) == 0 or str(key.get('key_email') or '').lower().startswith('gift')


def _now_ts() -> float:
    return get_msk_time().replace(tzinfo=timezone(timedelta(hours=3))).timestamp()


def _classify_key(key: dict, now_ts: float | None = None) -> str:
    if _is_gift_key(key):
        return 'gift'
    exp_ts = _parse_expiry_ts(key)
    now = now_ts if now_ts is not None else _now_ts()
    if exp_ts is None:
        return 'active'
    if exp_ts <= now:
        return 'expired'
    if exp_ts <= now + 7 * 86400:
        return 'expiring'
    return 'active'


def _enrich_key_row(key: dict, now_ts: float | None = None) -> dict:
    now = now_ts if now_ts is not None else _now_ts()
    key = dict(key)
    status = _classify_key(key, now)
    key['key_status'] = status
    exp_ts = _parse_expiry_ts(key)
    if exp_ts is not None:
        key['days_left'] = int((exp_ts - now) / 86400)
    else:
        key['days_left'] = None
    return key


def _compute_key_stats(all_keys: list[dict]) -> dict[str, int]:
    now = _now_ts()
    stats = {
        'total': len(all_keys),
        'active': 0,
        'expired': 0,
        'expiring': 0,
        'gift': 0,
        'general': 0,
    }
    for key in all_keys:
        status = _classify_key(key, now)
        if status == 'gift':
            stats['gift'] += 1
        else:
            stats['general'] += 1
        if status == 'active':
            stats['active'] += 1
        elif status == 'expired':
            stats['expired'] += 1
        elif status == 'expiring':
            stats['expiring'] += 1
    return stats


def _compute_host_stats(all_keys: list[dict]) -> list[dict]:
    now = _now_ts()
    by_host: dict[str, dict[str, int]] = {}
    for key in all_keys:
        host = str(key.get('host_name') or '—').strip() or '—'
        bucket = by_host.setdefault(host, {
            'host': host,
            'total': 0,
            'active': 0,
            'expiring': 0,
            'expired': 0,
            'gift': 0,
        })
        bucket['total'] += 1
        status = _classify_key(key, now)
        if status in bucket:
            bucket[status] += 1
    rows = list(by_host.values())
    rows.sort(key=lambda r: (-r['total'], r['host']))
    max_total = max((r['total'] for r in rows), default=1) or 1
    for row in rows:
        row['pct'] = round(row['total'] / max_total * 100, 1)
    return rows


def _parse_key_expiry_dt(key: dict) -> datetime:
    cur_expiry = key.get('expiry_date') or key.get('expire_at')
    if isinstance(cur_expiry, str):
        try:
            return datetime.fromisoformat(cur_expiry)
        except Exception:
            try:
                return datetime.strptime(cur_expiry, '%Y-%m-%d %H:%M:%S')
            except Exception:
                return get_msk_time().replace(tzinfo=None)
    return cur_expiry or get_msk_time().replace(tzinfo=None)


def _adjust_single_key_expiry(key: dict, delta_days: int, *, notify_user: bool = True) -> tuple[bool, str | None]:
    try:
        exp_dt = _parse_key_expiry_dt(key)
        new_dt = exp_dt + timedelta(days=delta_days)
        if new_dt.tzinfo is None:
            msk_tz = timezone(timedelta(hours=3), name='MSK')
            new_dt = new_dt.replace(tzinfo=msk_tz)
        new_ms = int(new_dt.timestamp() * 1000)

        try:
            result = asyncio.run(remnawave_api.create_or_update_key_on_host(
                host_name=key.get('host_name'),
                email=key.get('key_email'),
                expiry_timestamp_ms=new_ms,
                force_expiry=True,
            ))
        except Exception:
            result = None
        if not result or not result.get('expiry_timestamp_ms'):
            return False, 'remnawave_update_failed'

        key_id = key.get('key_id')
        client_uuid = result.get('client_uuid') or key.get('remnawave_user_uuid') or ''
        if not rw_repo.update_key(
            key_id,
            remnawave_user_uuid=client_uuid,
            expire_at_ms=int(result.get('expiry_timestamp_ms') or new_ms),
            subscription_url=result.get('subscription_url') or result.get('connection_string'),
        ):
            return False, 'db_update_failed'

        if notify_user:
            try:
                user_id = key.get('user_id')
                new_ms_final = int(result.get('expiry_timestamp_ms'))
                text = (
                    '🗓️ <b>Срок действия ключа изменён</b>\n\n'
                    '<b>Обновленные данные:</b>\n'
                    f'🛰 Хост: <code>{key.get("host_name")}</code>\n'
                    f'💌 Email: <code>{key.get("key_email")}</code>\n\n'
                    f'📅 Истекает: <b>{datetime.fromtimestamp(new_ms_final/1000, tz=timezone(timedelta(hours=3), name="MSK")).strftime("%Y-%m-%d %H:%M")}</b>\n'
                    f'⏳ Осталось: <b>{panel_ctx.get_time_remaining_str(new_ms_final)}</b>\n'
                    '👤 Изменено: Администратором\n'
                )
                if user_id:
                    bot = panel_ctx.bot_controller.get_bot_instance()
                    loop = current_app.config.get('EVENT_LOOP')
                    if bot and loop and loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            bot.send_message(chat_id=user_id, text=text, parse_mode='HTML'), loop
                        )
                    elif bot:
                        asyncio.run(bot.send_message(chat_id=user_id, text=text, parse_mode='HTML'))
            except Exception:
                pass
        return True, None
    except Exception as e:
        return False, str(e)


def _delete_single_key_record(key: dict) -> tuple[bool, str | None]:
    try:
        try:
            host_for_delete = (key.get('host_name') or '').strip()
            if not host_for_delete:
                sq = (key.get('squad_uuid') or key.get('squadUuid') or '').strip()
                if sq:
                    squad = rw_repo.get_squad(sq)
                    if squad and squad.get('host_name'):
                        host_for_delete = squad.get('host_name')
            if host_for_delete:
                asyncio.run(remnawave_api.delete_client_on_host(host_for_delete, key.get('key_email')))
        except Exception:
            pass
        ok = delete_key_by_id(key.get('key_id'))
        return (True, None) if ok else (False, 'db_delete_failed')
    except Exception as e:
        return False, str(e)


def _keys_nav_params() -> dict[str, str]:
    return {
        'filter': request.args.get('filter', 'general') or 'general',
        'q': request.args.get('q', '') or '',
        'status': request.args.get('status', 'all') or 'all',
        'host': request.args.get('host', '') or '',
        'sort': request.args.get('sort', 'expiry_asc') or 'expiry_asc',
    }


def _parse_created_ts(key: dict) -> float:
    val = key.get('created_at') or key.get('created_date')
    if not val:
        return 0.0
    try:
        if isinstance(val, (int, float)):
            v = float(val)
            return v / 1000.0 if v > 1e12 else v
        return datetime.strptime(str(val).strip(), _EXPIRY_FMT).timestamp()
    except Exception:
        return 0.0


def _sort_keys(keys: list[dict], sort: str) -> list[dict]:
    if sort == 'created_desc':
        return sorted(keys, key=_parse_created_ts, reverse=True)
    if sort == 'id_desc':
        return sorted(keys, key=lambda k: int(k.get('key_id') or 0), reverse=True)
    if sort == 'expiry_desc':
        return sorted(keys, key=lambda k: _parse_expiry_ts(k) or 0, reverse=True)
    return sorted(keys, key=lambda k: _parse_expiry_ts(k) if _parse_expiry_ts(k) is not None else float('inf'))


def _get_filtered_keys(q, filter_mode, status_filter='all', host_filter='', sort='expiry_asc'):
    all_keys = []
    try:
        all_keys = get_all_keys()
    except Exception:
        all_keys = []
    try:
        users_by_id = {str(u.get('telegram_id')): u.get('username') for u in get_all_users() if u.get('telegram_id')}
        for key in all_keys:
            user_id = key.get('user_id')
            if user_id is not None:
                key['username'] = users_by_id.get(str(user_id))
    except Exception:
        pass
    
    if filter_mode == 'gift':
        keys = [k for k in all_keys if (k.get('user_id') or 0) == 0 or str(k.get('key_email') or '').lower().startswith('gift')]
    else:
        keys = [k for k in all_keys if (k.get('user_id') or 0) != 0 and not str(k.get('key_email') or '').lower().startswith('gift')]

    q = (q or '').strip().lower()
    if q:
        def match(k):
            return (
                q in str(k.get('key_id', '')).lower() or
                q in str(k.get('user_id', '')).lower() or
                q in str(k.get('username', '')).lower() or
                q in str(k.get('host_name', '')).lower() or
                q in str(k.get('key_email', '')).lower() or
                q in str(k.get('remnawave_user_uuid', '')).lower() or
                q in str(k.get('subscription_url', '')).lower() or
                q in str(k.get('access_url', '')).lower() or
                q in str(k.get('description', '')).lower() or
                q in str(k.get('comment_key', '')).lower()
            )
        keys = [k for k in keys if match(k)]

    host_filter = (host_filter or '').strip()
    if host_filter:
        keys = [k for k in keys if str(k.get('host_name') or '') == host_filter]

    status_filter = (status_filter or 'all').strip().lower()
    if status_filter and status_filter != 'all':
        now = _now_ts()
        keys = [k for k in keys if _classify_key(k, now) == status_filter]

    keys = _sort_keys(keys, sort or 'expiry_asc')
    now = _now_ts()
    return [_enrich_key_row(k, now) for k in keys]

@bp.route('/admin/keys')
@panel_ctx.login_required
def admin_keys_page():
    nav = _keys_nav_params()
    filter_mode = nav['filter']
    q = nav['q']

    paginated_keys = []
    total_pages = 1
    current_page = 1
    key_stats = {'total': 0, 'active': 0, 'expired': 0, 'expiring': 0, 'gift': 0, 'general': 0}
    host_stats: list[dict] = []
    try:
        all_keys = get_all_keys()
        key_stats = _compute_key_stats(all_keys)
        host_stats = _compute_host_stats(all_keys)
    except Exception as e:
        logger.error('Failed to compute key stats: %s', e)

    hosts = []
    try:
        hosts = get_all_hosts()
    except Exception:
        hosts = []
    users = []
    try:
        users = get_all_users()
    except Exception:
        users = []

    common_data = panel_ctx.get_common_template_data()
    return render_template(
        'admin_keys.html',
        keys=paginated_keys,
        hosts=hosts,
        users=users,
        key_stats=key_stats,
        host_stats=host_stats,
        current_filter=filter_mode,
        current_status=nav['status'],
        current_host=nav['host'],
        current_sort=nav['sort'],
        current_page=current_page,
        total_pages=total_pages,
        q=q,
        expired_count=key_stats.get('expired', 0),
        nav=nav,
        **common_data,
    )


@bp.route('/admin/keys/table.partial')
@panel_ctx.login_required
def admin_keys_table_partial():
    nav = _keys_nav_params()
    keys = _get_filtered_keys(nav['q'], nav['filter'], nav['status'], nav['host'], nav['sort'])

    page = request.args.get('page', 1, type=int)
    per_page = 20
    start = (page - 1) * per_page
    paginated_keys = keys[start:start + per_page]

    return render_template('partials/admin_keys_table.html', keys=paginated_keys)


@bp.route('/admin/keys/pagination.partial')
@panel_ctx.login_required
def admin_keys_pagination_partial():
    nav = _keys_nav_params()
    keys = _get_filtered_keys(nav['q'], nav['filter'], nav['status'], nav['host'], nav['sort'])

    page = request.args.get('page', 1, type=int)
    per_page = 20
    total_items = len(keys)
    total_pages = ceil(total_items / per_page) if per_page else 1

    return render_template(
        'partials/admin_keys_pagination.html',
        current_page=page,
        total_pages=total_pages,
        nav=nav,
    )


@bp.route('/admin/keys/bulk', methods=['POST'])
@panel_ctx.login_required
def bulk_keys_route():
    payload = request.get_json(silent=True) or {}
    action = (payload.get('action') or '').strip().lower()
    raw_ids = payload.get('key_ids') or []
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify({'ok': False, 'error': 'key_ids required'}), 400

    key_ids: list[int] = []
    for item in raw_ids:
        try:
            key_ids.append(int(item))
        except (TypeError, ValueError):
            continue
    key_ids = list(dict.fromkeys(key_ids))[:100]
    if not key_ids:
        return jsonify({'ok': False, 'error': 'invalid key_ids'}), 400

    if action == 'extend':
        try:
            delta_days = int(payload.get('delta_days', 0))
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'invalid_delta'}), 400
        if delta_days == 0:
            return jsonify({'ok': False, 'error': 'delta_days must be non-zero'}), 400

        ok_ids: list[int] = []
        failed: list[dict] = []
        for kid in key_ids:
            key = rw_repo.get_key_by_id(kid)
            if not key:
                failed.append({'key_id': kid, 'error': 'not_found'})
                continue
            success, err = _adjust_single_key_expiry(key, delta_days, notify_user=False)
            if success:
                ok_ids.append(kid)
            else:
                failed.append({'key_id': kid, 'error': err or 'failed'})
        return jsonify({
            'ok': len(ok_ids) > 0,
            'action': action,
            'success_count': len(ok_ids),
            'failed_count': len(failed),
            'success_ids': ok_ids,
            'failed': failed,
        })

    if action == 'delete':
        ok_ids: list[int] = []
        failed: list[dict] = []
        for kid in key_ids:
            key = rw_repo.get_key_by_id(kid)
            if not key:
                failed.append({'key_id': kid, 'error': 'not_found'})
                continue
            success, err = _delete_single_key_record(key)
            if success:
                ok_ids.append(kid)
            else:
                failed.append({'key_id': kid, 'error': err or 'failed'})
        return jsonify({
            'ok': len(ok_ids) > 0,
            'action': action,
            'success_count': len(ok_ids),
            'failed_count': len(failed),
            'success_ids': ok_ids,
            'failed': failed,
        })

    return jsonify({'ok': False, 'error': 'unknown action'}), 400


@bp.route('/admin/keys/export.csv')
@panel_ctx.login_required
def export_keys_csv():
    import csv
    from io import StringIO
    from flask import Response

    nav = _keys_nav_params()
    keys = _get_filtered_keys(nav['q'], nav['filter'], nav['status'], nav['host'], nav['sort'])

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        'key_id', 'user_id', 'username', 'host', 'email', 'status', 'expires', 'created',
        'uuid', 'subscription_url', 'comment',
    ])
    for k in keys:
        writer.writerow([
            k.get('key_id'),
            k.get('user_id'),
            k.get('username') or '',
            k.get('host_name'),
            k.get('key_email'),
            k.get('key_status'),
            k.get('expiry_date') or k.get('expire_at') or '',
            k.get('created_date') or k.get('created_at') or '',
            k.get('remnawave_user_uuid') or '',
            k.get('subscription_url') or k.get('access_url') or '',
            k.get('description') or k.get('comment') or '',
        ])

    return Response(
        buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=shopbot-keys.csv'},
    )

@bp.route('/admin/hosts/<host_name>/plans')
@panel_ctx.login_required
def admin_get_plans_for_host_json(host_name: str):
    try:
        plans = get_plans_for_host(host_name)
        data = [
            {
                "plan_id": p.get('plan_id'),
                "plan_name": p.get('plan_name'),
                "months": p.get('months'),
                "price": p.get('price'),
                "hwid_limit": p.get('hwid_limit'),
                "traffic_limit_gb": p.get('traffic_limit_gb'),
            } for p in plans
        ]
        return jsonify({"ok": True, "items": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/admin/keys/create', methods=['POST'])
@panel_ctx.login_required
def create_key_route():
    try:
        user_id = int(request.form.get('user_id'))
        host_name = (request.form.get('host_name') or '').strip()
        Remnawave_uuid = (request.form.get('Remnawave_client_uuid') or '').strip()
        key_email = (request.form.get('key_email') or '').strip()
        expiry = request.form.get('expiry_date') or ''

        expiry_dt = datetime.fromisoformat(expiry)
        msk_tz = timezone(timedelta(hours=3), name='MSK')
        if expiry_dt.tzinfo is None:
            expiry_dt = expiry_dt.replace(tzinfo=msk_tz)
        expiry_ms = int(expiry_dt.timestamp() * 1000) if expiry else 0
    except Exception:
        flash('Проверьте поля ключа.', 'danger')
        return redirect(request.referrer or url_for('admin_keys_page'))

    if not Remnawave_uuid:
        Remnawave_uuid = str(uuid.uuid4())

    result = None
    try:
        result = asyncio.run(remnawave_api.create_or_update_key_on_host(host_name, key_email, expiry_timestamp_ms=expiry_ms or None))
    except Exception as e:
        logger.error(f"Не удалось создать/обновить ключ на хосте: {e}")
        result = None
    if not result:
        flash('Не удалось создать ключ на хосте. Проверьте доступность Remnawave.', 'danger')
        return redirect(request.referrer or url_for('admin_keys_page'))


    try:
        Remnawave_uuid = result.get('client_uuid') or Remnawave_uuid
        expiry_ms = result.get('expiry_timestamp_ms') or expiry_ms
    except Exception:
        pass


    new_id = rw_repo.record_key_from_payload(
        user_id=user_id,
        payload=result,
        host_name=host_name,
    )
    flash(('Ключ добавлен.' if new_id else 'Ошибка при добавлении ключа.'), 'success' if new_id else 'danger')


    try:
        bot = panel_ctx.bot_controller.get_bot_instance()
        if bot and new_id:
            text = (
                '🔐 <b>Ваш ключ готов!</b>\n\n'
                '<b>Информация о ключе:</b>\n'
                f'🛰 Сервер: <code>{host_name}</code>\n'
                '📃 Статус: <b>Активен</b>\n'
                '👤 Выдан: Администратором через панель\n'
                f"📅 Истекает: <b>{datetime.fromtimestamp(expiry_ms/1000, tz=timezone(timedelta(hours=3), name='MSK')).strftime('%Y-%m-%d %H:%M') if expiry_ms else '∞'}</b>\n"
                f"⏳ Осталось: <b>{panel_ctx.get_time_remaining_str(expiry_ms)}</b>\n"
            )
            if result and result.get('connection_string'):
                cs = html_escape.escape(result['connection_string'])
                text += f"\n<b>Подключение:</b>\n<pre><code>{cs}</code></pre>"
            loop = current_app.config.get('EVENT_LOOP')
            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True),
                    loop
                )
            else:
                asyncio.run(bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True))
    except Exception as e:
        logger.warning(f"Не удалось уведомить пользователя о новом ключе: {e}")
    return redirect(request.referrer or url_for('admin_keys_page'))

@bp.route('/admin/keys/create-ajax', methods=['POST'])
@panel_ctx.login_required
def create_key_ajax_route():
    """Создание ключа через панель: персонального либо универсального подарочного токена."""
    mode = (request.form.get('mode') or 'personal').strip()
    host_name = (request.form.get('host_name') or '').strip()
    if not host_name:
        return jsonify({"ok": False, "error": "host_required"}), 400

    comment = (request.form.get('comment') or '').strip()
    plan_id = request.form.get('plan_id')
    custom_days_raw = request.form.get('custom_days')
    expiry_str = (request.form.get('expiry_date') or '').strip()
    expiry_ms: int | None = None
    if expiry_str:
        try:
            expiry_dt = datetime.fromisoformat(expiry_str)
            msk_tz = timezone(timedelta(hours=3), name='MSK')
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=msk_tz)
            expiry_ms = int(expiry_dt.timestamp() * 1000)
        except Exception:
            return jsonify({"ok": False, "error": "invalid_expiry"}), 400

    days_total = 0
    hwid_limit = None
    traffic_limit_gb = None

    if plan_id:
        plan = get_plan_by_id(plan_id)
        if plan:
            try:
                months = int(plan.get('months') or 0)
            except Exception:
                months = 0
            days_total += months * 30
            try:
                hwid_val = plan.get('hwid_limit')
                if hwid_val is not None:
                    hwid_limit = int(hwid_val)
                traffic_val = plan.get('traffic_limit_gb')
                if traffic_val is not None:
                    traffic_limit_gb = float(traffic_val)
            except Exception:
                pass
    
    if custom_days_raw:
        try:
            days_total += max(0, int(custom_days_raw))
        except Exception:
            pass

    if mode == 'personal':
        try:
            user_id = int(request.form.get('user_id'))
            key_email = (request.form.get('key_email') or '').strip().lower()
        except Exception as e:
            logger.error(f"create_key_ajax_route: неверные параметры персонального режима: {e}")
            return jsonify({"ok": False, "error": "bad_request"}), 400
        if not key_email:
            return jsonify({"ok": False, "error": "email_required"}), 400
        target_user = get_user(user_id)
        if not target_user:
            return jsonify({"ok": False, "error": "user_not_found"}), 404

        if expiry_ms is None and days_total > 0:
            expiry_ms = int((get_msk_time() + timedelta(days=days_total)).timestamp() * 1000)

        try:
            result = asyncio.run(remnawave_api.create_or_update_key_on_host(
                host_name,
                key_email,
                expiry_timestamp_ms=expiry_ms or None,
                hwid_limit=hwid_limit,
                traffic_limit_gb=traffic_limit_gb,
                telegram_id=user_id,
            ))
        except Exception as e:
            result = None
            logger.error(f"create_key_ajax_route: ошибка панели/хоста: {e}")
        if not result:
            return jsonify({"ok": False, "error": "host_failed"}), 500

        key_id = rw_repo.record_key_from_payload(
            user_id=user_id,
            payload=result,
            host_name=host_name,
            description=comment,
        )
        if not key_id:
            return jsonify({"ok": False, "error": "db_failed"}), 500


        try:
            bot = panel_ctx.bot_controller.get_bot_instance()
            if bot and key_id:
                text = (
                    '🔐 <b>Ваш ключ готов!</b>\n\n'
                    '<b>Информация о ключе:</b>\n'
                    f'🛰 Сервер: <code>{host_name}</code>\n'
                    '📃 Статус: <b>Активен</b>\n'
                    '👤 Выдан: Администратором через панель\n'
                    f"📅 Истекает: <b>{datetime.fromtimestamp(expiry_ms/1000, tz=timezone(timedelta(hours=3), name='MSK')).strftime('%Y-%m-%d %H:%M') if expiry_ms else '∞'}</b>\n"
                    f"⏳ Осталось: <b>{panel_ctx.get_time_remaining_str(expiry_ms)}</b>\n"
                )
                if result and result.get('connection_string'):
                    cs = html_escape.escape(result['connection_string'])
                    text += f"\n<b>Подключение:</b>\n<pre><code>{cs}</code></pre>"
                loop = current_app.config.get('EVENT_LOOP')
                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True),
                        loop
                    )
                else:
                    asyncio.run(bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True))
        except Exception as e:
            logger.warning(f"Не удалось уведомить пользователя (ajax): {e}")

        return jsonify({
            "ok": True,
            "key_id": key_id,
            "uuid": result.get('client_uuid'),
            "expiry_ms": result.get('expiry_timestamp_ms'),
            "connection": result.get('connection_string')
        })

    if mode == 'gift':
        user_id = 0
        target_user = None
        try:
            uid_raw = request.form.get('user_id')
            if uid_raw and uid_raw.strip():
                user_id = int(uid_raw)
                target_user = get_user(user_id)
        except Exception:
            user_id = 0

        expiry_ms: int | None = None
        if expiry_str:
            try:
                expiry_dt = datetime.fromisoformat(expiry_str)
                msk_tz = timezone(timedelta(hours=3), name='MSK')
                if expiry_dt.tzinfo is None:
                    expiry_dt = expiry_dt.replace(tzinfo=msk_tz)
                expiry_ms = int(expiry_dt.timestamp() * 1000)
            except Exception:
                return jsonify({"ok": False, "error": "invalid_expiry"}), 400
        if expiry_ms is None and days_total > 0:
            expiry_ms = int((get_msk_time() + timedelta(days=days_total)).timestamp() * 1000)

        domain = "bot.local"
        if target_user:
            raw_username = (target_user.get('username') or f"user{user_id}").lower()
            clean_username = re.sub(r"[^a-z0-9._-]", "_", raw_username).strip("_")[:20]
            base_local = f"gift_{clean_username}"
        else:
            base_local = f"gift-{uuid.uuid4().hex[:8]}"
        
        attempt = 0
        while True:
            candidate_email = f"{base_local if attempt == 0 else base_local + '-' + str(attempt)}@{domain}"
            if not rw_repo.get_key_by_email(candidate_email):
                break
            attempt += 1

        try:
            result = asyncio.run(remnawave_api.create_or_update_key_on_host(
                host_name,
                candidate_email,
                expiry_timestamp_ms=expiry_ms or None,
                description=comment or 'Gift key (created via admin panel)',
                tag='GIFT',
                hwid_limit=hwid_limit,
                traffic_limit_gb=traffic_limit_gb,
                telegram_id=user_id if user_id else None,
            ))
        except Exception as e:
            logger.error(f"Создание подарочного ключа: ошибка remnawave: {e}")
            result = None
        if not result:
            return jsonify({"ok": False, "error": "host_failed"}), 500

        key_id = rw_repo.record_key_from_payload(
            user_id=user_id,
            payload=result,
            host_name=host_name,
            description=comment or 'Gift key',
        )
        if not key_id:
            return jsonify({"ok": False, "error": "db_failed"}), 500

        if user_id and target_user:
            try:
                bot = panel_ctx.bot_controller.get_bot_instance()
                if bot:
                    text = (
                        '🎁 <b>Вам выдан подарочный ключ!</b>\n\n'
                        '<b>Информация о ключе:</b>\n'
                        f'🛰 Сервер: <code>{host_name}</code>\n'
                        '📃 Статус: <b>Активен</b>\n'
                        '👤 От кого: Администратор\n'
                        f"📅 Истекает: <b>{datetime.fromtimestamp(expiry_ms/1000, tz=timezone(timedelta(hours=3), name='MSK')).strftime('%Y-%m-%d %H:%M') if expiry_ms else '∞'}</b>\n"
                        f"⏳ Осталось: <b>{panel_ctx.get_time_remaining_str(expiry_ms)}</b>\n"
                    )
                    if result and result.get('connection_string'):
                        cs = html_escape.escape(result['connection_string'])
                        text += f"\n<b>Подключение:</b>\n<pre><code>{cs}</code></pre>"
                    
                    loop = current_app.config.get('EVENT_LOOP')
                    if loop and loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True),
                            loop
                        )
                    else:
                        asyncio.run(bot.send_message(chat_id=user_id, text=text, parse_mode='HTML', disable_web_page_preview=True))
            except Exception as e:
                logger.warning(f"Не удалось уведомить пользователя о подарочном ключе: {e}")

        return jsonify({
            "ok": True,
            "key_id": key_id,
            "email": candidate_email,
            "uuid": result.get('client_uuid'),
            "expiry_ms": result.get('expiry_timestamp_ms') or expiry_ms,
            "connection": result.get('connection_string'),
            "note": f"Gift key created (assigned to user {user_id})." if user_id else "Gift key created (not bound to Telegram user)."
        })

    return jsonify({"ok": False, "error": "unsupported_mode"}), 400

@bp.route('/admin/keys/generate-email')
@panel_ctx.login_required
def generate_key_email_route():
    import re
    mode = request.args.get('mode', 'personal')
    try:
        user_id = int(request.args.get('user_id'))
    except Exception:
        user_id = 0

    if mode == 'personal' and not user_id:
        return jsonify({"ok": False, "error": "invalid user_id"}), 400

    try:
        base_local = ""
        user = get_user(user_id) if user_id else None
        
        was_corrected = False
        original_candidate = ""

        raw_username = ""
        if user:
            raw_username = (user.get('username') or f'user{user_id}').lower()

        if mode == 'gift':
            if user:
                naive_local = f"gift_{raw_username}"
                naive_email = f"{naive_local}@bot.local"
                
                safe_email = remnawave_api._normalize_email_for_remnawave(naive_email)
                
                safe_local = safe_email.split('@')[0]
                
                if safe_email != naive_email:
                    was_corrected = True
                
                if safe_local == 'gift' or len(safe_local) <= 5: 
                     safe_local = f"gift_user{user_id}"
                     was_corrected = True

                base_local = safe_local
            else:
                base_local = f"gift-{uuid.uuid4().hex[:8]}"
        else:
            naive_local = f"{raw_username}"
            naive_email = f"{naive_local}@bot.local"
            
            safe_email = remnawave_api._normalize_email_for_remnawave(naive_email, telegram_id=user_id)
            
            if safe_email != naive_email:
                was_corrected = True
            
            base_local = safe_email.split('@')[0]

        candidate_local = base_local
        attempt = 0
        while True:
            suffix = f"-{attempt}" if attempt > 0 else ""
            candidate_email = f"{candidate_local}{suffix}@bot.local"
            if not rw_repo.get_key_by_email(candidate_email):
                break
            attempt += 1
        
        return jsonify({
            "ok": True, 
            "email": candidate_email,
            "was_corrected": was_corrected,
            "original_username": user.get('username') if user else None
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/admin/users/<int:user_id>/seller_settings', methods=['POST'])
@panel_ctx.login_required
def update_seller_settings_route(user_id: int):
    try:
        seller_active = int(request.form.get('seller_active', 0))
        seller_sale = float(request.form.get('seller_sale', 0))
        seller_ref = float(request.form.get('seller_ref', 0))
        seller_uuid = request.form.get('seller_uuid', '0').strip()
        
        _exec(
            "UPDATE users SET seller_active = ? WHERE telegram_id = ?",
            (seller_active, user_id),
            f"Не удалось обновить seller_active для пользователя {user_id}",
        )
        
        if seller_active == 1:
            add_seller_user(user_id, seller_sale, seller_ref, seller_uuid)
        else:
            delete_seller_user(user_id)
        
        return jsonify({"ok": True, "message": "Настройки продавца сохранены"})
    except Exception as e:
        logger.error(f"Failed to update seller settings for {user_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500

@bp.route('/admin/keys/<int:key_id>/delete', methods=['POST'])
@panel_ctx.login_required
def delete_key_route(key_id: int):

    try:
        key = rw_repo.get_key_by_id(key_id)
        if key:
            try:
                asyncio.run(remnawave_api.delete_client_on_host(key['host_name'], key['key_email']))
            except Exception:
                pass
    except Exception:
        pass
    ok = delete_key_by_id(key_id)
    msg = 'Ключ удалён.' if ok else 'Не удалось удалить ключ.'
    
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": ok, "message": msg})
        
    flash(msg, 'success' if ok else 'danger')
    return redirect(request.referrer or url_for('admin_keys_page'))

@bp.route('/admin/keys/<int:key_id>/adjust-expiry', methods=['POST'])
@panel_ctx.login_required
def adjust_key_expiry_route(key_id: int):
    try:
        delta_days = int(request.form.get('delta_days', '0'))
    except Exception:
        return jsonify({"ok": False, "error": "invalid_delta"}), 400
    key = rw_repo.get_key_by_id(key_id)
    if not key:
        return jsonify({"ok": False, "error": "not_found"}), 404
    success, err = _adjust_single_key_expiry(key, delta_days, notify_user=True)
    if not success:
        return jsonify({"ok": False, "error": err or 'failed'}), 500
    return jsonify({"ok": True})

@bp.route('/admin/keys/sweep-expired', methods=['POST'])
@panel_ctx.login_required
def sweep_expired_keys_route():
    removed = 0
    failed = 0
    now = get_msk_time().replace(tzinfo=None)
    keys = get_all_keys()
    for k in keys:
        exp = k.get('expiry_date')
        exp_dt = None
        try:
            if isinstance(exp, str):
                s = exp.strip()
                if s:
                    try:

                        exp_dt = datetime.fromisoformat(s)
                    except Exception:
                        try:
                            exp_dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
                        except Exception:

                            try:
                                exp_dt = datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
                            except Exception:
                                exp_dt = None
            else:
                exp_dt = exp
        except Exception:
            exp_dt = None

        try:
            if exp_dt is not None and getattr(exp_dt, 'tzinfo', None) is not None:
                exp_dt = exp_dt.astimezone(timezone(timedelta(hours=3))).replace(tzinfo=None)
        except Exception:
            pass
        if not exp_dt or exp_dt > now:
            continue

        try:
            try:

                host_for_delete = (k.get('host_name') or '').strip()
                if not host_for_delete:
                    try:
                        sq = (k.get('squad_uuid') or k.get('squadUuid') or '').strip()
                        if sq:
                            squad = rw_repo.get_squad(sq)
                            if squad and squad.get('host_name'):
                                host_for_delete = squad.get('host_name')
                    except Exception:
                        pass
                if host_for_delete:
                    asyncio.run(remnawave_api.delete_client_on_host(host_for_delete, k.get('key_email')))
            except Exception:
                pass
            delete_key_by_id(k.get('key_id'))
            removed += 1

            try:
                bot = panel_ctx.bot_controller.get_bot_instance()
                loop = current_app.config.get('EVENT_LOOP')
                text = (
                    "🗑 <b>Ключ удалён (истек срок)</b>\n\n"
                    "<b>Информация:</b>\n"
                    f"🛰 Хост: <code>{k.get('host_name')}</code>\n"
                    f"💌 Email: <code>{k.get('key_email')}</code>\n\n"
                    "💡 <i>Вы можете оформить новый ключ в меню бота.</i>"
                )
                if bot and loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(bot.send_message(chat_id=k.get('user_id'), text=text, parse_mode='HTML'), loop)
                else:
                    asyncio.run(bot.send_message(chat_id=k.get('user_id'), text=text, parse_mode='HTML'))
            except Exception:
                pass
        except Exception:
            failed += 1
        
    msg = f"Удалено истёкших ключей: {removed}. Ошибок: {failed}."
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": True, "message": msg, "removed": removed, "failed": failed})

    flash(msg, 'success' if failed == 0 else 'warning')
    return redirect(request.referrer or url_for('admin_keys_page'))

@bp.route('/admin/keys/<int:key_id>/comment', methods=['POST'])
@panel_ctx.login_required
def update_key_comment_route(key_id: int):
    comment = (request.form.get('comment') or '').strip()
    ok = update_key_comment(key_id, comment)
    if ok:
        return jsonify({"ok": True})
    else:
        return jsonify({"ok": False, "error": "db_error"}), 500


@bp.route('/admin/hosts/ssh/update', methods=['POST'])
@panel_ctx.login_required
def update_host_ssh_route():
    host_name = (request.form.get('host_name') or '').strip()
    ssh_host = (request.form.get('ssh_host') or '').strip() or None
    ssh_port_raw = (request.form.get('ssh_port') or '').strip()
    ssh_user = (request.form.get('ssh_user') or '').strip() or None
    ssh_password = request.form.get('ssh_password')
    ssh_key_path = (request.form.get('ssh_key_path') or '').strip() or None
    ssh_port = None
    try:
        ssh_port = int(ssh_port_raw) if ssh_port_raw else None
    except Exception:
        ssh_port = None
    ok = update_host_ssh_settings(host_name, ssh_host=ssh_host, ssh_port=ssh_port, ssh_user=ssh_user,
                                  ssh_password=ssh_password, ssh_key_path=ssh_key_path)
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'ok': ok, 'message': 'SSH-параметры обновлены' if ok else 'Не удалось обновить SSH-параметры'})
    
    flash('SSH-параметры обновлены.' if ok else 'Не удалось обновить SSH-параметры.', 'success' if ok else 'danger')
    return redirect(request.referrer or url_for('settings_tab_page', tab='hosts'))







@bp.route('/admin/hosts/<host_name>/speedtest/run', methods=['POST'])
@panel_ctx.login_required
def run_host_speedtest_route(host_name: str):
    method = (request.form.get('method') or '').strip().lower()
    logger.info(f"Панель: запущен спидтест для хоста '{host_name}', метод='{method or 'both'}'")
    try:
        if method == 'ssh':
            res = asyncio.run(speedtest_runner.run_and_store_ssh_speedtest(host_name))
        elif method == 'net':
            res = asyncio.run(speedtest_runner.run_and_store_net_probe(host_name))
        else:

            res = asyncio.run(speedtest_runner.run_both_for_host(host_name))
    except Exception as e:
        res = {'ok': False, 'error': str(e)}
    if res and res.get('ok'):
        logger.info(f"Панель: спидтест для хоста '{host_name}' завершён успешно")
    else:
        logger.warning(f"Панель: спидтест для хоста '{host_name}' завершился с ошибкой: {res.get('error') if res else 'unknown'}")
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify(res)
    flash(('Тест выполнен.' if res and res.get('ok') else f"Ошибка теста: {res.get('error') if res else 'unknown'}"), 'success' if res and res.get('ok') else 'danger')
    return redirect(request.referrer or url_for('settings_tab_page', tab='hosts'))

@bp.route('/admin/hosts/<host_name>/speedtests.json')
@panel_ctx.login_required
def host_speedtests_json(host_name: str):
    try:
        limit = int(request.args.get('limit') or 20)
    except Exception:
        limit = 20
    try:
        items = get_speedtests(host_name, limit=limit) or []
        return jsonify({
            'ok': True,
            'items': items
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@bp.route('/admin/speedtests/run-all', methods=['POST'])
@panel_ctx.login_required
def run_all_speedtests_route():

    logger.info("Панель: запуск спидтеста ДЛЯ ВСЕХ хостов")
    try:
        hosts = get_all_hosts()
    except Exception:
        hosts = []
    errors = []
    ok_count = 0
    for h in hosts:
        name = h.get('host_name')
        if not name:
            continue
        try:
            res = asyncio.run(speedtest_runner.run_both_for_host(name))
            if res and res.get('ok'):
                ok_count += 1
            else:
                errors.append(f"{name}: {res.get('error') if res else 'unknown'}")
        except Exception as e:
            errors.append(f"{name}: {e}")
    logger.info(f"Панель: завершён спидтест ДЛЯ ВСЕХ хостов: ок={ok_count}, всего={len(hosts)}")

    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": len(errors) == 0, "done": ok_count, "total": len(hosts), "errors": errors})
    if errors:
        flash(f"Выполнено для {ok_count}/{len(hosts)}. Ошибки: {'; '.join(errors[:3])}{'…' if len(errors) > 3 else ''}", 'warning')
    else:
        flash(f"Тесты скорости выполнены для всех хостов: {ok_count}/{len(hosts)}", 'success')
    return redirect(request.referrer or url_for('dashboard_page'))


@bp.route('/admin/hosts/<host_name>/speedtest/install', methods=['POST'])
@panel_ctx.login_required
def auto_install_speedtest_route(host_name: str):

    try:
        res = asyncio.run(speedtest_runner.auto_install_speedtest_on_host(host_name))
    except Exception as e:
        res = {'ok': False, 'log': str(e)}
    wants_json = 'application/json' in (request.headers.get('Accept') or '') or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    if wants_json:
        return jsonify({"ok": bool(res.get('ok')), "log": res.get('log')})
    flash(('Установка завершена успешно.' if res.get('ok') else 'Не удалось установить speedtest на хост.') , 'success' if res.get('ok') else 'danger')

    try:
        log = res.get('log') or ''
        short = '\n'.join((log.splitlines() or [])[-20:])
        if short:
            flash(short, 'secondary')
    except Exception:
        pass
    return redirect(request.referrer or url_for('settings_tab_page', tab='hosts'))
