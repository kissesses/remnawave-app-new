import asyncio
import csv
import io
import logging

from flask import current_app, flash, jsonify, redirect, render_template, request, url_for, Response
from math import ceil

from shop_bot.data_manager.remnawave_repository import (
    add_support_message,
    delete_ticket,
    get_support_inbox_stats,
    get_ticket,
    get_ticket_messages,
    get_tickets_for_export,
    get_tickets_paginated,
    set_ticket_status,
    toggle_ticket_important,
    update_ticket_subject,
)
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('support', __name__)


def _wants_json() -> bool:
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return True
    accept = request.headers.get('Accept', '')
    return 'application/json' in accept


def _bot_loop():
    bot = panel_ctx.support_bot_controller.get_bot_instance()
    loop = current_app.config.get('EVENT_LOOP')
    return bot, loop


def _run_async(coro):
    bot, loop = _bot_loop()
    if bot and loop and loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, loop)
    return None


def _notify_user(ticket: dict, text: str):
    try:
        user_chat_id = ticket.get('user_id')
        bot, loop = _bot_loop()
        if bot and loop and loop.is_running() and user_chat_id:
            asyncio.run_coroutine_threadsafe(bot.send_message(int(user_chat_id), text), loop)
    except Exception as e:
        logger.warning("Support notify user failed: %s", e)


def _mirror_forum(ticket: dict, text: str):
    try:
        bot, loop = _bot_loop()
        forum_chat_id = ticket.get('forum_chat_id')
        thread_id = ticket.get('message_thread_id')
        if bot and loop and loop.is_running() and forum_chat_id and thread_id:
            asyncio.run_coroutine_threadsafe(
                bot.send_message(chat_id=int(forum_chat_id), text=text, message_thread_id=int(thread_id)),
                loop,
            )
    except Exception as e:
        logger.warning("Support forum mirror failed: %s", e)


def _forum_topic_action(ticket: dict, action: str):
    bot, loop = _bot_loop()
    forum_chat_id = ticket.get('forum_chat_id')
    thread_id = ticket.get('message_thread_id')
    if not (bot and loop and loop.is_running() and forum_chat_id and thread_id):
        return
    chat_id = int(forum_chat_id)
    topic_id = int(thread_id)
    try:
        if action == 'close':
            asyncio.run_coroutine_threadsafe(bot.close_forum_topic(chat_id=chat_id, message_thread_id=topic_id), loop)
        elif action == 'open':
            asyncio.run_coroutine_threadsafe(bot.reopen_forum_topic(chat_id=chat_id, message_thread_id=topic_id), loop)
        elif action == 'delete':
            fut = asyncio.run_coroutine_threadsafe(
                bot.delete_forum_topic(chat_id=chat_id, message_thread_id=topic_id), loop
            )
            fut.result(timeout=5)
    except Exception as e:
        logger.warning("Forum topic %s failed for ticket: %s", action, e)
        if action == 'delete':
            try:
                asyncio.run_coroutine_threadsafe(
                    bot.close_forum_topic(chat_id=chat_id, message_thread_id=topic_id), loop
                ).result(timeout=5)
            except Exception:
                pass


def _sync_star_to_forum(ticket: dict, ticket_id: int, new_subject: str, was_starred: bool):
    bot, loop = _bot_loop()
    forum_chat_id = ticket.get('forum_chat_id')
    thread_id = ticket.get('message_thread_id')
    if not (bot and loop and loop.is_running() and forum_chat_id and thread_id):
        return

    async def _do():
        display = new_subject.lstrip('⭐').strip() or 'Без темы'
        topic_name = f"#{ticket_id} {'🔴 Важно: ' if new_subject.startswith('⭐') else ''}{display[:40]}"
        try:
            await bot.edit_forum_topic(
                chat_id=int(forum_chat_id),
                message_thread_id=int(thread_id),
                name=topic_name[:128],
            )
        except Exception:
            pass
        state_text = "включена" if not was_starred else "снята"
        msg = await bot.send_message(
            chat_id=int(forum_chat_id),
            message_thread_id=int(thread_id),
            text=f"⭐ Важность {state_text} для тикета #{ticket_id}.",
        )
        try:
            if not was_starred:
                await bot.pin_chat_message(
                    chat_id=int(forum_chat_id), message_id=msg.message_id, disable_notification=True
                )
            else:
                await bot.unpin_all_forum_topic_messages(
                    chat_id=int(forum_chat_id), message_thread_id=int(thread_id)
                )
        except Exception:
            pass

    asyncio.run_coroutine_threadsafe(_do(), loop)


