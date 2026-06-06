"""In-panel Docker upgrade (image tag latest/stable + mounted compose dir + docker socket)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_COMPOSE_DIR = os.environ.get('SHOPBOT_COMPOSE_PROJECT_DIR', '/opt/remnawave-app').strip()
_DOCKER_SOCK = os.environ.get('SHOPBOT_DOCKER_SOCKET', '/var/run/docker.sock')
_SERVICE = os.environ.get('SHOPBOT_COMPOSE_SERVICE', 'remnawave-app')
_HEALTH_URL = os.environ.get('SHOPBOT_HEALTH_URL', 'http://127.0.0.1:1337/login')
# Helper: образ shopbot с --entrypoint docker (docker-compose-plugin уже в образе)
_DEFAULT_IMAGE_REGISTRY = 'ghcr.io/kissesses/remnawave-app'
_UPGRADE_LOG = '.upgrade-recreate.log'
_UPGRADE_JOB_FILE = '.upgrade-job.json'
_JOB_LOCK = threading.Lock()
_ACTIVE_JOB: dict[str, Any] | None = None

STEP_WEIGHTS = {
    'validate': (0, 8),
    'pull': (8, 72),
    'recreate': (72, 88),
    'health': (88, 100),
}


def _image_tag() -> str:
    return (os.environ.get('SHOPBOT_IMAGE_TAG') or 'latest').strip().lower()


def _tag_allows_panel_upgrade(tag: str | None = None) -> bool:
    t = (tag or _image_tag()).lower()
    return t in ('latest', 'stable', '')


def _docker_available() -> bool:
    if not os.path.exists(_DOCKER_SOCK):
        return False
    return shutil.which('docker') is not None


def _compose_project_ready() -> bool:
    compose_file = os.path.join(_COMPOSE_DIR, 'docker-compose.yml')
    return os.path.isfile(compose_file)


def get_upgrade_capabilities() -> dict[str, Any]:
    tag = _image_tag() or 'latest'
    docker_ok = _docker_available()
    compose_ok = _compose_project_ready()
    tag_ok = _tag_allows_panel_upgrade(tag)

    reasons: list[str] = []
    if not tag_ok:
        reasons.append(
            f'Тег образа «{tag}» — обновление из панели только для latest/stable. '
            'Измените SHOPBOT_IMAGE_TAG в .env или выполните команду вручную.'
        )
    if not docker_ok:
        reasons.append(
            'Нет доступа к Docker (смонтируйте /var/run/docker.sock и установите docker CLI в образ).'
        )
    if not compose_ok:
        reasons.append(
            f'Не найден docker-compose.yml в {_COMPOSE_DIR} '
            '(смонтируйте каталог проекта в контейнер).'
        )

    available = tag_ok and docker_ok and compose_ok
    return {
        'panel_upgrade_available': available,
        'image_tag': tag,
        'compose_dir': _COMPOSE_DIR,
        'service': _SERVICE,
        'reasons': reasons,
        'reason': reasons[0] if reasons else None,
    }


def _job_public_view(job: dict[str, Any]) -> dict[str, Any]:
    return {
        'id': job['id'],
        'status': job['status'],
        'step': job['step'],
        'progress': job['progress'],
        'message': job['message'],
        'log': list(job.get('log') or []),
        'await_client_health': bool(job.get('await_client_health')),
        'started_at': job.get('started_at'),
        'finished_at': job.get('finished_at'),
    }


def _save_job_file(job: dict[str, Any]) -> None:
    try:
        path = os.path.join(_COMPOSE_DIR, _UPGRADE_JOB_FILE)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(
                {
                    'id': job['id'],
                    'status': job['status'],
                    'step': job['step'],
                    'progress': job['progress'],
                    'message': job['message'],
                    'log': list(job.get('log') or []),
                    'await_client_health': bool(job.get('await_client_health')),
                    'started_at': job.get('started_at'),
                    'finished_at': job.get('finished_at'),
                },
                fh,
                ensure_ascii=False,
            )
    except OSError:
        pass


def _clear_job_file() -> None:
    try:
        os.remove(os.path.join(_COMPOSE_DIR, _UPGRADE_JOB_FILE))
    except OSError:
        pass


def _restore_job_from_file() -> dict[str, Any] | None:
    path = os.path.join(_COMPOSE_DIR, _UPGRADE_JOB_FILE)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)
        if not isinstance(data, dict) or not data.get('id'):
            return None
        if data.get('status') not in ('running', 'done', 'error'):
            return None
        data.setdefault('log', [])
        return data
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def _append_log(job: dict[str, Any], line: str) -> None:
    line = (line or '').rstrip()
    if not line:
        return
    job['log'].append(line)
    if len(job['log']) > 200:
        job['log'] = job['log'][-200:]


def _set_step(job: dict[str, Any], step: str, message: str, progress: int | None = None) -> None:
    job['step'] = step
    job['message'] = message
    if progress is not None:
        lo, hi = STEP_WEIGHTS.get(step, (0, 100))
        job['progress'] = min(hi, max(lo, progress))
    _save_job_file(job)


def _run_compose(args: list[str], job: dict[str, Any], step: str) -> None:
    cmd = ['docker', 'compose', *args]
    _append_log(job, f'$ cd {_COMPOSE_DIR} && {" ".join(cmd)}')
    proc = subprocess.Popen(
        cmd,
        cwd=_COMPOSE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    line_no = 0
    for line in proc.stdout:
        _append_log(job, line)
        line_no += 1
        lo, hi = STEP_WEIGHTS.get(step, (0, 100))
        if step == 'pull' and line_no % 3 == 0:
            job['progress'] = min(hi - 2, lo + min(50, line_no * 2))
    rc = proc.wait(timeout=600)
    if rc != 0:
        raise RuntimeError(f'Команда завершилась с кодом {rc}')


def _wait_health(job: dict[str, Any], timeout_sec: int = 120) -> None:
    import requests

    _set_step(job, 'health', 'Ожидание запуска новой панели…', 90)
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            r = requests.get(_HEALTH_URL, timeout=3, allow_redirects=True)
            if r.status_code < 500:
                _set_step(job, 'health', 'Панель отвечает', 100)
                return
        except Exception:
            pass
        time.sleep(2)
        elapsed = timeout_sec - (deadline - time.time())
        job['progress'] = 90 + int(min(9, elapsed / timeout_sec * 10))
    raise RuntimeError('Панель не ответила после обновления (таймаут)')


def _compose_project_name() -> str:
    name = (os.environ.get('COMPOSE_PROJECT_NAME') or '').strip()
    if name:
        return name
    try:
        proc = subprocess.run(
            ['docker', 'compose', 'ls', '--format', 'json'],
            cwd=_COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            for line in proc.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if row.get('ConfigFiles') and _COMPOSE_DIR in str(row.get('ConfigFiles', '')):
                    return row.get('Name') or 'remnawave-app'
    except Exception:
        pass
    return 'remnawave-app'


def _resolve_helper_image() -> str:
    """Образ с docker compose plugin. По умолчанию — тот же shopbot (уже локально после pull)."""
    custom = os.environ.get('SHOPBOT_UPGRADE_HELPER_IMAGE', '').strip()
    if custom:
        return custom
    registry = (
        os.environ.get('SHOPBOT_IMAGE_REGISTRY', _DEFAULT_IMAGE_REGISTRY).strip().rstrip('/')
    )
    tag = _image_tag() or 'latest'
    return f'{registry}:{tag}'


def _spawn_recreate_helper(job: dict[str, Any]) -> None:
    """Пересоздание через detached helper — shopbot не убивает сам себя."""
    helper_name = f'shopbot-recreate-{job["id"][:8]}'
    subprocess.run(['docker', 'rm', '-f', helper_name], capture_output=True, timeout=15)

    project = _compose_project_name()
    helper_image = _resolve_helper_image()
    log_path = os.path.join(_COMPOSE_DIR, _UPGRADE_LOG)
    try:
        with open(log_path, 'a', encoding='utf-8') as fh:
            fh.write(f'\n--- upgrade {job["id"]} project={project} image={helper_image} ---\n')
    except OSError:
        pass
    cmd = [
        'docker', 'run', '-d', '--rm', '--name', helper_name,
        '-v', f'{_DOCKER_SOCK}:/var/run/docker.sock',
        '-v', f'{_COMPOSE_DIR}:{_COMPOSE_DIR}',
        '-w', _COMPOSE_DIR,
        '--entrypoint', 'docker',
        helper_image,
        'compose', '-f', 'docker-compose.yml',
        '-p', project,
        'up', '-d', '--force-recreate', '--no-deps', _SERVICE,
    ]
    _append_log(job, f'$ {" ".join(cmd)}')
    _append_log(job, f'[info] compose project={project}, helper={helper_image}, log={log_path}')
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or 'recreate helper failed').strip()
        raise RuntimeError(err)
    out = (proc.stdout or '').strip()
    if out:
        _append_log(job, out)
    time.sleep(1)


def _run_upgrade_job(job_id: str) -> None:
    global _ACTIVE_JOB
    job = _ACTIVE_JOB
    if not job or job['id'] != job_id:
        return
    try:
        _set_step(job, 'validate', 'Проверка окружения…', 5)
        cap = get_upgrade_capabilities()
        if not cap['panel_upgrade_available']:
            raise RuntimeError(cap.get('reason') or 'Обновление из панели недоступно')

        _set_step(job, 'pull', 'Загрузка образа с GHCR…', 12)
        _run_compose(['pull', _SERVICE], job, 'pull')

        _set_step(job, 'recreate', 'Пересоздание контейнера ShopBot…', 75)
        # Сначала передаём браузеру фазу health — иначе контейнер погибает на recreate
        # и клиент навсегда остаётся на 75% (job только в памяти).
        job['await_client_health'] = True
        _set_step(job, 'health', 'Перезапуск контейнера — ожидание панели…', 92)
        _spawn_recreate_helper(job)
        return
    except Exception as e:
        logger.error('Panel upgrade failed: %s', e, exc_info=True)
        job['status'] = 'error'
        job['message'] = str(e)
        _append_log(job, f'[ERROR] {e}')
        _save_job_file(job)
    finally:
        job['finished_at'] = time.time()
        if job.get('status') in ('done', 'error'):
            _clear_job_file()
        else:
            _save_job_file(job)


def start_panel_upgrade() -> dict[str, Any]:
    global _ACTIVE_JOB
    with _JOB_LOCK:
        if _ACTIVE_JOB and _ACTIVE_JOB.get('status') == 'running':
            return {'ok': False, 'error': 'Обновление уже выполняется', 'job_id': _ACTIVE_JOB['id']}

        cap = get_upgrade_capabilities()
        if not cap['panel_upgrade_available']:
            return {'ok': False, 'error': cap.get('reason') or 'Недоступно', 'capabilities': cap}

        job_id = uuid.uuid4().hex[:12]
        _ACTIVE_JOB = {
            'id': job_id,
            'status': 'running',
            'step': 'validate',
            'progress': 0,
            'message': 'Запуск…',
            'log': [],
            'await_client_health': False,
            'started_at': time.time(),
            'finished_at': None,
            'target_version': None,
        }
        _save_job_file(_ACTIVE_JOB)
        threading.Thread(target=_run_upgrade_job, args=(job_id,), daemon=True).start()
        return {'ok': True, 'job_id': job_id}


def get_upgrade_job(job_id: str) -> dict[str, Any] | None:
    global _ACTIVE_JOB
    with _JOB_LOCK:
        if not _ACTIVE_JOB:
            restored = _restore_job_from_file()
            if restored and restored.get('id') == job_id:
                _ACTIVE_JOB = restored
        if not _ACTIVE_JOB or _ACTIVE_JOB['id'] != job_id:
            return None
        return _job_public_view(_ACTIVE_JOB)


def mark_client_health_ok(job_id: str) -> bool:
    global _ACTIVE_JOB
    with _JOB_LOCK:
        if not _ACTIVE_JOB:
            restored = _restore_job_from_file()
            if restored and restored.get('id') == job_id:
                _ACTIVE_JOB = restored
        if not _ACTIVE_JOB or _ACTIVE_JOB['id'] != job_id:
            return False
        if _ACTIVE_JOB['status'] != 'running' or not _ACTIVE_JOB.get('await_client_health'):
            return _ACTIVE_JOB['status'] == 'done'
        _ACTIVE_JOB['status'] = 'done'
        _ACTIVE_JOB['progress'] = 100
        _ACTIVE_JOB['message'] = 'Панель снова доступна'
        _ACTIVE_JOB['await_client_health'] = False
        _ACTIVE_JOB['finished_at'] = time.time()
        _clear_job_file()
        return True
