import json
import logging
import os
import secrets
import shutil
import subprocess
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterator

from aiogram import Bot
from aiogram.types import FSInputFile

from shop_bot.data_manager import backup_crypto
from shop_bot.data_manager.db.dialect import DATABASE_URL, is_postgresql
from . import remnawave_repository as rw_repo

logger = logging.getLogger(__name__)

BACKUPS_DIR = Path(os.getenv("SHOPBOT_BACKUPS_DIR", "/app/project/backups"))
BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

BACKUP_MANIFEST_NAME = "backup-manifest.json"
FILES_ARCHIVE_PREFIX = "files/"
BACKUP_ARCHIVE_PREFIX = "db-backup-"  # совместимость
MANAGED_BACKUP_PREFIXES = ("db-backup-", "files-backup-", "full-backup-", "remnawave-backup-")

SOURCE_LABELS = {
    "manual": "Вручную",
    "auto": "Автобэкап",
    "pre_restore": "Перед восстановлением",
    "telegram": "Telegram",
    "upload": "Загрузка",
}

SCOPE_LABELS = {
    "database": "База данных",
    "files": "Полный проект",
    "full": "БД + проект",
    "remnawave": "Remnawave Panel",
}

DEFAULT_BACKUP_CONFIG = {
    "interval_days": 1,
    "keep_count": 7,
    "autobackup_telegram": True,
    "compress_level": 9,
    "autobackup_scope": "database",
    "include_env": False,
    "encrypt_enabled": True,
    "password_mode": "random",
}


@dataclass
class BackupCreateResult:
    path: Path | None
    password: str | None = None

# Исключения при обходе файлов (сегменты пути относительно корня проекта)
_FILE_SKIP_DIR_NAMES = {
    "__pycache__", ".git", ".venv", "node_modules", "backups", ".cursor",
}
_FILE_SKIP_SUFFIXES = (".pyc", ".pyo")
# Имена файлов в корне, которые не архивируем
_FILE_SKIP_ROOT_NAMES = {".DS_Store"}


def get_msk_time() -> datetime:
    return datetime.now(timezone(timedelta(hours=3)))


def _timestamp() -> str:
    return get_msk_time().strftime("%Y%m%d-%H%M%S")


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def project_root() -> Path:
    custom = os.environ.get("SHOPBOT_PROJECT_DIR", "").strip()
    if custom:
        return Path(custom).resolve()
    return Path("/app/project").resolve()


def normalize_scope(scope: str | None) -> str:
    s = (scope or "database").strip().lower()
    if s in SCOPE_LABELS:
        return s
    return "database"


def scope_to_prefix(scope: str) -> str:
    return {
        "database": "db-backup-",
        "files": "files-backup-",
        "full": "full-backup-",
        "remnawave": "remnawave-backup-",
    }.get(scope, "db-backup-")


def _infer_scope_from_name(name: str) -> str:
    lower = name.lower()
    if lower.startswith("remnawave-backup-"):
        return "remnawave"
    if lower.startswith("full-backup-"):
        return "full"
    if lower.startswith("files-backup-"):
        return "files"
    return "database"