def _ticket_display_subject(subject: str | None) -> tuple[str, bool]:
    s = (subject or '').strip() or 'Без темы'
    if s.startswith('⭐ '):
        return s[2:].strip() or 'Без темы', True
    if s.startswith('⭐'):
        return s.lstrip('⭐').strip() or 'Без темы', True
    return s, False


def _render_inbox_partial(status: str, page: int, search: str, sort: str = 'priority'):
    per_page = 15
    tickets, total = get_tickets_paginated(
        page=page, per_page=per_page,
        status=status if status != 'all' else None,
        search=search or None,
        sort=sort or 'priority',
    )
    total_pages = ceil(total / per_page) if per_page else 1
    list_html = render_template('partials/support_inbox_list.html', tickets=tickets, active_ticket_id=request.args.get('ticket', type=int))

    pagination_html = ''
    if total_pages > 1:
        q = f"&q={search}" if search else ''
        s = f"&sort={sort}" if sort and sort != 'priority' else ''
        pagination_html = '<div class="support-pagination">'
        if page > 1:
            pagination_html += (
                f'<a href="/support?status={status}&page={page - 1}{q}{s}" '
                f'class="support-pagination__btn ajax-nav"><span class="material-symbols-outlined">chevron_left</span></a>'
            )
        pagination_html += f'<span class="support-pagination__label">{page} / {total_pages}</span>'
        if page < total_pages:
            pagination_html += (
                f'<a href="/support?status={status}&page={page + 1}{q}{s}" '
                f'class="support-pagination__btn ajax-nav"><span class="material-symbols-outlined">chevron_right</span></a>'
            )
        pagination_html += '</div>'

    return list_html, pagination_html, total


@bp.route('/support/table.partial')
@panel_ctx.login_required
def support_table_partial():
    status = request.args.get('status', 'waiting')
    page = request.args.get('page', 1, type=int)
    search = (request.args.get('q') or '').strip()
    sort = (request.args.get('sort') or 'priority').strip()
    list_html, pagination_html, _ = _render_inbox_partial(status, page, search, sort)
    stats = get_support_inbox_stats()
    return jsonify({
        "table_html": list_html,
        "pagination_html": pagination_html,
        "stats": stats,
    })


@bp.route('/support/stats.json')
@panel_ctx.login_required
def support_stats_json():
    return jsonify({"ok": True, **get_support_inbox_stats()})


