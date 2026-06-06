"""Полный бэкап Remnawave Panel: PostgreSQL (docker compose) + файлы установки."""

from __future__ import annotations

import logging
import os
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Callable

from shop_bot.data_manager import remnawave_repository as rw_repo
from shop_bot.data_manager import speedtest_runner

logger = logging.getLogger(__name__)

REMNAWAVE_ARCHIVE_PREFIX = "remnawave/"
DEFAULT_COMPOSE_DIR = "/opt/remnawave"
DEFAULT_PG_SERVICE = "remnawave-db"

_COMPOSE_TAR_EXCLUDES = (
    "backups",
    ".git",
    "node_modules",
    "__pycache__",
    ".cursor",
)


def get_remnawave_backup_settings() -> dict[str, Any]:
    mode = (rw_repo.get_setting("backup_remnawave_mode") or "local").strip().lower()
    if mode not in ("local", "ssh"):
        mode = "local"
    compose_dir = (
        os.environ.get("REMNAWAVE_BACKUP_COMPOSE_DIR", "").strip()
        or (rw_repo.get_setting("backup_remnawave_compose_dir") or "").strip()
        or DEFAULT_COMPOSE_DIR
    )
    return {
        "mode": mode,
        "compose_dir": compose_dir,
        "ssh_target": (rw_repo.get_setting("backup_remnawave_ssh_target") or "").strip(),
        "pg_service": (rw_repo.get_setting("backup_remnawave_pg_service") or DEFAULT_PG_SERVICE).strip()
        or DEFAULT_PG_SERVICE,
        "database_url": (
            os.environ.get("REMNAWAVE_BACKUP_DATABASE_URL", "").strip()
            or (rw_repo.get_setting("backup_remnawave_database_url") or "").strip()
        ),
        "compose_cmd": (rw_repo.get_setting("backup_remnawave_compose_cmd") or "").strip(),
    }


def _resolve_database_url(cfg: dict[str, Any] | None = None) -> str:
    """URL для pg_dump: настройки → env → DATABASE_URL из compose/.env."""
    cfg = cfg or get_remnawave_backup_settings()
    direct = (cfg.get("database_url") or "").strip()
    if direct:
        return direct
    env_path = Path(cfg.get("compose_dir") or DEFAULT_COMPOSE_DIR) / ".env"
    if not env_path.is_file():
        return ""
    env_vars = _parse_dotenv(env_path.read_text(encoding="utf-8", errors="ignore"))
    db_url = (env_vars.get("DATABASE_URL") or "").strip().strip('"').strip("'")
    if db_url:
        return db_url
    user = env_vars.get("POSTGRES_USER")
    pwd = env_vars.get("POSTGRES_PASSWORD")
    db = env_vars.get("POSTGRES_DB") or "postgres"
    if user and pwd:
        return f"postgresql://{user}:{pwd}@remnawave-db:5432/{db}"
    return ""


def _compose_dir_accessible(cfg: dict[str, Any] | None = None) -> bool:
    cfg = cfg or get_remnawave_backup_settings()
    return Path(cfg.get("compose_dir") or DEFAULT_COMPOSE_DIR).is_dir()


def is_remnawave_backup_configured() -> bool:
    cfg = get_remnawave_backup_settings()
    if _resolve_database_url(cfg):
        return True
    if cfg["mode"] == "ssh":
        return bool(cfg["ssh_target"] and cfg["compose_dir"])
    if _compose_dir_accessible(cfg):
        return _local_docker_available() or bool(cfg["ssh_target"])
    return False


def _local_docker_available() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=15,
            check=False,
        )
        return True
    except Exception:
        return False


def _shell_quote(value: str) -> str:
    return shlex.quote(value)