def get_backup_config() -> dict[str, Any]:
    """Настройки резервного копирования из БД."""
    cfg = dict(DEFAULT_BACKUP_CONFIG)
    try:
        raw_days = rw_repo.get_setting("backup_interval_days") or "1"
        cfg["interval_days"] = max(0, int(str(raw_days).strip() or "1"))
    except (TypeError, ValueError):
        cfg["interval_days"] = 1
    try:
        raw_keep = rw_repo.get_setting("backup_keep_count") or "7"
        cfg["keep_count"] = max(1, min(100, int(str(raw_keep).strip() or "7")))
    except (TypeError, ValueError):
        cfg["keep_count"] = 7
    cfg["autobackup_telegram"] = _parse_bool(
        rw_repo.get_setting("backup_autobackup_telegram"), default=True
    )
    cfg["include_env"] = _parse_bool(rw_repo.get_setting("backup_include_env"), default=False)
    cfg["encrypt_enabled"] = _parse_bool(rw_repo.get_setting("backup_encrypt_enabled"), default=True)
    cfg["password_mode"] = (rw_repo.get_setting("backup_password_mode") or "random").strip().lower()
    if cfg["password_mode"] not in ("random", "master"):
        cfg["password_mode"] = "random"
    cfg["telegram_chat_id"] = (rw_repo.get_setting("backup_telegram_chat_id") or "").strip()
    cfg["telegram_topic_id"] = (rw_repo.get_setting("backup_telegram_topic_id") or "").strip()
    cfg["secrets_chat_id"] = (rw_repo.get_setting("backup_secrets_chat_id") or "").strip()
    cfg["secrets_topic_id"] = (rw_repo.get_setting("backup_secrets_topic_id") or "").strip()
    cfg["autobackup_scope"] = normalize_scope(rw_repo.get_setting("backup_autobackup_scope"))
    try:
        level = int(str(rw_repo.get_setting("backup_compress_level") or "6").strip())
        cfg["compress_level"] = max(0, min(9, level))
    except (TypeError, ValueError):
        cfg["compress_level"] = 6
    cfg["autobackup_enabled"] = cfg["interval_days"] > 0
    cfg["scope_label"] = SCOPE_LABELS.get(cfg["autobackup_scope"], cfg["autobackup_scope"])
    try:
        from shop_bot.data_manager import remnawave_backup as rw_bak
        cfg["remnawave"] = rw_bak.get_remnawave_backup_settings()
        cfg["remnawave_configured"] = rw_bak.is_remnawave_backup_configured()
        cfg["remnawave_compose_accessible"] = rw_bak._compose_dir_accessible(cfg.get("remnawave") or {})
    except Exception:
        cfg["remnawave"] = {}
        cfg["remnawave_configured"] = False
        cfg["remnawave_compose_accessible"] = False
    cfg.update(assess_backup_delivery(cfg))
    return cfg


def _parse_telegram_chat_id(raw: str) -> int | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def _parse_telegram_topic_id(raw: str) -> int | None:
    s = (raw or "").strip()
    if s.isdigit():
        return int(s)
    return None


def assess_backup_delivery(cfg: dict[str, Any]) -> dict[str, Any]:
    """Проверка каналов Telegram для доставки бэкапов (передавать cfg до merge assess)."""
    from shop_bot.data_manager import telegram_notify
    return telegram_notify.assess_backup_delivery(cfg)


def format_size(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} МБ"
    if size >= 1024:
        return f"{size / 1024:.1f} КБ"
    return f"{size} Б"


def _infer_source_from_name(name: str) -> str:
    lower = name.lower()
    if lower.startswith("before-restore-"):
        return "pre_restore"
    if lower.startswith("uploaded-"):
        return "upload"
    return "manual"


def read_backup_manifest(path: Path) -> dict[str, Any] | None:
    sidecar = backup_crypto.read_manifest_from_sidecar(path)
    if sidecar:
        return sidecar
    try:
        if path.suffix.lower() != ".zip":
            return None
        with zipfile.ZipFile(path, "r") as zf:
            if BACKUP_MANIFEST_NAME not in zf.namelist():
                return None
            raw = zf.read(BACKUP_MANIFEST_NAME).decode("utf-8")
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
    except Exception as e:
        logger.debug("Бэкап: не удалось прочитать manifest %s: %s", path.name, e)
        return None


def _resolve_backup_password(cfg: dict[str, Any]) -> str | None:
    if not cfg.get("encrypt_enabled"):
        return None
    if cfg.get("password_mode") == "master":
        return _load_master_backup_password()
    return backup_crypto.generate_backup_password()


def _load_master_backup_password() -> str | None:
    from shop_bot.data_manager import secrets_vault
    raw = rw_repo.get_setting("backup_master_password") or ""
    master = secrets_vault.decrypt_secret(raw) if raw else ""
    return master or None


def _resolve_restore_password(explicit: str | None) -> str | None:
    """Пароль для restore: из формы или мастер-пароль (если режим master)."""
    pwd = (explicit or "").strip() or None
    if pwd:
        return pwd
    cfg = get_backup_config()
    if cfg.get("encrypt_enabled") and cfg.get("password_mode") == "master":
        return _load_master_backup_password()
    return None


def _format_subprocess_error(proc: subprocess.CompletedProcess[str] | subprocess.CalledProcessError) -> str:
    detail = (proc.stderr or proc.stdout or "").strip()
    if detail:
        lines = [ln.strip() for ln in detail.splitlines() if ln.strip()]
        if lines:
            return lines[-1][:500]
    return f"код выхода {proc.returncode}"


def _reset_public_schema_for_restore() -> None:
    """Очистить public перед replay дампа (иначе CREATE TABLE падает на существующих объектах)."""
    if not is_postgresql():
        return
    sql = """
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
    GRANT ALL ON SCHEMA public TO public;
    """
    from shop_bot.data_manager.db_admin import _shopbot_autocommit_sql
    _shopbot_autocommit_sql(sql)


