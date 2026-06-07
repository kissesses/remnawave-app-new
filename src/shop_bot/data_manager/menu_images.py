"""Persistent storage for Telegram bot screen banner images (Media Studio)."""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

from shop_bot.data_manager.db.connection import get_data_dir

logger = logging.getLogger(__name__)

MENU_IMAGE_SECTIONS: dict[str, str] = {
    'profile': 'profile_image',
    'keys': 'keys_image',
    'buy_key': 'buy_key_image',
    'topup': 'topup_image',
    'referral': 'referral_image',
    'support': 'support_image',
    'about': 'about_image',
    'speedtest': 'speedtest_image',
    'howto': 'howto_image',
    'main_menu': 'main_menu_image',
    'topup_amount': 'topup_amount_image',
    'payment': 'payment_image',
    'buy_server': 'buy_server_image',
    'buy_plan': 'buy_plan_image',
    'enter_email': 'enter_email_image',
    'key_info': 'key_info_image',
    'extend_plan': 'extend_plan_image',
    'keys_list': 'keys_list_image',
    'payment_method': 'payment_method_image',
    'key_comments': 'key_comments_image',
    'key_ready': 'key_ready_image',
    'waiting_payment': 'waiting_payment_image',
    'payment_success': 'payment_success_image',
    'devices_list': 'devices_list_image',
}

MENU_IMAGE_SETTING_KEYS: tuple[str, ...] = tuple(MENU_IMAGE_SECTIONS.values())

LEGACY_SUBPATH = 'modules/menu_images'


def get_menu_images_dir() -> Path:
    path = get_data_dir() / 'menu_images'
    path.mkdir(parents=True, exist_ok=True)
    return path


def build_menu_image_filename(section: str, ext: str) -> str:
    return f'{section}_{int(time.time())}.{ext.lower()}'


def is_legacy_menu_image_path(path: str | None) -> bool:
    if not path:
        return False
    normalized = path.replace('\\', '/')
    return f'/{LEGACY_SUBPATH}/' in normalized


def is_persistent_menu_image_path(path: str | None) -> bool:
    if not path:
        return False
    try:
        stored = Path(path).resolve()
        base = get_menu_images_dir().resolve()
        return stored.is_relative_to(base)
    except (OSError, ValueError):
        return False


def migrate_menu_images_to_data_dir() -> int:
    """Move banner files from ephemeral app tree into SHOPBOT_DATA_DIR/menu_images."""
    from shop_bot.data_manager.remnawave_repository import get_setting, update_setting

    dest_dir = get_menu_images_dir()
    moved = 0

    for setting_key in MENU_IMAGE_SETTING_KEYS:
        stored = (get_setting(setting_key) or '').strip()
        if not stored or is_persistent_menu_image_path(stored):
            continue

        src = Path(stored)
        if not src.is_file():
            if is_legacy_menu_image_path(stored):
                logger.warning(
                    'Файл баннера отсутствует — загрузите снова в Media Studio: %s = %s',
                    setting_key,
                    stored,
                )
            continue

        dest = dest_dir / src.name
        if dest.exists():
            dest = dest_dir / f'{src.stem}_{int(time.time())}{src.suffix}'

        try:
            shutil.copy2(src, dest)
            try:
                src.unlink()
            except OSError:
                pass
            update_setting(setting_key, str(dest))
            moved += 1
            logger.info('Menu image migrated: %s -> %s', setting_key, dest)
        except OSError as exc:
            logger.error('Failed to migrate menu image %s: %s', setting_key, exc)

    return moved