@bp.route('/support/export.csv')
@panel_ctx.login_required
def support_export_csv():
    status = request.args.get('status', 'all')
    search = (request.args.get('q') or '').strip()
    sort = (request.args.get('sort') or 'updated').strip()
    rows = get_tickets_for_export(
        status=status if status != 'all' else None,
        search=search or None,
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(['ticket_id', 'user_id', 'username', 'status', 'subject', 'messages', 'updated_at', 'created_at'])
    for t in rows:
        subj = (t.get('subject') or '').replace('\n', ' ')
        writer.writerow([
            t.get('ticket_id'),
            t.get('user_id'),
            t.get('username') or '',
            t.get('status'),
            subj,
            t.get('message_count') or 0,
            t.get('updated_at') or '',
            t.get('created_at') or '',
        ])
    filename = f'support-{status}.csv'
    return Response(
        buf.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@bp.route('/support/bulk', methods=['POST'])
@panel_ctx.login_required
def support_bulk_route():
    data = request.get_json(silent=True) or {}
    action = (data.get('action') or '').strip()
    ids = data.get('ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'ok': False, 'error': 'Не выбраны тикеты'}), 400
    ids = [int(x) for x in ids if str(x).isdigit()]
    if action not in ('close', 'delete'):
        return jsonify({'ok': False, 'error': 'Неизвестное действие'}), 400

    done = 0
    errors: list[str] = []
    for tid in ids:
        ticket = get_ticket(tid)
        if not ticket:
            errors.append(f'#{tid}: не найден')
            continue
        try:
            if action == 'close':
                if ticket.get('status') != 'closed' and set_ticket_status(tid, 'closed'):
                    _forum_topic_action(ticket, 'close')
                    _notify_user(
                        ticket,
                        f"✅ <b>Ваш тикет #{tid} был закрыт</b>\n\n"
                        f"💌 <b>Вы можете создать новое обращение при необходимости.</b>",
                    )
                    done += 1
                else:
                    errors.append(f'#{tid}: уже закрыт')
            elif action == 'delete':
                _forum_topic_action(ticket, 'delete')
                if delete_ticket(tid):
                    done += 1
                else:
                    errors.append(f'#{tid}: ошибка удаления')
        except Exception as e:
            errors.append(f'#{tid}: {e}')
    return jsonify({'ok': done > 0, 'done': done, 'total': len(ids), 'errors': errors[:5]})


@bp.route('/support/open-count.partial')
@panel_ctx.login_required
def support_open_count_partial():
    try:
        count = get_open_tickets_count() or 0
    except Exception:
        count = 0
    if count:
        html = f'<span class="support-pill support-pill--open">{count}</span>'
    else:
        html = ''
    return html, 200, {"Content-Type": "text/html; charset=utf-8"}


@bp.route('/support')
@panel_ctx.login_required
def support_list_page():
    status = request.args.get('status', 'waiting')
    page = request.args.get('page', 1, type=int)
    search = (request.args.get('q') or '').strip()
    sort = (request.args.get('sort') or 'priority').strip()
    common_data = panel_ctx.get_common_template_data()
    stats = get_support_inbox_stats()
    return render_template(
        'support.html',
        filter_status=status,
        current_page=page,
        search_query=search,
        sort_by=sort,
        open_count=stats.get('open', 0),
        closed_count=stats.get('closed', 0),
        all_count=stats.get('all', 0),
        waiting_count=stats.get('waiting', 0),
        important_count=stats.get('important', 0),
        messages_today=stats.get('messages_today', 0),
        **common_data,
    )


@bp.route('/support/<int:ticket_id>', methods=['GET', 'POST'])
@panel_ctx.login_required
def support_ticket_page(ticket_id):
    ticket = get_ticket(ticket_id)
    if not ticket:
        flash('Тикет не найден.', 'danger')
        return redirect(url_for('support_list_page'))

    if request.method == 'POST':
        message = (request.form.get('message') or '').strip()
        action = request.form.get('t_action') or request.form.get('action')
        ok = False
        msg = ''

        if action == 'reply':
            if not message:
                msg = 'Сообщение не может быть пустым.'
            else:
                add_support_message(ticket_id, sender='admin', content=message)
                user_text = (
                    f"💬 <b>Ответ от технической поддержки.</b>\n"
                    f"📝 <b>ID тикета:</b> <code>#{ticket_id}</code>\n\n"
                    f"💌 <b>Ответ на ваше обращение:</b>\n<blockquote>{message}</blockquote>"
                )
                _notify_user(ticket, user_text)
                forum_text = (
                    f"💬 <b>Ответ технической поддержки:</b>\n"
                    f"📝 <b>ID тикета:</b> <code>#{ticket_id}</code>\n\n"
                    f"💌 <b>Ответ:</b>\n<blockquote>{message}</blockquote>"
                )
                _mirror_forum(ticket, forum_text)
                ok, msg = True, 'Ответ отправлен.'

        elif action == 'note':
            if not message:
                msg = 'Заметка не может быть пустой.'
            else:
                add_support_message(ticket_id, sender='note', content=message)
                _mirror_forum(ticket, f"📝 <b>Внутренняя заметка:</b>\n<blockquote>{message}</blockquote>")
                ok, msg = True, 'Заметка добавлена.'

        elif action == 'star':
            was_starred = (ticket.get('subject') or '').startswith('⭐')
            changed, new_subject = toggle_ticket_important(ticket_id)
            if changed:
                _sync_star_to_forum(ticket, ticket_id, new_subject or '', was_starred)
                ok, msg = True, 'Важность обновлена.'
                ticket = get_ticket(ticket_id)
            else:
                msg = 'Не удалось обновить важность.'

        elif action == 'close':
            if ticket.get('status') != 'closed' and set_ticket_status(ticket_id, 'closed'):
                _forum_topic_action(ticket, 'close')
                _notify_user(
                    ticket,
                    f"✅ <b>Ваш тикет #{ticket_id} был закрыт</b>\n\n"
                    f"💌 <b>Вы можете создать новое обращение при необходимости.</b>",
                )
                ok, msg = True, 'Тикет закрыт.'
                ticket = get_ticket(ticket_id)
            else:
                msg = 'Не удалось закрыть тикет.'

        elif action == 'open':
            if ticket.get('status') != 'open' and set_ticket_status(ticket_id, 'open'):
                _forum_topic_action(ticket, 'open')
                _notify_user(
                    ticket,
                    f"🔓 <b>Ваш тикет #{ticket_id} был переоткрыт!</b>\n\n"
                    f"Вы можете продолжить общение.",
                )
                ok, msg = True, 'Тикет открыт.'
                ticket = get_ticket(ticket_id)
            else:
                msg = 'Не удалось открыть тикет.'

        if _wants_json():
            return jsonify({"ok": ok, "message": msg, "status": ticket.get('status') if ticket else None})

        flash(msg or ('Готово' if ok else 'Ошибка'), 'success' if ok else 'warning')
        return redirect(url_for('support_ticket_page', ticket_id=ticket_id))

    messages = get_ticket_messages(ticket_id)
    display_subject, is_important = _ticket_display_subject(ticket.get('subject'))

    if request.args.get('partial') == 'true':
        return render_template(
            'partials/support_ticket_messages.html',
            ticket=ticket,
            messages=messages,
        )

    common_data = panel_ctx.get_common_template_data()
    return render_template(
        'ticket.html',
        ticket=ticket,
        messages=[],
        display_subject=display_subject,
        is_important=is_important,
        **common_data,
    )


@bp.route('/support/<int:ticket_id>/panel.partial')
@panel_ctx.login_required
def support_ticket_panel_partial(ticket_id: int):
    ticket = get_ticket(ticket_id)
    if not ticket:
        return '', 404
    messages = get_ticket_messages(ticket_id)
    display_subject, is_important = _ticket_display_subject(ticket.get('subject'))
    is_waiting = ticket.get('status') == 'open' and ticket.get('last_sender') == 'user'
    return render_template(
        'partials/support_ticket_panel.html',
        ticket=ticket,
        messages=messages,
        display_subject=display_subject,
        is_important=is_important,
        is_waiting=is_waiting,
    )


@bp.route('/support/<int:ticket_id>/messages.json')
@panel_ctx.login_required
def support_ticket_messages_api(ticket_id):
    ticket = get_ticket(ticket_id)
    if not ticket:
        return jsonify({"error": "not_found"}), 404
    messages = get_ticket_messages(ticket_id) or []
    return jsonify({
        "ticket_id": ticket_id,
        "status": ticket.get('status'),
        "messages": [
            {"sender": m.get('sender'), "content": m.get('content'), "created_at": m.get('created_at')}
            for m in messages
        ],
    })


@bp.route('/support/<int:ticket_id>/delete', methods=['POST'])
@panel_ctx.login_required
def delete_support_ticket_route(ticket_id: int):
    ticket = get_ticket(ticket_id)
    if not ticket:
        flash('Тикет не найден.', 'danger')
        return redirect(url_for('support_list_page'))
    _forum_topic_action(ticket, 'delete')
    if delete_ticket(ticket_id):
        if _wants_json():
            return jsonify({"ok": True, "message": f"Тикет #{ticket_id} удалён."})
        flash(f"Тикет #{ticket_id} удалён.", 'success')
        return redirect(url_for('support_list_page'))
    if _wants_json():
        return jsonify({"ok": False, "message": f"Не удалось удалить тикет #{ticket_id}."}), 400
    flash(f"Не удалось удалить тикет #{ticket_id}.", 'danger')
    return redirect(url_for('support_ticket_page', ticket_id=ticket_id))


@bp.route('/support/delete-all', methods=['POST'])
@panel_ctx.login_required
def delete_all_tickets_route():
    try:
        tickets, _ = get_tickets_paginated(page=1, per_page=10000, status='')
        deleted = 0
        for ticket in tickets:
            tid = ticket.get('ticket_id')
            _forum_topic_action(ticket, 'delete')
            if delete_ticket(tid):
                deleted += 1
        flash(f'Удалено тикетов: {deleted}', 'success')
    except Exception as e:
        logger.error("Failed to delete all tickets: %s", e)
        flash('Ошибка при удалении тикетов.', 'danger')
    return redirect(url_for('support_list_page'))