def _parse_dotenv(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            out[key] = val
    return out


def _build_remote_backup_script(cfg: dict[str, Any]) -> str:
    compose_dir = cfg["compose_dir"]
    pg_service = cfg["pg_service"]
    compose_cmd = cfg["compose_cmd"] or "docker compose"
    q_dir = _shell_quote(compose_dir)
    q_svc = _shell_quote(pg_service)
    excludes = " ".join(f"--exclude={_shell_quote(x)}" for x in _COMPOSE_TAR_EXCLUDES)
    q_compose = _shell_quote(compose_cmd)
    return f"""set -euo pipefail
COMPOSE_DIR={q_dir}
PG_SERVICE={q_svc}
COMPOSE_CMD={q_compose}
if ! command -v docker >/dev/null 2>&1; then
  echo "DOCKER_MISSING" >&2
  exit 2
fi
if [ ! -d "$COMPOSE_DIR" ]; then
  echo "COMPOSE_DIR_MISSING:$COMPOSE_DIR" >&2
  exit 3
fi
cd "$COMPOSE_DIR"
if ! $COMPOSE_CMD version >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
fi
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
PG_USER="${{POSTGRES_USER:-postgres}}"
PG_DB="${{POSTGRES_DB:-remnawave}}"
echo "RW_BACKUP_SQL_BEGIN"
$COMPOSE_CMD exec -T "$PG_SERVICE" pg_dump -U "$PG_USER" "$PG_DB" --no-owner --no-privileges
echo "RW_BACKUP_SQL_END"
echo "RW_BACKUP_TAR_BEGIN"
tar -czf - -C "$COMPOSE_DIR" {excludes} . 2>/dev/null || tar -czf - -C "$COMPOSE_DIR" .
echo "RW_BACKUP_TAR_END"
"""


def _split_remote_backup_output(raw: bytes) -> tuple[bytes, bytes]:
    text = raw
    sql_begin = b"RW_BACKUP_SQL_BEGIN\n"
    sql_end = b"\nRW_BACKUP_SQL_END\n"
    tar_begin = b"RW_BACKUP_TAR_BEGIN\n"
    i0 = text.find(sql_begin)
    i1 = text.find(sql_end)
    i2 = text.find(tar_begin)
    if i0 < 0 or i1 < 0 or i2 < 0:
        raise RuntimeError("Неверный формат ответа скрипта бэкапа Remnawave")
    sql = text[i0 + len(sql_begin) : i1]
    tar = text[i2 + len(tar_begin) :]
    if tar.endswith(b"\nRW_BACKUP_TAR_END"):
        tar = tar[: -len(b"\nRW_BACKUP_TAR_END")]
    elif tar.endswith(b"RW_BACKUP_TAR_END"):
        tar = tar[: -len(b"RW_BACKUP_TAR_END")]
    if not sql.strip():
        raise RuntimeError("Дамп PostgreSQL Remnawave пуст")
    return sql, tar


def _run_via_ssh(cfg: dict[str, Any]) -> tuple[bytes, bytes, dict[str, Any]]:
    target_name = cfg["ssh_target"]
    if not target_name:
        raise RuntimeError("Не указана SSH-цель для бэкапа Remnawave")
    target = rw_repo.get_ssh_target(target_name)
    if not target:
        raise RuntimeError(f"SSH-цель «{target_name}» не найдена")
    host_row = speedtest_runner._target_to_host_row(target)
    script = _build_remote_backup_script(cfg)
    ssh = speedtest_runner._ssh_connect(host_row)
    try:
        stdin, stdout, stderr = ssh.exec_command("bash -s", timeout=900)
        stdin.write(script)
        stdin.channel.shutdown_write()
        out = stdout.read()
        err = stderr.read().decode("utf-8", errors="ignore")
        rc = stdout.channel.recv_exit_status()
        if rc != 0:
            msg = err.strip() or f"SSH скрипт завершился с кодом {rc}"
            if "COMPOSE_DIR_MISSING" in msg:
                raise RuntimeError(
                    f"Каталог Remnawave не найден на сервере: {cfg['compose_dir']}"
                )
            if "DOCKER_MISSING" in msg:
                raise RuntimeError("На удалённом сервере не установлен Docker")
            raise RuntimeError(msg)
        sql, tar = _split_remote_backup_output(out)
        meta = {
            "mode": "ssh",
            "ssh_target": target_name,
            "compose_dir": cfg["compose_dir"],
            "pg_service": cfg["pg_service"],
        }
        return sql, tar, meta
    finally:
        try:
            ssh.close()
        except Exception:
            pass


def _detect_compose_cmd() -> str:
    custom = get_remnawave_backup_settings().get("compose_cmd") or ""
    if custom:
        return custom
    if shutil.which("docker"):
        try:
            subprocess.run(
                ["docker", "compose", "version"],
                capture_output=True,
                timeout=10,
                check=True,
            )
            return "docker compose"
        except Exception:
            pass
    if shutil.which("docker-compose"):
        return "docker-compose"
    return "docker compose"


def _run_pg_dump_url(database_url: str) -> bytes:
    if not shutil.which("pg_dump"):
        raise RuntimeError("pg_dump не найден в контейнере shopbot")
    with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
        dump_path = tmp.name
    try:
        subprocess.run(
            [
                "pg_dump",
                database_url,
                "--no-owner",
                "--no-privileges",
                "-f",
                dump_path,
            ],
            check=True,
            capture_output=True,
            timeout=900,
        )
        return Path(dump_path).read_bytes()
    finally:
        Path(dump_path).unlink(missing_ok=True)


def _tar_local_compose_dir(compose_dir: Path) -> bytes:
    if not compose_dir.is_dir():
        raise RuntimeError(f"Каталог Remnawave не найден: {compose_dir}")
    buf = BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for path in compose_dir.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(compose_dir)
            if any(part in _COMPOSE_TAR_EXCLUDES for part in rel.parts):
                continue
            tar.add(path, arcname=rel.as_posix())
    return buf.getvalue()


def _run_local_compose(cfg: dict[str, Any]) -> tuple[bytes, bytes, dict[str, Any]]:
    compose_dir = Path(cfg["compose_dir"])
    if not compose_dir.is_dir():
        raise RuntimeError(f"Каталог Remnawave не найден: {compose_dir}")

    env_vars: dict[str, str] = {}
    env_file = compose_dir / ".env"
    if env_file.is_file():
        env_vars = _parse_dotenv(env_file.read_text(encoding="utf-8", errors="ignore"))

    pg_user = env_vars.get("POSTGRES_USER", "postgres")
    pg_db = env_vars.get("POSTGRES_DB", "remnawave")
    pg_service = cfg["pg_service"]
    compose_cmd = _detect_compose_cmd().split()

    if not _local_docker_available():
        raise RuntimeError(
            "Docker недоступен из контейнера shopbot. "
            "Укажите режим SSH, REMNAWAVE_BACKUP_DATABASE_URL или смонтируйте /var/run/docker.sock"
        )

    cmd = [
        *compose_cmd,
        "exec",
        "-T",
        pg_service,
        "pg_dump",
        "-U",
        pg_user,
        pg_db,
        "--no-owner",
        "--no-privileges",
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(compose_dir),
        capture_output=True,
        timeout=900,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(err or f"pg_dump в Docker завершился с кодом {proc.returncode}")
    sql = proc.stdout
    tar = _tar_local_compose_dir(compose_dir)
    return sql, tar, {
        "mode": "local",
        "compose_dir": str(compose_dir),
        "pg_service": pg_service,
    }


def create_remnawave_backup_payload() -> tuple[bytes, bytes, dict[str, Any]]:
    """Вернуть (sql_bytes, compose_tar_gz, meta)."""
    cfg = get_remnawave_backup_settings()
    db_url = _resolve_database_url(cfg)

    if db_url:
        sql = _run_pg_dump_url(db_url)
        tar = b""
        meta: dict[str, Any] = {"mode": "database_url", "database_url": True}
        compose_path = Path(cfg["compose_dir"])
        if compose_path.is_dir():
            tar = _tar_local_compose_dir(compose_path)
            meta.update({"mode": "local", "compose_dir": str(compose_path)})
        elif cfg["mode"] == "ssh" and cfg["ssh_target"]:
            _, tar, ssh_meta = _run_via_ssh({**cfg, "database_url": ""})
            meta.update(ssh_meta)
        return sql, tar, meta

    if cfg["mode"] == "ssh":
        return _run_via_ssh(cfg)

    if _local_docker_available() and Path(cfg["compose_dir"]).is_dir():
        return _run_local_compose(cfg)

    if cfg["ssh_target"]:
        return _run_via_ssh(cfg)

    raise RuntimeError(
        "Бэкап Remnawave не настроен: смонтируйте /opt/remnawave в shopbot, "
        "укажите REMNAWAVE_BACKUP_DATABASE_URL или SSH-цель"
    )


def restore_remnawave_from_archive(
    zip_path: Path,
    *,
    restore_database: bool = True,
    restore_compose: bool = True,
) -> dict[str, Any]:
    """Восстановить Remnawave из архива (осторожно: перезаписывает compose и БД)."""
    import zipfile

    cfg = get_remnawave_backup_settings()
    db_url = _resolve_database_url(cfg)
    result: dict[str, Any] = {
        "database_restored": False,
        "compose_restored": False,
        "errors": [],
    }

    sql_name = None
    tar_name = None
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if name.startswith(f"{REMNAWAVE_ARCHIVE_PREFIX}pg-backup-") and name.endswith(".sql"):
                sql_name = name
            if name.startswith(f"{REMNAWAVE_ARCHIVE_PREFIX}compose/") and name.endswith(".tar.gz"):
                tar_name = name
            if name == f"{REMNAWAVE_ARCHIVE_PREFIX}compose-bundle.tar.gz":
                tar_name = name

    if restore_database and not sql_name:
        result["errors"].append("В архиве нет дампа БД Remnawave")
        return result
    if restore_compose and not tar_name:
        result["errors"].append("В архиве нет файлов compose Remnawave")
        return result

    def _restore_on_host(run: Callable[[str], tuple[int, str, str]]) -> None:
        compose_dir = _shell_quote(cfg["compose_dir"])
        compose_cmd = _shell_quote(_detect_compose_cmd())
        pg_service = _shell_quote(cfg["pg_service"])

        if restore_compose and tar_name:
            with zipfile.ZipFile(zip_path, "r") as zf:
                tar_bytes = zf.read(tar_name)
            tmp_tar = f"/tmp/rw-restore-{_safe_ts()}.tar.gz"
            run(f"mkdir -p {compose_dir}")
            # загрузка через base64
            import base64

            b64 = base64.b64encode(tar_bytes).decode("ascii")
            chunk = 60000
            run(f"rm -f {tmp_tar}")
            for i in range(0, len(b64), chunk):
                part = b64[i : i + chunk]
                op = ">>" if i else ">"
                run(f"printf '%s' {_shell_quote(part)} {op} {tmp_tar}.b64")
            run(
                f"base64 -d {tmp_tar}.b64 > {tmp_tar} && rm -f {tmp_tar}.b64 && "
                f"tar -xzf {tmp_tar} -C {compose_dir} && rm -f {tmp_tar}"
            )
            result["compose_restored"] = True

        if restore_database and sql_name:
            with zipfile.ZipFile(zip_path, "r") as zf:
                sql_text = zf.read(sql_name).decode("utf-8", errors="replace")
            import base64

            b64 = base64.b64encode(sql_text.encode("utf-8")).decode("ascii")
            tmp_sql = f"/tmp/rw-restore-{_safe_ts()}.sql"
            run(f"rm -f {tmp_sql}")
            chunk = 60000
            for i in range(0, len(b64), chunk):
                part = b64[i : i + chunk]
                op = ">>" if i else ">"
                run(f"printf '%s' {_shell_quote(part)} {op} {tmp_sql}.b64")
            run(
                f"cd {compose_dir} && base64 -d {tmp_sql}.b64 > {tmp_sql} && rm -f {tmp_sql}.b64 && "
                f"set -a && [ -f .env ] && . ./.env && set +a && "
                f"PG_USER=${{POSTGRES_USER:-postgres}} && PG_DB=${{POSTGRES_DB:-remnawave}} && "
                f"{compose_cmd} exec -T {pg_service} psql -U \"$PG_USER\" -d \"$PG_DB\" -v ON_ERROR_STOP=1 -f {tmp_sql} && "
                f"rm -f {tmp_sql}"
            )
            result["database_restored"] = True

    if cfg["mode"] == "ssh" or (cfg["ssh_target"] and not _local_docker_available()):
        target = rw_repo.get_ssh_target(cfg["ssh_target"])
        if not target:
            result["errors"].append("SSH-цель не найдена")
            return result
        host_row = speedtest_runner._target_to_host_row(target)
        ssh = speedtest_runner._ssh_connect(host_row)

        def run(cmd: str) -> tuple[int, str, str]:
            return speedtest_runner._ssh_exec(ssh, cmd, timeout=900)

        try:
            _restore_on_host(run)
        except Exception as e:
            result["errors"].append(str(e))
        finally:
            ssh.close()
        result["ok"] = not result["errors"]
        return result

    # local docker
    compose_dir = Path(cfg["compose_dir"])
    if restore_compose and tar_name:
        with zipfile.ZipFile(zip_path, "r") as zf:
            tar_bytes = zf.read(tar_name)
        compose_dir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(fileobj=BytesIO(tar_bytes), mode="r:gz") as tar:
            tar.extractall(compose_dir)
        result["compose_restored"] = True

    if restore_database and sql_name:
        with zipfile.ZipFile(zip_path, "r") as zf:
            sql_bytes = zf.read(sql_name)
        if db_url:
            subprocess.run(
                ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", "-"],
                input=sql_bytes,
                check=True,
                capture_output=True,
                timeout=900,
            )
        else:
            env_file = compose_dir / ".env"
            env_vars = _parse_dotenv(
                env_file.read_text(encoding="utf-8", errors="ignore")
            ) if env_file.is_file() else {}
            pg_user = env_vars.get("POSTGRES_USER", "postgres")
            pg_db = env_vars.get("POSTGRES_DB", "remnawave")
            compose_cmd = _detect_compose_cmd().split()
            proc = subprocess.run(
                [*compose_cmd, "exec", "-T", cfg["pg_service"], "psql", "-U", pg_user, "-d", pg_db],
                cwd=str(compose_dir),
                input=sql_bytes,
                capture_output=True,
                timeout=900,
            )
            if proc.returncode != 0:
                err = proc.stderr.decode("utf-8", errors="ignore")
                result["errors"].append(err or "psql restore failed")
                result["ok"] = False
                return result
        result["database_restored"] = True

    result["ok"] = not result["errors"]
    return result


def _safe_ts() -> str:
    return re.sub(r"[^0-9]", "", str(os.getpid()))


def add_remnawave_to_zip(zf: Any, ts: str) -> dict[str, Any]:
    """Добавить в открытый ZipFile содержимое бэкапа Remnawave."""
    sql, tar, meta = create_remnawave_backup_payload()
    sql_arc = f"{REMNAWAVE_ARCHIVE_PREFIX}pg-backup-{ts}.sql"
    zf.writestr(sql_arc, sql)
    stats: dict[str, Any] = {
        "sql_file": sql_arc,
        "sql_size_bytes": len(sql),
        "compose_archive": None,
        "compose_size_bytes": 0,
        **meta,
    }
    if tar:
        tar_arc = f"{REMNAWAVE_ARCHIVE_PREFIX}compose-bundle.tar.gz"
        zf.writestr(tar_arc, tar)
        stats["compose_archive"] = tar_arc
        stats["compose_size_bytes"] = len(tar)
    return stats