def _data_dir_path() -> Path | None:
    try:
        from shop_bot.data_manager import secrets_vault
        return secrets_vault._data_dir().resolve()
    except Exception:
        root = project_root()
        fallback = root / "data"
        return fallback.resolve() if fallback.is_dir() else None


def _project_has_backup_files(include_env: bool) -> bool:
    if not project_root().is_dir():
        return False
    for _ in _iter_files_for_backup(include_env):
        return True
    return False


def _should_skip_path(rel_parts: tuple[str, ...]) -> bool:
    for part in rel_parts:
        if part in _FILE_SKIP_DIR_NAMES:
            return True
    if rel_parts and rel_parts[-1].endswith(_FILE_SKIP_SUFFIXES):
        return True
    if rel_parts and rel_parts[-1] in _FILE_SKIP_ROOT_NAMES:
        return True
    return False


def _iter_external_data_files(include_env: bool) -> Iterator[tuple[Path, str]]:
    """data/ вне корня проекта (SHOPBOT_DATA_DIR)."""
    data_dir = _data_dir_path()
    if not data_dir or not data_dir.is_dir():
        return
    root = project_root()
    try:
        data_dir.relative_to(root)
        return
    except ValueError:
        pass
    for path in data_dir.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(data_dir)
        except ValueError:
            continue
        if _should_skip_path(rel.parts):
            continue
        yield path, f"{FILES_ARCHIVE_PREFIX}data/{rel.as_posix()}"


def _iter_files_for_backup(include_env: bool) -> Iterator[tuple[Path, str]]:
    """Весь каталог проекта (кроме backups/ и служебного мусора)."""
    root = project_root()
    if not root.is_dir():
        return
    yield from _iter_external_data_files(include_env)
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if rel.name == ".env" and not include_env:
            continue
        if _should_skip_path(rel.parts):
            continue
        yield path, f"{FILES_ARCHIVE_PREFIX}{rel.as_posix()}"


def _add_project_files_to_zip(zf: zipfile.ZipFile, include_env: bool) -> dict[str, Any]:
    file_count = 0
    total_bytes = 0
    roots_used: list[str] = []
    root = project_root()
    if root.is_dir():
        roots_used.append(str(root.name) or "project")
    data_dir = _data_dir_path()
    if data_dir and data_dir.is_dir():
        try:
            data_dir.relative_to(root)
        except ValueError:
            if "data (external)" not in roots_used:
                roots_used.append("data (external)")
    for path, arcname in _iter_files_for_backup(include_env):
        try:
            zf.write(path, arcname=arcname)
            file_count += 1
            total_bytes += path.stat().st_size
        except OSError as e:
            logger.warning("Бэкап: пропуск файла %s: %s", path, e)
    return {
        "file_count": file_count,
        "total_bytes": total_bytes,
        "roots": roots_used,
    }


