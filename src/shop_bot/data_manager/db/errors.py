"""Database exception aliases for PostgreSQL."""

try:
    from psycopg.errors import ForeignKeyViolation, UniqueViolation
except ImportError:  # pragma: no cover
    UniqueViolation = Exception
    ForeignKeyViolation = Exception

__all__ = ["UniqueViolation", "ForeignKeyViolation"]
