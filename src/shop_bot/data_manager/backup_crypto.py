"""Шифрование архивов бэкапа (AES-256 ZIP) и sidecar-метаданные."""

from __future__ import annotations

import json
import logging
import secrets
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

META_SUFFIX = ".meta.json"
ENCRYPTION_AES = "aes-256-wz"


def _import_pyzipper():
    try:
        import pyzipper
        return pyzipper
    except ImportError:
        return None


def generate_backup_password(length: int = 24) -> str:
    return secrets.token_urlsafe(length)


def sidecar_path(zip_path: Path) -> Path:
    return zip_path.with_suffix(zip_path.suffix + ".meta.json")


def write_sidecar(zip_path: Path, manifest: dict[str, Any], *, encrypted: bool) -> None:
    payload = {
        "name": zip_path.name,
        "encrypted": encrypted,
        "encryption_method": ENCRYPTION_AES if encrypted else None,
        "manifest": manifest,
    }
    sidecar_path(zip_path).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_sidecar(zip_path: Path) -> dict[str, Any] | None:
    path = sidecar_path(zip_path)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception as e:
        logger.debug("backup sidecar read %s: %s", path.name, e)
        return None


def is_encrypted_backup(zip_path: Path) -> bool:
    meta = read_sidecar(zip_path)
    if meta is not None:
        return bool(meta.get("encrypted"))
    return False


def read_manifest_from_sidecar(zip_path: Path) -> dict[str, Any] | None:
    meta = read_sidecar(zip_path)
    if not meta:
        return None
    manifest = meta.get("manifest")
    return manifest if isinstance(manifest, dict) else None


class BackupZipWriter:
    """Пишет ZIP; при password — AES-256 через pyzipper."""

    def __init__(
        self,
        target: Path,
        *,
        password: str | None,
        compress_level: int = 9,
    ):
        self.target = target
        self.password = (password or "").strip() or None
        self.compress_level = max(0, min(9, int(compress_level)))
        self._tmp: Path | None = None
        self._zf: Any = None

    def __enter__(self):
        pyzipper = _import_pyzipper()
        if self.password and pyzipper:
            self._zf = pyzipper.AESZipFile(
                self.target,
                "w",
                compression=pyzipper.ZIP_DEFLATED,
                compresslevel=max(1, self.compress_level) if self.compress_level else 6,
                encryption=pyzipper.WZ_AES,
            )
            self._zf.setpassword(self.password.encode("utf-8"))
            return self._zf
        self._zf = zipfile.ZipFile(
            self.target,
            "w",
            compression=zipfile.ZIP_DEFLATED if self.compress_level > 0 else zipfile.ZIP_STORED,
            compresslevel=self.compress_level if self.compress_level > 0 else None,
        )
        return self._zf

    def __exit__(self, exc_type, exc, tb):
        if self._zf:
            self._zf.close()
        return False


def encrypt_existing_zip(src: Path, dest: Path, password: str, compress_level: int = 9) -> bool:
    """Перепаковать архив с AES (если pyzipper недоступен — оставить как есть)."""
    pyzipper = _import_pyzipper()
    if not pyzipper or not password:
        if src != dest:
            shutil.copy2(src, dest)
        return bool(password)
    pwd = password.encode("utf-8")
    with zipfile.ZipFile(src, "r") as zin:
        with pyzipper.AESZipFile(
            dest,
            "w",
            compression=pyzipper.ZIP_DEFLATED,
            compresslevel=max(1, compress_level),
            encryption=pyzipper.WZ_AES,
        ) as zout:
            zout.setpassword(pwd)
            for info in zin.infolist():
                data = zin.read(info.filename)
                zout.writestr(info, data)
    return True


def extract_encrypted_zip(zip_path: Path, password: str, dest_dir: Path) -> None:
    pyzipper = _import_pyzipper()
    dest_dir.mkdir(parents=True, exist_ok=True)
    if pyzipper and is_encrypted_backup(zip_path):
        with pyzipper.AESZipFile(zip_path, "r") as zf:
            zf.pwd = password.encode("utf-8")
            zf.extractall(dest_dir)
        return
    with zipfile.ZipFile(zip_path, "r") as zf:
        if password:
            zf.setpassword(password.encode("utf-8"))
        zf.extractall(dest_dir)


def materialize_for_restore(uploaded_path: Path, password: str | None) -> tuple[Path, Any | None]:
    """Если архив зашифрован — распаковать во временный plain zip."""
    if not is_encrypted_backup(uploaded_path):
        return uploaded_path, None
    if not password:
        raise ValueError("Архив защищён паролем — укажите пароль")
    tmp = tempfile.TemporaryDirectory(prefix="backup-restore-")
    dest = Path(tmp.name)
    extract_encrypted_zip(uploaded_path, password, dest)
    plain = dest / "restored.zip"
    with zipfile.ZipFile(plain, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for f in dest.rglob("*"):
            if not f.is_file() or f == plain:
                continue
            zf.write(f, arcname=f.relative_to(dest).as_posix())
    return plain, tmp
