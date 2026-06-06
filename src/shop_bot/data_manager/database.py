"""Backward-compatible facade for shop_bot.data_manager.database imports."""
from shop_bot.data_manager import db as _db
from shop_bot.data_manager.db import __all__

__all__ = list(__all__)
globals().update({name: getattr(_db, name) for name in __all__})
