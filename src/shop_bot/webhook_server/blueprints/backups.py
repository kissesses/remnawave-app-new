import asyncio
import logging
import os
from pathlib import Path

from flask import current_app, flash, jsonify, redirect, render_template, request, send_file, session, url_for

from shop_bot.data_manager import backup_manager
from shop_bot.data_manager import panel_stepup
from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager.remnawave_repository import update_setting
from shop_bot.webhook_server.blueprints.base import Blueprint
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

bp = Blueprint('backups', __name__)

def _truthy(val) -> bool:
    return str(val or '').strip().lower() in ('1', 'true', 'yes', 'on')


def _run_backup_telegram_delivery(zip_path: Path, backup_password: str | None) -> dict:
    cfg = backup_manager.get_backup_config()
    if not cfg.get('archive_channel_configured'):
        return {
            'ok': False,
            'error': 'Укажите Chat ID в Настройки → Боты → Уведомления (топик «Архив бэкапов»)',
        }
    bot = panel_ctx.bot_controller.get_bot_instance()
    if not bot:
        return {'ok': False, 'error': 'Бот недоступен — запустите основной бот в панели'}
    loop = current_app.config.get('EVENT_LOOP')
    if loop and loop.is_running():
        future = asyncio.run_coroutine_threadsafe(
            backup_manager.deliver_backup_notifications(
                bot, zip_path, backup_password, fallback_to_admins=True,
            ),
            loop,
        )
        result = future.result(timeout=120)
    else:
        result = asyncio.run(
            backup_manager.deliver_backup_notifications(
                bot, zip_path, backup_password, fallback_to_admins=True,
            )
        )
    sent = int(result.get('archive') or 0)
    if not sent:
        err = result.get('archive_error') or 'не удалось отправить архив в Telegram'
        secret_err = result.get('secret_error')
        if secret_err:
            err = f'{err}; пароль: {secret_err}'
        return {'ok': False, 'error': err, **result}
    msg = f'Архив отправлен в Telegram ({sent})'
    if result.get('secret'):
        msg += ', пароль — в топик «Пароли архивов»'
    elif backup_manager.resolve_delivery_password(zip_path, backup_password) and cfg.get('encrypt_enabled'):
        if not cfg.get('secrets_channel_configured'):
            msg += '; пароль не отправлен — настройте топик «Пароли архивов»'
        else:
            msg += '; пароль не отправлен — проверьте топик и права бота'
    return {'ok': True, 'message': msg, 'sent': sent, **result}


def _backups_list():
    return backup_manager.list_backup_files()


@bp.route('/backups')
@panel_ctx.login_required
def backups_page():
    common = panel_ctx.get_common_template_data()
    backups = _backups_list()
    cfg = backup_manager.get_backup_config()
    admin_id = session.get('panel_admin_id')
    try:
        aid = int(admin_id) if admin_id is not None else 0
    except (TypeError, ValueError):
        aid = 0
    destructive_gate = panel_stepup.stepup_gate_meta(aid, panel_stepup.SCOPE_DESTRUCTIVE)
    try:
        ssh_targets = rw_repo.get_all_ssh_targets() or []
    except Exception:
        ssh_targets = []
    return render_template(
        'backups.html',
        backups=backups,
        backup_summary=backup_manager.backups_summary(backups),
        backup_config=cfg,
        backup_interval_days=str(cfg['interval_days']),
        backup_keep_count=str(cfg['keep_count']),
        autobackup_enabled=cfg['autobackup_enabled'],
        autobackup_telegram=cfg['autobackup_telegram'],
        ssh_targets=ssh_targets,
        destructive_gate=destructive_gate,
        **common,
    )


@bp.route('/admin/db/backup/list.json')
@panel_ctx.login_required
def backup_list_json():
    items = _backups_list()
    return jsonify({
        'ok': True,
        'items': items,
        'summary': backup_manager.backups_summary(items),
        'config': backup_manager.get_backup_config(),
    })


@bp.route('/admin/db/backup/settings.json', methods=['GET'])
@panel_ctx.login_required
def backup_settings_json():
    return jsonify({'ok': True, 'config': backup_manager.get_backup_config()})


