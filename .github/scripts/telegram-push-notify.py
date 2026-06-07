#!/usr/bin/env python3
"""Send GitHub push-to-main notification to Telegram (GitHub Actions).

Uses the same secrets as release notifications:
  TELEGRAM_RELEASE_BOT_TOKEN
  TELEGRAM_RELEASE_CHAT_ID
  TELEGRAM_RELEASE_TOPIC_ID (optional)
"""

from __future__ import annotations

import html
import json
import os
import sys
import urllib.error
import urllib.request


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


def _commit_word(count: int) -> str:
    n = abs(int(count))
    if n % 100 in (11, 12, 13, 14):
        return 'коммитов'
    if n % 10 == 1:
        return 'коммит'
    if n % 10 in (2, 3, 4):
        return 'коммита'
    return 'коммитов'


def _first_line(message: str) -> str:
    return (message or '').strip().split('\n', 1)[0].strip()


def _parse_commit_message(message: str) -> dict[str, str]:
    text = (message or '').strip()
    if not text:
        return {'subject': '', 'en': '', 'ru': ''}

    lines = text.splitlines()
    subject = lines[0].strip()
    en_lines: list[str] = []
    ru_lines: list[str] = []
    mode: str | None = None

    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.upper()
        if upper.startswith('EN:'):
            mode = 'en'
            rest = stripped[3:].strip()
            if rest:
                en_lines.append(rest)
            continue
        if upper.startswith('RU:'):
            mode = 'ru'
            rest = stripped[3:].strip()
            if rest:
                ru_lines.append(rest)
            continue
        if mode == 'en':
            en_lines.append(stripped)
        elif mode == 'ru':
            ru_lines.append(stripped)

    return {
        'subject': subject,
        'en': '\n'.join(en_lines).strip(),
        'ru': '\n'.join(ru_lines).strip(),
    }


def _truncate(text: str, limit: int = 320) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + '…'


def _format_commit_entry(commit: dict) -> str:
    parsed = _parse_commit_message(str(commit.get('message') or ''))
    subject = parsed['subject'] or _first_line(str(commit.get('message') or ''))
    if not subject:
        return ''

    author = ''
    author_obj = commit.get('author') or {}
    if isinstance(author_obj, dict):
        author = str(author_obj.get('name') or author_obj.get('username') or '').strip()

    cid = str(commit.get('id') or '')[:7]
    prefix = f'<code>{html.escape(cid)}</code> ' if cid else ''
    author_suffix = f' <i>— {html.escape(author)}</i>' if author else ''

    blocks = [f'• {prefix}{html.escape(subject)}{author_suffix}']

    if parsed['en']:
        blocks.append(f'EN: {html.escape(_truncate(parsed["en"]))}')
    if parsed['ru']:
        blocks.append(f'RU: {html.escape(_truncate(parsed["ru"]))}')

    return '\n'.join(blocks)


def main() -> int:
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
            'Telegram push notify failed: missing GitHub Actions secrets: '
            + ', '.join(missing),
            file=sys.stderr,
        )
        print(
            'Add them in GitHub → Settings → Secrets and variables → Actions '
            '(names must match exactly).',
            file=sys.stderr,
        )
        return 1

    repo = (os.environ.get('GITHUB_REPOSITORY') or 'kissesses/remnawave-app').strip()
    branch = (os.environ.get('GITHUB_REF_NAME') or 'main').strip()
    actor = (os.environ.get('GITHUB_ACTOR') or 'unknown').strip()
    sha = (os.environ.get('GITHUB_SHA') or '').strip()
    before = (os.environ.get('GITHUB_BEFORE') or '').strip()

    commits_raw = (os.environ.get('GITHUB_COMMITS_JSON') or '[]').strip()
    try:
        commits = json.loads(commits_raw)
    except json.JSONDecodeError:
        commits = []

    if not isinstance(commits, list):
        commits = []

    short_sha = sha[:7] if sha else '???????'
    compare_url = f'https://github.com/{repo}/compare/{before}...{sha}' if before and sha else f'https://github.com/{repo}/commits/{branch}'
    commit_url = f'https://github.com/{repo}/commit/{sha}' if sha else compare_url

    entries: list[str] = []
    max_items = 8
    for commit in commits[:max_items]:
        if not isinstance(commit, dict):
            continue
        entry = _format_commit_entry(commit)
        if entry:
            entries.append(entry)

    omitted = max(0, len(commits) - max_items)
    if omitted:
        entries.append(f'• … и ещё {omitted}')

    if not entries:
        head_parsed = _parse_commit_message(os.environ.get('GITHUB_HEAD_MESSAGE') or '')
        head_subject = head_parsed['subject'] or _first_line(os.environ.get('GITHUB_HEAD_MESSAGE') or '')
        if head_subject:
            block = f'• <code>{html.escape(short_sha)}</code> {html.escape(head_subject)}'
            if head_parsed['en']:
                block += f'\nEN: {html.escape(_truncate(head_parsed["en"]))}'
            if head_parsed['ru']:
                block += f'\nRU: {html.escape(_truncate(head_parsed["ru"]))}'
            entries.append(block)

    commits_block = '\n\n'.join(entries)
    count = len(commits) if commits else 1
    count_label = _commit_word(count)

    text = (
        f'<b>📦 Push в {html.escape(branch)}</b>\n'
        f'<code>{html.escape(repo)}</code>\n\n'
        f'👤 {html.escape(actor)}\n'
        f'📝 {count} {count_label}\n\n'
        f'{commits_block}\n\n'
        f'🔗 <a href="{html.escape(compare_url, quote=True)}">Сравнить</a> · '
        f'<a href="{html.escape(commit_url, quote=True)}">{html.escape(short_sha)}</a>'
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

    print('Telegram push notification sent.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