def _build_manifest(
    source: str,
    note: str,
    scope: str,
    *,
    dump_name: str | None = None,
    dump_size: int = 0,
    files_stats: dict[str, Any] | None = None,
    remnawave_stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    includes_db = scope in ("database", "full")
    includes_files = scope in ("files", "full")
    includes_remnawave = scope == "remnawave"
    return {
        "version": 2,
        "created_at": get_msk_time().isoformat(),
        "source": source,
        "source_label": SOURCE_LABELS.get(source, source),
        "scope": scope,
        "scope_label": SCOPE_LABELS.get(scope, scope),
        "note": (note or "").strip()[:500],
        "includes_database": includes_db,
        "includes_files": includes_files,
        "includes_remnawave": includes_remnawave,
        "dump_file": dump_name,
        "dump_size_bytes": dump_size,
        "files": files_stats or {},
        "remnawave": remnawave_stats or {},
        "database": "postgresql" if includes_db else None,
        "project_root": str(project_root()),
    }


def _run_pg_dump(dump_path: Path) -> int:
    result = subprocess.run(
        [
            "pg_dump",
            DATABASE_URL,
            "--no-owner",
            "--no-privileges",
            "--clean",
            "--if-exists",
            "-f",
            str(dump_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        logger.error("pg_dump failed: %s", detail or f"exit code {result.returncode}")
        raise subprocess.CalledProcessError(result.returncode, result.args, result.stdout, result.stderr)
    return dump_path.stat().st_size if dump_path.exists() else 0


def create_backup_file(
    source: str = "manual",
    note: str = "",
    scope: str | None = None,
) -> BackupCreateResult:
    """Создать архив: database | files | full | remnawave."""
    source = (source or "manual").strip()[:32] or "manual"
    cfg = get_backup_config()
    if scope is None and source == "auto":
        scope = cfg.get("autobackup_scope", "database")
    scope = normalize_scope(scope)

    if scope in ("database", "full") and not is_postgresql():
        logger.error("Бэкап: PostgreSQL не настроен (SHOPBOT_DATABASE_URL)")
        return BackupCreateResult(None)
    if scope == "files" and not _project_has_backup_files(cfg.get("include_env", False)):
        logger.error("Бэкап: каталог проекта пуст или недоступен (%s)", project_root())
        return BackupCreateResult(None)
    if scope == "remnawave":
        from shop_bot.data_manager import remnawave_backup as rw_bak
        if not rw_bak.is_remnawave_backup_configured():
            logger.error("Бэкап Remnawave: не настроен каталог compose, SSH или DATABASE_URL")
            return BackupCreateResult(None)

    password = _resolve_backup_password(cfg)
    encrypted = bool(password)

    try:
        ts = _timestamp()
        zip_path = BACKUPS_DIR / f"{scope_to_prefix(scope)}{ts}.zip"
        dump_name: str | None = None
        dump_size = 0
        files_stats: dict[str, Any] = {}
        remnawave_stats: dict[str, Any] = {}

        with backup_crypto.BackupZipWriter(
            zip_path,
            password=password,
            compress_level=cfg["compress_level"],
        ) as zf:
            if scope in ("database", "full"):
                dump_name = f"pg-backup-{ts}.sql"
                dump_path = BACKUPS_DIR / dump_name
                dump_size = _run_pg_dump(dump_path)
                zf.write(dump_path, arcname=dump_name)
                dump_path.unlink(missing_ok=True)

            if scope in ("files", "full"):
                files_stats = _add_project_files_to_zip(zf, cfg.get("include_env", False))

            if scope == "remnawave":
                from shop_bot.data_manager import remnawave_backup as rw_bak
                remnawave_stats = rw_bak.add_remnawave_to_zip(zf, ts)

            manifest = _build_manifest(
                source, note, scope,
                dump_name=dump_name,
                dump_size=dump_size,
                files_stats=files_stats,
                remnawave_stats=remnawave_stats,
            )
            manifest["encrypted"] = encrypted
            if encrypted:
                manifest["encryption_method"] = backup_crypto.ENCRYPTION_AES
            zf.writestr(
                BACKUP_MANIFEST_NAME,
                json.dumps(manifest, ensure_ascii=False, indent=2),
            )

        backup_crypto.write_sidecar(zip_path, manifest, encrypted=encrypted)
        logger.info(
            "Бэкап: создан %s (source=%s, scope=%s, encrypted=%s)",
            zip_path.name, source, scope, encrypted,
        )
        return BackupCreateResult(zip_path, password if encrypted else None)
    except Exception as e:
        logger.error("Бэкап: не удалось создать архив: %s", e, exc_info=True)
        return BackupCreateResult(None)


def _enrich_backup_row(path: Path, stat: os.stat_result) -> dict[str, Any]:
    manifest = read_backup_manifest(path)
    source = (manifest or {}).get("source") or _infer_source_from_name(path.name)
    scope = (manifest or {}).get("scope") or _infer_scope_from_name(path.name)
    modified = datetime.fromtimestamp(
        stat.st_mtime, tz=timezone(timedelta(hours=3))
    ).strftime("%d.%m.%Y %H:%M")
    size = stat.st_size
    files_info = (manifest or {}).get("files") or {}
    return {
        "name": path.name,
        "size": size,
        "size_human": format_size(size),
        "mtime": stat.st_mtime,
        "modified": modified,
        "source": source,
        "source_label": (manifest or {}).get("source_label") or SOURCE_LABELS.get(source, source),
        "scope": scope,
        "scope_label": (manifest or {}).get("scope_label") or SCOPE_LABELS.get(scope, scope),
        "includes_database": bool(
            (manifest or {}).get("includes_database", scope not in ("files", "remnawave"))
        ),
        "includes_files": bool(
            (manifest or {}).get("includes_files", scope not in ("database", "remnawave"))
        ),
        "includes_remnawave": bool((manifest or {}).get("includes_remnawave", scope == "remnawave")),
        "encrypted": bool((manifest or {}).get("encrypted") or backup_crypto.is_encrypted_backup(path)),
        "files_count": int(files_info.get("file_count") or 0),
        "remnawave_info": (manifest or {}).get("remnawave") or {},
        "note": (manifest or {}).get("note") or "",
        "created_at": (manifest or {}).get("created_at") or "",
        "has_manifest": manifest is not None,
    }


def _iter_managed_backup_paths() -> list[Path]:
    paths: list[Path] = []
    for prefix in MANAGED_BACKUP_PREFIXES:
        paths.extend(BACKUPS_DIR.glob(f"{prefix}*.zip"))
    return paths


def list_backup_files() -> list[dict]:
    """Return backup archives sorted newest first."""
    items: list[dict] = []
    try:
        paths = sorted(_iter_managed_backup_paths(), key=lambda p: p.stat().st_mtime, reverse=True)
        for path in paths:
            try:
                items.append(_enrich_backup_row(path, path.stat()))
            except OSError:
                continue
        for pattern in ("before-restore-*.zip", "uploaded-*.zip"):
            for path in sorted(
                BACKUPS_DIR.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True
            ):
                try:
                    items.append(_enrich_backup_row(path, path.stat()))
                except OSError:
                    continue
        items.sort(key=lambda x: x.get("mtime") or 0, reverse=True)
    except Exception as e:
        logger.warning("Бэкап: не удалось получить список архивов: %s", e)
    return items


def _zip_listing_info(path: Path) -> tuple[list[str], bool, bool, bool]:
    sql_names: list[str] = []
    has_files = False
    has_remnawave = False
    with zipfile.ZipFile(path, "r") as zf:
        for name in zf.namelist():
            if name.lower().endswith(".sql"):
                sql_names.append(name)
            if name.startswith(FILES_ARCHIVE_PREFIX) and not name.endswith("/"):
                has_files = True
            if name.startswith("remnawave/"):
                has_remnawave = True
    return sql_names, has_files, bool(sql_names), has_remnawave


def get_backup_detail(name: str) -> dict[str, Any] | None:
    path = resolve_backup_path(name)
    if not path:
        return None
    try:
        stat = path.stat()
        row = _enrich_backup_row(path, stat)
        manifest = read_backup_manifest(path) or {}
        sql_names, has_files, _, has_rw = _zip_listing_info(path)
        row["sql_files"] = sql_names
        row["has_files"] = has_files
        row["has_remnawave"] = has_rw
        row["manifest"] = manifest
        row["valid"] = validate_backup_file(path)
        row["file_roots"] = (manifest.get("files") or {}).get("roots") or []
        return row
    except Exception as e:
        logger.warning("Бэкап: detail %s: %s", name, e)
        return None


def _resolve_any_backup(name: str) -> Path | None:
    safe = Path(name).name
    if ".." in safe or "/" in safe or "\\" in safe:
        return None
    path = (BACKUPS_DIR / safe).resolve()
    if not str(path).startswith(str(BACKUPS_DIR.resolve())) or not path.is_file():
        return None
    if not safe.endswith(".zip"):
        return None
    return path


def delete_backup_file(name: str) -> bool:
    path = _resolve_any_backup(name)
    if not path:
        return False
    try:
        path.unlink()
        sidecar = backup_crypto.sidecar_path(path)
        if sidecar.is_file():
            sidecar.unlink()
        return True
    except Exception as e:
        logger.warning("Бэкап: не удалось удалить %s: %s", name, e)
        return False


def duplicate_backup_file(name: str) -> Path | None:
    path = _resolve_any_backup(name)
    if not path:
        return None
    try:
        scope = _infer_scope_from_name(path.name)
        ts = _timestamp()
        dest = BACKUPS_DIR / f"{scope_to_prefix(scope)}{ts}-copy.zip"
        shutil.copy2(path, dest)
        return dest
    except Exception as e:
        logger.error("Бэкап: duplicate %s: %s", name, e)
        return None


def resolve_backup_path(name: str) -> Path | None:
    return _resolve_any_backup(name)


def backups_summary(items: list[dict] | None = None) -> dict:
    rows = items if items is not None else list_backup_files()
    total_bytes = sum(int(r.get("size") or 0) for r in rows)
    latest = rows[0] if rows else None
    cfg = get_backup_config()
    by_scope: dict[str, int] = {}
    by_source: dict[str, int] = {}
    encrypted_count = 0
    for row in rows:
        scope = row.get("scope") or "database"
        source = row.get("source") or "manual"
        by_scope[scope] = by_scope.get(scope, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1
        if row.get("encrypted"):
            encrypted_count += 1
    return {
        "count": len(rows),
        "total_bytes": total_bytes,
        "total_human": format_size(total_bytes),
        "latest_name": latest.get("name") if latest else None,
        "latest_modified": latest.get("modified") if latest else None,
        "latest_mtime": latest.get("mtime") if latest else None,
        "by_scope": by_scope,
        "by_source": by_source,
        "encrypted_count": encrypted_count,
        "config": cfg,
    }


def cleanup_old_backups(keep: int | None = None) -> dict[str, int]:
    if keep is None:
        keep = get_backup_config()["keep_count"]
    keep = max(1, min(100, int(keep)))
    removed = 0
    try:
        files = sorted(_iter_managed_backup_paths(), key=lambda p: p.stat().st_mtime, reverse=True)
        for f in files[keep:]:
            try:
                f.unlink(missing_ok=True)
                sidecar = backup_crypto.sidecar_path(f)
                if sidecar.is_file():
                    sidecar.unlink(missing_ok=True)
                removed += 1
            except Exception:
                pass
    except Exception as e:
        logger.warning("Бэкап: не удалось очистить старые архивы: %s", e)
    kept = len(_iter_managed_backup_paths())
    return {"removed": removed, "kept": kept, "keep_limit": keep}


def _validate_zip_entries(zf: zipfile.ZipFile, dest: Path) -> bool:
    dest_str = str(dest.resolve())
    for name in zf.namelist():
        if ".." in Path(name).parts:
            return False
        target = (dest / name).resolve()
        if not str(target).startswith(dest_str + os.sep) and target != dest.resolve():
            if not name.endswith("/"):
                return False
    return True


def validate_backup_file(path: Path) -> bool:
    try:
        if backup_crypto.read_sidecar(path):
            return path.suffix.lower() == ".zip" and path.is_file() and path.stat().st_size > 0
        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path, "r") as zf:
                if not _validate_zip_entries(zf, path.parent.resolve()):
                    return False
                names = zf.namelist()
                has_sql = any(n.lower().endswith(".sql") for n in names)
                has_files = any(
                    n.startswith(FILES_ARCHIVE_PREFIX) and not n.endswith("/") for n in names
                )
                has_rw = any(n.startswith("remnawave/") for n in names)
                return has_sql or has_files or has_rw
        return path.suffix.lower() == ".sql" and path.exists() and path.stat().st_size > 0
    except Exception as e:
        logger.error("Бэкап: ошибка валидации файла: %s", e)
        return False


def archive_capabilities(path: Path) -> dict[str, bool]:
    manifest = read_backup_manifest(path) or {}
    if manifest:
        return {
            "database": bool(manifest.get("includes_database")),
            "files": bool(manifest.get("includes_files")),
            "remnawave": bool(manifest.get("includes_remnawave")),
        }
    if path.suffix.lower() != ".zip":
        return {"database": path.suffix.lower() == ".sql", "files": False, "remnawave": False}
    sql_names, has_files, _, has_rw = _zip_listing_info(path)
    shop_sql = [n for n in sql_names if not n.startswith("remnawave/")]
    return {
        "database": bool(shop_sql),
        "files": has_files,
        "remnawave": has_rw,
    }


def restore_files_from_archive(uploaded_path: Path) -> dict[str, Any]:
    root = project_root()
    root_str = str(root) + os.sep
    restored = 0
    skipped = 0
    with zipfile.ZipFile(uploaded_path, "r") as zf:
        if not _validate_zip_entries(zf, root):
            raise ValueError("Небезопасные пути в архиве")
        for name in zf.namelist():
            if not name.startswith(FILES_ARCHIVE_PREFIX) or name.endswith("/"):
                continue
            rel = name[len(FILES_ARCHIVE_PREFIX):]
            if ".." in Path(rel).parts or not rel:
                skipped += 1
                continue
            target = (root / rel).resolve()
            if not str(target).startswith(root_str):
                skipped += 1
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(name) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
            restored += 1
    return {"restored_files": restored, "skipped_files": skipped}


def restore_from_file(
    uploaded_path: Path,
    *,
    restore_database: bool | None = None,
    restore_files: bool | None = None,
    restore_remnawave: bool | None = None,
    backup_password: str | None = None,
) -> dict[str, Any]:
    """Восстановление БД shopbot, файлов проекта и/или Remnawave из архива."""
    result: dict[str, Any] = {
        "ok": False,
        "database_restored": False,
        "files_restored": 0,
        "remnawave_restored": False,
        "errors": [],
    }
    try:
        if not uploaded_path.exists():
            result["errors"].append("Файл не найден")
            return result

        work_path = uploaded_path
        tmp_holder = None
        restore_password = _resolve_restore_password(backup_password)
        if backup_crypto.is_encrypted_backup(uploaded_path):
            try:
                work_path, tmp_holder = backup_crypto.materialize_for_restore(
                    uploaded_path, restore_password
                )
            except ValueError as e:
                result["errors"].append(str(e))
                return result
            except Exception as e:
                result["errors"].append(f"Не удалось расшифровать архив: {e}")
                return result

        if not validate_backup_file(work_path):
            result["errors"].append("Файл не прошёл проверку (повреждён или не архив shopbot)")
            return result

        caps = archive_capabilities(work_path)
        do_db = caps["database"] if restore_database is None else restore_database
        do_files = caps["files"] if restore_files is None else restore_files
        do_rw = caps["remnawave"] if restore_remnawave is None else restore_remnawave

        if do_db and not caps["database"]:
            result["errors"].append("В архиве нет дампа базы данных shopbot")
            return result
        if do_files and not caps["files"]:
            result["errors"].append("В архиве нет файлов проекта")
            return result
        if do_rw and not caps["remnawave"]:
            result["errors"].append("В архиве нет бэкапа Remnawave")
            return result
        if not do_db and not do_files and not do_rw:
            result["errors"].append("Не выбрано, что восстанавливать")
            return result

        if do_rw:
            pre_scope = "remnawave"
        elif do_db and do_files:
            pre_scope = "full"
        elif do_files:
            pre_scope = "files"
        else:
            pre_scope = "database"
        pre = create_backup_file(
            source="pre_restore",
            note=f"before restore from {uploaded_path.name}",
            scope=pre_scope,
        )
        if pre.path:
            logger.info("Бэкап pre-restore: %s", pre.path.name)

        if do_files:
            fr = restore_files_from_archive(work_path)
            result["files_restored"] = fr.get("restored_files", 0)

        if do_rw:
            from shop_bot.data_manager import remnawave_backup as rw_bak
            rr = rw_bak.restore_remnawave_from_archive(work_path)
            if rr.get("errors"):
                result["errors"].extend(rr["errors"])
            if rr.get("database_restored") or rr.get("compose_restored"):
                result["remnawave_restored"] = True

        if do_db:
            if not is_postgresql():
                result["errors"].append("PostgreSQL не настроен")
                return result

            tmp_dir = BACKUPS_DIR / f"restore-{_timestamp()}"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            candidate_sql: Path | None = None

            if work_path.suffix.lower() == ".zip":
                with zipfile.ZipFile(work_path, "r") as zf:
                    dest = tmp_dir.resolve()
                    for name in zf.namelist():
                        if name.lower().endswith(".sql") and not name.startswith("remnawave/"):
                            zf.extract(name, path=dest)
                            candidate_sql = (dest / name).resolve()
                            break
            elif work_path.suffix.lower() == ".sql":
                candidate_sql = work_path

            if not candidate_sql or not candidate_sql.exists():
                result["errors"].append("SQL dump не найден")
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return result

            try:
                _reset_public_schema_for_restore()
            except Exception as e:
                result["errors"].append(f"Не удалось очистить схему перед restore: {e}")
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return result

            proc = subprocess.run(
                ["psql", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", str(candidate_sql)],
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                result["errors"].append(f"psql: {_format_subprocess_error(proc)}")
                shutil.rmtree(tmp_dir, ignore_errors=True)
                return result
            try:
                rw_repo.run_migration()
            except Exception:
                pass
            shutil.rmtree(tmp_dir, ignore_errors=True)
            result["database_restored"] = True

        result["ok"] = not result["errors"]
        if tmp_holder is not None:
            try:
                tmp_holder.cleanup()
            except Exception:
                pass
        return result
    except subprocess.CalledProcessError as e:
        detail = _format_subprocess_error(e)
        logger.error("Восстановление: subprocess: %s", detail, exc_info=True)
        result["errors"].append(detail)
        result["ok"] = False
        return result
    except Exception as e:
        logger.error("Восстановление: ошибка: %s", e, exc_info=True)
        result["errors"].append(str(e))
        result["ok"] = False
        return result


def resolve_delivery_password(zip_path: Path, created_password: str | None = None) -> str | None:
    """Пароль для отправки в секретный топик: свежий random, мастер или None."""
    if created_password:
        return created_password
    if not backup_crypto.is_encrypted_backup(zip_path):
        return None
    cfg = get_backup_config()
    if cfg.get("password_mode") == "master":
        return _load_master_backup_password()
    return None


async def deliver_backup_notifications(
    bot: Bot,
    zip_path: Path,
    password: str | None = None,
    *,
    fallback_to_admins: bool = False,
) -> dict[str, Any]:
    """Отправить архив в настроенный канал; пароль — в секретный топик.

    В личку админам — только если канал архивов не задан и fallback_to_admins=True.
    При ошибке отправки в настроенный канал в админов не дублируем.
    """
    cfg = get_backup_config()
    delivery = assess_backup_delivery(cfg)
    manifest = read_backup_manifest(zip_path) or {}
    note = manifest.get("note") or ""
    scope_label = manifest.get("scope_label") or _infer_scope_from_name(zip_path.name)
    encrypted = backup_crypto.is_encrypted_backup(zip_path)
    caption = f"🗄 Бэкап ({scope_label}): {zip_path.name}"
    if encrypted:
        caption += "\n🔐 AES-256 — пароль отправлен отдельно"
    if note:
        caption += f"\n📝 {note}"
    if zip_path.stat().st_size > 48 * 1024 * 1024:
        caption += "\n⚠️ Файл > 48 МБ — Telegram может отклонить отправку"

    sent_archive = 0
    archive_error: str | None = None
    from shop_bot.data_manager import telegram_notify as tg_notify

    password = resolve_delivery_password(zip_path, password)
    archive_dest = tg_notify.resolve_destination(tg_notify.CATEGORY_BACKUP)
    if not archive_dest.via_dm:
        try:
            sent_archive = await tg_notify.send_document(
                bot,
                tg_notify.CATEGORY_BACKUP,
                FSInputFile(str(zip_path)),
                caption=caption,
                parse_mode="HTML",
            )
            if sent_archive <= 0:
                archive_error = "send failed"
        except Exception as e:
            archive_error = str(e)
            logger.error("Бэкап: не удалось отправить архив: %s", e)
    elif fallback_to_admins:
        sent_archive = await _send_backup_to_admin_dms(bot, zip_path, caption)
    else:
        logger.warning("Бэкап: канал архивов не задан — архив в Telegram не отправлен")

    sent_secret = 0
    secret_error: str | None = None
    if password and encrypted:
        sec_dest = tg_notify.resolve_destination(tg_notify.CATEGORY_SECRETS)
        if not sec_dest.via_dm:
            try:
                text = (
                    f"🔐 <b>Пароль архива</b>\n"
                    f"<code>{zip_path.name}</code>\n\n"
                    f"<tg-spoiler>{password}</tg-spoiler>\n\n"
                    f"⚠️ Не пересылайте вместе с файлом архива."
                )
                sent_secret = await tg_notify.send_notification(
                    bot, tg_notify.CATEGORY_SECRETS, text,
                )
                if sent_secret <= 0:
                    secret_error = "send failed"
            except Exception as e:
                secret_error = str(e)
                logger.error("Бэкап: не удалось отправить пароль: %s", e)
        else:
            logger.warning("Бэкап: пароль не отправлен — не настроен канал секретов")

    return {
        "archive": sent_archive,
        "secret": sent_secret,
        "archive_error": archive_error,
        "secret_error": secret_error,
        "delivery_ready": delivery.get("delivery_ready"),
    }


async def _send_backup_to_admin_dms(bot: Bot, zip_path: Path, caption: str) -> int:
    cnt = 0
    try:
        admin_ids = list(rw_repo.get_admin_ids() or [])
    except Exception:
        admin_ids = []
    for uid in admin_ids:
        try:
            await bot.send_document(
                chat_id=int(uid),
                document=FSInputFile(str(zip_path)),
                caption=caption,
            )
            cnt += 1
        except Exception as e:
            logger.error("Бэкап: не удалось отправить администратору %s: %s", uid, e)
    return cnt


async def send_backup_to_admins(
    bot: Bot,
    zip_path: Path,
    password: str | None = None,
) -> int:
    result = await deliver_backup_notifications(bot, zip_path, password)
    return int(result.get("archive") or 0)


async def send_existing_backup_to_admins(bot: Bot, name: str) -> int:
    path = _resolve_any_backup(name)
    if not path:
        return 0
    return await send_backup_to_admins(bot, path)