@bp.route('/admin/db/backup/settings', methods=['POST'])
@panel_ctx.login_required
def backup_settings_save():
    data = request.get_json(silent=True) or request.form
    try:
        days = max(0, min(365, int(str(data.get('backup_interval_days', '1')).strip() or '1')))
        keep = max(1, min(100, int(str(data.get('backup_keep_count', '7')).strip() or '7')))
        telegram = '1' if str(data.get('backup_autobackup_telegram', '1')).lower() in ('1', 'true', 'on') else '0'
        compress = max(0, min(9, int(str(data.get('backup_compress_level', '6')).strip() or '6')))
        scope = backup_manager.normalize_scope(data.get('backup_autobackup_scope'))
        include_env = '1' if str(data.get('backup_include_env', '0')).lower() in ('1', 'true', 'on') else '0'
        encrypt = '1' if str(data.get('backup_encrypt_enabled', '1')).lower() in ('1', 'true', 'on') else '0'
        pw_mode = (str(data.get('backup_password_mode') or 'random').strip().lower())
        if pw_mode not in ('random', 'master'):
            pw_mode = 'random'
        rw_mode = (str(data.get('backup_remnawave_mode') or 'local').strip().lower())
        if rw_mode not in ('local', 'ssh'):
            rw_mode = 'local'
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'Некорректные значения настроек'}), 400

    update_setting('backup_interval_days', str(days))
    update_setting('backup_keep_count', str(keep))
    update_setting('backup_autobackup_telegram', telegram)
    update_setting('backup_compress_level', str(compress))
    update_setting('backup_autobackup_scope', scope)
    update_setting('backup_include_env', include_env)
    update_setting('backup_encrypt_enabled', encrypt)
    update_setting('backup_password_mode', pw_mode)
    update_setting('backup_remnawave_mode', rw_mode)
    update_setting('backup_remnawave_compose_dir', (data.get('backup_remnawave_compose_dir') or '').strip()[:500])
    update_setting('backup_remnawave_ssh_target', (data.get('backup_remnawave_ssh_target') or '').strip()[:120])
    update_setting('backup_remnawave_pg_service', (data.get('backup_remnawave_pg_service') or 'remnawave-db').strip()[:64])
    update_setting('backup_remnawave_database_url', (data.get('backup_remnawave_database_url') or '').strip()[:500])
    update_setting('backup_remnawave_compose_cmd', (data.get('backup_remnawave_compose_cmd') or '').strip()[:64])
    # Каналы задаются в Настройки → Боты; не затираем при сохранении только блока «Автобэкап».
    if 'backup_telegram_chat_id' in data:
        update_setting('backup_telegram_chat_id', (data.get('backup_telegram_chat_id') or '').strip()[:32])
    if 'backup_telegram_topic_id' in data:
        update_setting('backup_telegram_topic_id', (data.get('backup_telegram_topic_id') or '').strip()[:32])
    if 'backup_secrets_chat_id' in data:
        update_setting('backup_secrets_chat_id', (data.get('backup_secrets_chat_id') or '').strip()[:32])
    if 'backup_secrets_topic_id' in data:
        update_setting('backup_secrets_topic_id', (data.get('backup_secrets_topic_id') or '').strip()[:32])
    master_pw = (data.get('backup_master_password') or '').strip()
    if master_pw:
        update_setting('backup_master_password', master_pw)
    panel_ctx.audit('db.backup.settings', {'days': days, 'keep': keep, 'telegram': telegram})
    return jsonify({'ok': True, 'config': backup_manager.get_backup_config()})


@bp.route('/admin/db/backup/detail/<path:name>.json')
@panel_ctx.login_required
def backup_detail_json(name: str):
    detail = backup_manager.get_backup_detail(name)
    if not detail:
        return jsonify({'ok': False, 'error': 'Архив не найден'}), 404
    return jsonify({'ok': True, 'item': detail})


