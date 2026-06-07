#!/usr/bin/env python3
"""Send GitHub Release notification to Telegram (GitHub Actions).

Required repository secrets:
  TELEGRAM_RELEASE_BOT_TOKEN — bot token from @BotFather
  TELEGRAM_RELEASE_CHAT_ID   — chat / channel id (e.g. -1001234567890)

Optional:
  TELEGRAM_RELEASE_TOPIC_ID  — forum topic id for supergroups with topics
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.request


def _read_body(path: str | None) -> str:
    if not path or path == '-':
        return sys.stdin.read()
    try:
        with open(path, encoding='utf-8') as fh:
            return fh.read()
    except OSError:
        return ''


def _parse_title_line(body: str) -> tuple[str, str]:
    """Return (title_without_hash, codename) from first markdown H1."""
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith('# '):
            title = stripped[2:].strip()
            codename = ''
            if ' — ' in title:
                _, codename = title.rsplit(' — ', 1)
            return title, codename.strip()
    return '', ''


def _extract_lang_block(body: str, lang: str, *, max_items: int = 8) -> str:
    marker = f'## {lang}'
    idx = body.find(marker)
    if idx < 0:
        alt = f'## 🇬🇧 {lang}' if lang == 'EN' else f'## 🇷🇺 {lang}'
        idx = body.find(alt)
        if idx < 0:
            return ''
    chunk = body[idx + len(marker):]
    next_h2 = re.search(r'\n## [^\n]+', chunk)
    if next_h2:
        chunk = chunk[: next_h2.start()]
    items: list[str] = []
    for line in chunk.splitlines():
        stripped = line.strip()
        if stripped.startswith('#### '):
            if items:
                items.append('')
            items.append(f'<b>{html.escape(stripped[5:].strip())}</b>')
        elif stripped.startswith('- '):
            items.append(f'• {html.escape(stripped[2:].strip())}')
        if sum(1 for x in items if x.startswith('•')) >= max_items:
            break
    return '\n'.join(items).strip()


def _summarize_changelog(body: str, *, max_items: int = 10) -> str:
    en = _extract_lang_block(body, 'EN', max_items=max_items)
    ru = _extract_lang_block(body, 'RU', max_items=max_items)
    if en or ru:
        parts: list[str] = []
        if en:
            parts.append(f'🇬🇧 <b>EN</b>\n{en}')
        if ru:
            parts.append(f'🇷🇺 <b>RU</b>\n{ru}')
        return '\n\n'.join(parts)

    items: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith('- '):
            items.append(stripped[2:].strip())
        elif stripped.startswith('* '):
            items.append(stripped[2:].strip())
        if len(items) >= max_items:
            break
    if items:
        return '\n'.join(f'• {html.escape(item)}' for item in items)
    compact = re.sub(r'\s+', ' ', body).strip()
    if not compact:
        return ''
    if len(compact) > 420:
        compact = compact[:420].rstrip() + '…'
    return html.escape(compact)


def _send_message(*, token: str, chat_id: str, topic_id: str, text: str) -> None:
    payload: dict = {
        'chat_id': chat_id,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
    }
    if topic_id:
        payload['message_thread_id'] = int(topic_id)

    url = f'https://api.telegram.org/bot{token}/sendMessage'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        print(resp.read().decode('utf-8'))


def main() -> int:
    if len(sys.argv) < 3:
        print('Usage: telegram-release-notify.py <tag> <release_url> [body_file|-]', file=sys.stderr)
        return 2

    tag = sys.argv[1].strip()
    release_url = sys.argv[2].strip()
    body = _read_body(sys.argv[3] if len(sys.argv) > 3 else None)

    token = (os.environ.get('TELEGRAM_RELEASE_BOT_TOKEN') or '').strip()
    chat_id = (os.environ.get('TELEGRAM_RELEASE_CHAT_ID') or '').strip()
    topic_id = (os.environ.get('TELEGRAM_RELEASE_TOPIC_ID') or '').strip()

    if not token or not chat_id:
        missing = []
        if not token:
            missing.append('TELEGRAM_RELEASE_BOT_TOKEN')
        if not chat_id:
            missing.append('TELEGRAM_RELEASE_CHAT_ID')
        print(
            'Telegram release notify failed: missing GitHub Actions secrets: '
            + ', '.join(missing),
            file=sys.stderr,
        )
        return 1

    repo = (os.environ.get('GITHUB_REPOSITORY') or 'kissesses/remnawave-app').strip()
    image = f'ghcr.io/{repo.lower()}:{tag}'
    title_line, codename = _parse_title_line(body)
    summary = _summarize_changelog(body)

    heading = title_line or f'🚀 Remnawave App {tag}'
    if not heading.startswith('🚀'):
        heading = f'🚀 {heading}'
    title_html = f'<b>{html.escape(heading)}</b>'
    if codename and codename not in heading:
        title_html += f' — <i>{html.escape(codename)}</i>'

    summary_block = f'\n\n{summary}' if summary else ''
    text = (
        f'{title_html}{summary_block}\n\n'
        f'🔗 <a href="{html.escape(release_url, quote=True)}">GitHub Release</a>\n'
        f'🐳 <code>{html.escape(image)}</code>'
    )
    if len(text) > 4096:
        text = text[:4090].rstrip() + '…'

    try:
        _send_message(token=token, chat_id=chat_id, topic_id=topic_id, text=text)
    except urllib.error.HTTPError as exc:
        print(exc.read().decode('utf-8', errors='replace'), file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print('Telegram release notification sent.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
