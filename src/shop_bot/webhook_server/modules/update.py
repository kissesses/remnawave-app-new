import json
import os
import re
import time

import requests

from shop_bot.webhook_server.modules import panel_upgrade

_GITHUB_CACHE: dict[str, tuple[float, dict]] = {}
_GITHUB_CACHE_TTL = 3600
_OS_JSON_PATH = os.path.join(os.path.dirname(__file__), 'os.json')


def _read_os_json() -> dict:
    with open(_OS_JSON_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def get_project_config() -> dict:
    return dict(_read_os_json().get('project', {}))


def get_current_version():
    return _read_os_json().get('project', {}).get('version') or '0.0.0'


def get_image_tag_label() -> str:
    tag = (os.environ.get('SHOPBOT_IMAGE_TAG') or '').strip()
    return tag or 'latest'


def get_update_url():
    return get_project_config()['links']['update']


def parse_version(version_string):
    """Сравнимые кортежи semver; 4 части (3.2.0.1), без обрезки patch-суффикса."""
    if not version_string:
        return (0, 0, 0, 0)
    normalized = str(version_string).strip().lstrip('v').lower()
    if normalized in ('latest', 'stable'):
        return (999, 999, 999, 999)
    parts = []
    for part in normalized.split('.'):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    if not parts:
        return (0, 0, 0, 0)
    while len(parts) < 4:
        parts.append(0)
    return tuple(parts)


def build_upgrade_command(project_dir: str = '/opt/remnawave-app') -> str:
    return (
        f'cd {project_dir} && '
        'docker compose pull && docker compose up -d --force-recreate  # без compose down; тег — из .env'
    )


def _github_coords(project: dict) -> tuple[str, str]:
    github = project.get('github') or {}
    owner = github.get('owner')
    repo = github.get('repo')
    if owner and repo:
        return owner, repo
    match = re.search(r'github\.com/([^/]+)/([^/]+)', project.get('links', {}).get('repository', ''))
    if match:
        return match.group(1), match.group(2).removesuffix('.git')
    return 'kissesses', 'remnawave-app'


def _fetch_github(owner: str, repo: str) -> dict:
    cache_key = f'{owner}/{repo}'
    cached = _GITHUB_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < _GITHUB_CACHE_TTL:
        return cached[1]

    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'Remnawave-App-Panel'}
    result = {'user': None, 'repo': None}

    try:
        user_resp = requests.get(f'https://api.github.com/users/{owner}', headers=headers, timeout=6)
        if user_resp.ok:
            u = user_resp.json()
            result['user'] = {
                'login': u.get('login'),
                'name': u.get('name') or u.get('login'),
                'avatar_url': u.get('avatar_url'),
                'html_url': u.get('html_url'),
                'bio': u.get('bio'),
                'public_repos': u.get('public_repos'),
                'followers': u.get('followers'),
            }
    except Exception:
        pass

    try:
        repo_resp = requests.get(f'https://api.github.com/repos/{owner}/{repo}', headers=headers, timeout=6)
        if repo_resp.ok:
            r = repo_resp.json()
            license_info = r.get('license') or {}
            result['repo'] = {
                'name': r.get('name'),
                'full_name': r.get('full_name'),
                'description': r.get('description'),
                'html_url': r.get('html_url'),
                'stars': r.get('stargazers_count', 0),
                'forks': r.get('forks_count', 0),
                'open_issues': r.get('open_issues_count', 0),
                'license': license_info.get('spdx_id') or license_info.get('name'),
                'pushed_at': r.get('pushed_at'),
                'default_branch': r.get('default_branch', 'main'),
            }
    except Exception:
        pass

    _GITHUB_CACHE[cache_key] = (time.time(), result)
    return result


def check_for_updates():
    try:
        current_version = get_current_version()
        update_url = get_update_url()

        separator = '&' if '?' in update_url else '?'
        cache_busting_url = f"{update_url}{separator}t={int(time.time())}"

        response = requests.get(
            cache_busting_url,
            headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
            timeout=5,
        )
        response.raise_for_status()

        remote_data = response.json()
        remote_version = remote_data['project']['version']

        if parse_version(remote_version) > parse_version(current_version):
            return {
                'update_available': True,
                'current_version': current_version,
                'latest_version': remote_version,
            }
        return {
            'update_available': False,
            'current_version': current_version,
            'latest_version': remote_version,
        }
    except Exception as e:
        return {
            'update_available': False,
            'current_version': get_current_version(),
            'latest_version': None,
            'error': str(e),
        }


def get_project_info():
    project = get_project_config()
    owner, repo = _github_coords(project)
    github = _fetch_github(owner, repo)
    updates = check_for_updates()

    install_cmd = build_upgrade_command()

    caps = panel_upgrade.get_upgrade_capabilities()

    return {
        'project': {
            'name': project.get('name'),
            'brand': project.get('brand'),
            'version': project.get('version'),
            'image_tag': get_image_tag_label(),
            'tagline': project.get('tagline'),
            'license': project.get('license') or (github.get('repo') or {}).get('license'),
            'author': project.get('author'),
            'links': project.get('links', {}),
            'github': {'owner': owner, 'repo': repo},
        },
        'github': github,
        'updates': updates,
        'install_command': install_cmd,
        'upgrade': caps,
        'panel_upgrade_available': caps.get('panel_upgrade_available'),
    }


def register_update_routes(flask_app, login_required):
    @flask_app.route('/update/check', methods=['GET'])
    @login_required
    def check_updates_route():
        return check_for_updates()

    @flask_app.route('/update/info', methods=['GET'])
    @login_required
    def project_info_route():
        return get_project_info()

    @flask_app.route('/update/capabilities', methods=['GET'])
    @login_required
    def update_capabilities_route():
        return panel_upgrade.get_upgrade_capabilities()

    @flask_app.route('/update/apply', methods=['POST'])
    @login_required
    def update_apply_route():
        from flask import jsonify, request, session
        from shop_bot.data_manager import panel_stepup as ps

        admin_id = session.get('panel_admin_id')
        if ps.required_stepup_method(admin_id or 0) and not ps.has_valid_stepup(ps.SCOPE_DESTRUCTIVE):
            return jsonify({
                'ok': False,
                'error': 'stepup_required',
                'message': 'Подтвердите 2FA перед обновлением панели',
            }), 403
        payload = request.get_json(silent=True) or {}
        if payload.get('confirm') not in (True, 'true', '1', 1):
            return jsonify({'ok': False, 'error': 'Требуется подтверждение (confirm: true)'}), 400
        result = panel_upgrade.start_panel_upgrade()
        status = 200 if result.get('ok') else 400
        return jsonify(result), status

    @flask_app.route('/update/job/<job_id>', methods=['GET'])
    @login_required
    def update_job_route(job_id: str):
        from flask import jsonify

        job = panel_upgrade.get_upgrade_job(job_id)
        if not job:
            return jsonify({'ok': False, 'error': 'Задача не найдена'}), 404
        return jsonify({'ok': True, 'job': job})

    @flask_app.route('/update/job/<job_id>/health', methods=['POST'])
    @login_required
    def update_job_health_route(job_id: str):
        from flask import jsonify

        if panel_upgrade.mark_client_health_ok(job_id):
            return jsonify({'ok': True})
        return jsonify({'ok': False}), 404