@bp.route('/admin/db/backup/create', methods=['POST'])
@panel_ctx.login_required
def backup_create_server_route():
    payload = request.get_json(silent=True) if request.is_json else request.form
    payload = payload or {}
    note = (payload.get('note') or '') if payload else ''
    scope = backup_manager.normalize_scope(payload.get('scope') if payload else None)
    deliver_telegram = _truthy(payload.get('deliver_telegram'))
    want_download = _truthy(payload.get('download'))

    try:
        created = backup_manager.create_backup_file(source='manual', note=note, scope=scope)
        zip_path = created.path
        if not zip_path or not os.path.isfile(zip_path):
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'ok': False, 'error': 'Не удалось создать бэкап'}), 500
            flash('Не удалось создать бэкап БД.', 'danger')
            return redirect(url_for('backups_page'))
        cleanup = backup_manager.cleanup_old_backups()
        panel_ctx.audit('db.backup.create', {'file': zip_path.name, 'note': note[:80]})
        if want_download and request.headers.get('X-Requested-With') != 'XMLHttpRequest':
            return send_file(str(zip_path), as_attachment=True, download_name=zip_path.name)
        delivery = None
        if deliver_telegram:
            delivery = _run_backup_telegram_delivery(zip_path, created.password)
            panel_ctx.audit('db.backup.telegram', {
                'file': zip_path.name,
                'sent': delivery.get('sent', 0),
                'secret': delivery.get('secret'),
                'existing': False,
            })
            if not delivery.get('ok'):
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return jsonify({
                        'ok': False,
                        'error': delivery.get('error'),
                        'name': zip_path.name,
                        'delivery': delivery,
                    }), 502
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            detail = backup_manager.get_backup_detail(zip_path.name)
            message = f'Архив {zip_path.name} создан'
            if delivery and delivery.get('ok'):
                message = delivery.get('message') or message
            return jsonify({
                'ok': True,
                'message': message,
                'name': zip_path.name,
                'item': detail,
                'cleanup': cleanup,
                'delivery': delivery,
                'download_url': url_for('backup_download_route', name=zip_path.name) if want_download else None,
            })
        flash(f'Архив {zip_path.name} создан на сервере.', 'success')
        return redirect(url_for('backups_page'))
    except Exception as e:
        logger.error('backup create server: %s', e)
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': False, 'error': str(e)}), 500
        flash('Ошибка при создании бэкапа.', 'danger')
        return redirect(url_for('backups_page'))


@bp.route('/admin/db/backup/cleanup', methods=['POST'])
@panel_ctx.login_required
def backup_cleanup_route():
    keep = None
    if request.is_json:
        raw = (request.get_json(silent=True) or {}).get('keep')
        if raw is not None:
            try:
                keep = int(raw)
            except (TypeError, ValueError):
                pass
    result = backup_manager.cleanup_old_backups(keep=keep)
    panel_ctx.audit('db.backup.cleanup', result)
    return jsonify({'ok': True, 'message': f'Удалено {result["removed"]} архивов', **result})


@bp.route('/admin/db/backup/duplicate', methods=['POST'])
@panel_ctx.login_required
def backup_duplicate_route():
    name = ''
    if request.is_json:
        name = ((request.get_json(silent=True) or {}).get('name') or '').strip()
    else:
        name = (request.form.get('name') or '').strip()
    if not name:
        return jsonify({'ok': False, 'error': 'Не указан файл'}), 400
    dest = backup_manager.duplicate_backup_file(name)
    if not dest:
        return jsonify({'ok': False, 'error': 'Не удалось скопировать архив'}), 400
    panel_ctx.audit('db.backup.duplicate', {'source': name, 'dest': dest.name})
    detail = backup_manager.get_backup_detail(dest.name)
    return jsonify({'ok': True, 'message': f'Создана копия {dest.name}', 'name': dest.name, 'item': detail})


@bp.route('/admin/db/backup/download/<path:name>')
@panel_ctx.login_required
def backup_download_route(name: str):
    path = backup_manager.resolve_backup_path(name)
    if not path:
        flash('Архив не найден.', 'danger')
        return redirect(url_for('backups_page'))
    return send_file(str(path), as_attachment=True, download_name=path.name)


@bp.route('/admin/db/backup/delete', methods=['POST'])
@panel_ctx.login_required
def backup_delete_route():
    admin_id = session.get('panel_admin_id')
    try:
        aid = int(admin_id) if admin_id is not None else 0
    except (TypeError, ValueError):
        aid = 0
    if panel_stepup.required_stepup_method(aid) and not panel_stepup.has_valid_stepup(panel_stepup.SCOPE_DESTRUCTIVE):
        msg = 'Подтвердите 2FA перед удалением архива.'
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': False, 'error': msg, 'stepup_required': True}), 403
        flash(msg, 'warning')
        return redirect(url_for('backups_page'))
    name = (request.form.get('name') or '').strip()
    if not name and request.is_json:
        name = (request.get_json(silent=True) or {}).get('name', '').strip()
    if not name:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': False, 'error': 'Не указан файл'}), 400
        flash('Не указан архив для удаления.', 'warning')
        return redirect(url_for('backups_page'))
    ok = backup_manager.delete_backup_file(name)
    if ok:
        panel_ctx.audit('db.backup.delete', {'file': Path(name).name})
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'ok': True, 'message': 'Архив удалён'})
        flash('Архив удалён.', 'success')
        return redirect(url_for('backups_page'))
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'ok': False, 'error': 'Не удалось удалить архив'}), 400
    flash('Не удалось удалить архив.', 'danger')
    return redirect(url_for('backups_page'))


@bp.route('/admin/db/backup/send-telegram', methods=['POST'])
@panel_ctx.login_required
def backup_send_telegram_route():
    payload = request.get_json(silent=True) or {}
    existing_name = (payload.get('name') or request.form.get('name') or '').strip()
    note = (payload.get('note') or request.form.get('note') or '').strip()
    scope = backup_manager.normalize_scope(payload.get('scope'))

    try:
        backup_password = None
        if existing_name:
            path = backup_manager.resolve_backup_path(existing_name)
            if not path:
                return jsonify({'ok': False, 'error': 'Архив не найден'}), 404
            zip_path = path
            backup_password = backup_manager.resolve_delivery_password(zip_path, None)
        else:
            created = backup_manager.create_backup_file(source='telegram', note=note, scope=scope)
            zip_path = created.path
            backup_password = created.password
            if not zip_path or not os.path.isfile(zip_path):
                return jsonify({'ok': False, 'error': 'Не удалось создать бэкап'}), 500
            backup_manager.cleanup_old_backups()

        delivery = _run_backup_telegram_delivery(zip_path, backup_password)
        panel_ctx.audit('db.backup.telegram', {
            'file': zip_path.name,
            'sent': delivery.get('sent', 0),
            'secret': delivery.get('secret'),
            'existing': bool(existing_name),
        })
        if not delivery.get('ok'):
            return jsonify(delivery), 502
        return jsonify(delivery)
    except Exception as e:
        logger.error('backup send telegram: %s', e)
        return jsonify({'ok': False, 'error': str(e)}), 500


@bp.route('/admin/db/backup/test-channel', methods=['POST'])
@panel_ctx.login_required
def backup_test_channel_route():
    payload = request.get_json(silent=True) or {}
    target = (payload.get('category') or payload.get('target') or 'backup').strip().lower()
    legacy_map = {'archive': 'backup', 'secrets': 'secrets'}
    category = legacy_map.get(target, target)
    from shop_bot.data_manager import telegram_notify as tg_notify
    if category not in tg_notify.ALL_CATEGORIES:
        return jsonify({'ok': False, 'error': f'Неизвестная категория: {target}'}), 400
    bot = panel_ctx.bot_controller.get_bot_instance()
    if not bot:
        return jsonify({'ok': False, 'error': 'Бот недоступен'}), 503
    loop = current_app.config.get('EVENT_LOOP')
    try:
        if loop and loop.is_running():
            future = asyncio.run_coroutine_threadsafe(tg_notify.send_test(category, bot), loop)
            ok, message = future.result(timeout=30)
        else:
            ok, message = asyncio.run(tg_notify.send_test(category, bot))
        if ok:
            return jsonify({'ok': True, 'message': message})
        return jsonify({'ok': False, 'error': message}), 400
    except Exception as e:
        logger.error('notification test channel: %s', e)
        return jsonify({'ok': False, 'error': str(e)}), 500
