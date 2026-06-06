"""Обзор состояния БД для раздела «База данных»."""

from __future__ import annotations

import csv
import io
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

from shop_bot.data_manager.database import get_db_connection
from shop_bot.data_manager.db.dialect import is_postgresql, sql_vacuum

logger = logging.getLogger(__name__)

_TABLE_NAME_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,62}$')
_MAX_BROWSE_LIMIT = 200
_MAX_QUERY_ROWS = 500
_MAX_EXPORT_ROWS = 50_000

_FORBIDDEN_SQL_RE = re.compile(
    r'\b(delete|update|insert|truncate|drop|alter|create|grant|revoke|copy|call|execute|merge|replace)\b',
    re.IGNORECASE,
)

PROTECTED_TABLES: dict[str, frozenset[str]] = {
    'shopbot': frozenset({
        'panel_admins',
        'panel_roles',
        'panel_webauthn_credentials',
        'panel_audit_log',
        'panel_admin_invites',
        'bot_settings',
        'sqlite_sequence',
    }),
    'remnawave': frozenset({
        '_prisma_migrations',
    }),
}
# Защищённые таблицы: просмотр/экспорт после step-up 2FA; удаление и TRUNCATE запрещены.

DATABASE_SOURCES: tuple[str, ...] = ('shopbot', 'remnawave')
SOURCE_LABELS: dict[str, str] = {
    'shopbot': 'Remnawave App',
    'remnawave': 'Remnawave Panel',
}

_TABLE_STATS: tuple[tuple[str, str], ...] = (
    ('users', 'Пользователи'),
    ('vpn_keys', 'Ключи VPN'),
    ('transactions', 'Транзакции'),
    ('support_tickets', 'Тикеты поддержки'),
    ('xui_hosts', 'Хосты'),
    ('panel_admins', 'Администраторы'),
    ('panel_audit_log', 'Журнал аудита'),
)

_RW_TABLE_LABELS: dict[str, str] = {
    'user': 'Пользователи',
    'users': 'Пользователи',
    'subscription': 'Подписки',
    'subscriptions': 'Подписки',
    'node': 'Ноды',
    'nodes': 'Ноды',
    'host': 'Хосты',
    'hosts': 'Хосты',
    'config': 'Конфигурация',
    'settings': 'Настройки',
}


def normalize_db_source(raw: str | None) -> str:
    key = (raw or 'shopbot').strip().lower()
    return key if key in DATABASE_SOURCES else 'shopbot'


def format_bytes(num: int | float | None) -> str:
    if num is None:
        return '—'
    n = float(num)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024 or unit == 'TB':
            if unit == 'B':
                return f'{int(n)} {unit}'
            return f'{n:.1f} {unit}'
        n /= 1024
    return f'{n:.1f} PB'


def _overview_shell(source: str) -> dict[str, Any]:
    return {
        'source': source,
        'source_label': SOURCE_LABELS.get(source, source),
        'engine': 'PostgreSQL',
        'connected': False,
        'db_size_bytes': None,
        'db_size_label': '—',
        'postgres_version': None,
        'db_name': None,
        'connection_mode': None,
        'tables': [],
        'table_rows_total': 0,
        'configured': True,
    }


def get_overview(source: str = 'shopbot') -> dict[str, Any]:
    source = normalize_db_source(source)
    if source == 'remnawave':
        return get_remnawave_database_overview()
    return get_database_overview()


def get_database_overview() -> dict[str, Any]:
    overview = _overview_shell('shopbot')
    overview['engine'] = 'PostgreSQL' if is_postgresql() else 'SQLite'
    overview['connection_mode'] = 'shopbot'
    try:
        with get_db_connection() as conn:
            overview['connected'] = True
            if is_postgresql():
                row = conn.execute('SELECT version() AS v').fetchone()
                overview['postgres_version'] = (row['v'].split(',')[0] if row and row['v'] else None)
                size_row = conn.execute(
                    'SELECT pg_database_size(current_database()) AS sz',
                ).fetchone()
                if size_row:
                    overview['db_size_bytes'] = int(size_row['sz'])
                    overview['db_size_label'] = format_bytes(size_row['sz'])
                name_row = conn.execute('SELECT current_database() AS db_name').fetchone()
                if name_row:
                    overview['db_name'] = name_row['db_name']
            tables = []
            total_rows = 0
            for table, label in _TABLE_STATS:
                try:
                    cnt_row = conn.execute(f'SELECT COUNT(*) AS c FROM {table}').fetchone()
                    count = int(cnt_row['c']) if cnt_row else 0
                except Exception:
                    count = 0
                total_rows += count
                tables.append({'id': table, 'label': label, 'rows': count})
            overview['tables'] = tables
            overview['table_rows_total'] = total_rows
    except Exception as exc:
        logger.warning('Database overview failed: %s', exc)
        overview['error'] = str(exc)
    return overview


def _remnawave_table_label(name: str) -> str:
    base = name.split('.')[-1]
    return _RW_TABLE_LABELS.get(base, base)


def validate_table_name(name: str) -> str:
    table = (name or '').strip()
    if not _TABLE_NAME_RE.match(table):
        raise ValueError('Недопустимое имя таблицы')
    return table


def validate_column_name(name: str) -> str:
    col = (name or '').strip()
    if not _TABLE_NAME_RE.match(col):
        raise ValueError('Недопустимое имя колонки')
    return col


def is_table_protected(source: str, table: str) -> bool:
    source = normalize_db_source(source)
    return table.lower() in {t.lower() for t in PROTECTED_TABLES.get(source, frozenset())}


def _validate_readonly_sql(source: str, text: str) -> None:
    lower = text.lower()
    if re.search(r'explain\s+analyze', lower):
        raise ValueError('EXPLAIN ANALYZE запрещён')
    if _FORBIDDEN_SQL_RE.search(text):
        raise ValueError('Запрос содержит запрещённые операции')


def _quote_ident(name: str) -> str:
    validate_table_name(name)
    return f'"{name}"'


def _shopbot_select(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with get_db_connection() as conn:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        if not rows:
            return []
        if hasattr(rows[0], 'keys'):
            return [dict(row) for row in rows]
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, row)) for row in rows]


def _shopbot_console_select(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Validated read-only query (SQL console) — отдельное autocommit-подключение."""
    from shop_bot.data_manager.db.dialect import DATABASE_URL
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        connect_timeout=15,
        autocommit=True,
    ) as conn:
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        if not rows:
            return []
        return [dict(row) for row in rows]


def _shopbot_execute(sql: str, params: tuple[Any, ...] = ()) -> int:
    with get_db_connection() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return int(getattr(cur, 'rowcount', 0) or 0)


def _remnawave_run(sql: str, *, readonly: bool = True) -> list[dict[str, Any]]:
    from shop_bot.data_manager import remnawave_backup as rw

    stripped = sql.strip()
    lower = stripped.lower()
    if readonly and not (lower.startswith('select') or lower.startswith('with')):
        raise ValueError('Разрешены только SELECT-запросы')

    cfg = rw.get_remnawave_backup_settings()
    db_url = rw._resolve_database_url(cfg)
    if db_url:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(
            db_url,
            row_factory=dict_row,
            connect_timeout=15,
            autocommit=True,
        ) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                if cur.description:
                    return [dict(row) for row in cur.fetchall()]
                return []

    compose_dir = Path(cfg.get('compose_dir') or rw.DEFAULT_COMPOSE_DIR)
    if not compose_dir.is_dir():
        raise RuntimeError('Каталог Remnawave не найден — укажите DATABASE_URL или путь в бэкапах')

    env_vars: dict[str, str] = {}
    env_file = compose_dir / '.env'
    if env_file.is_file():
        env_vars = rw._parse_dotenv(env_file.read_text(encoding='utf-8', errors='ignore'))

    pg_user = env_vars.get('POSTGRES_USER', 'postgres')
    pg_db = env_vars.get('POSTGRES_DB', 'remnawave')
    pg_service = cfg.get('pg_service') or rw.DEFAULT_PG_SERVICE
    compose_cmd = rw._detect_compose_cmd().split()

    if not rw._local_docker_available():
        raise RuntimeError(
            'Docker недоступен. Укажите backup_remnawave_database_url или REMNAWAVE_BACKUP_DATABASE_URL',
        )

    if readonly:
        cmd = [
            *compose_cmd, 'exec', '-T', pg_service, 'psql',
            '-U', pg_user, '-d', pg_db, '--csv', '-c', sql,
        ]
        proc = subprocess.run(cmd, cwd=str(compose_dir), capture_output=True, timeout=60, text=True)
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or '').strip()
            raise RuntimeError(err or f'psql завершился с кодом {proc.returncode}')
        reader = csv.DictReader(io.StringIO(proc.stdout))
        return [dict(row) for row in reader]

    cmd = [
        *compose_cmd, 'exec', '-T', pg_service, 'psql',
        '-U', pg_user, '-d', pg_db, '-c', sql,
    ]
    proc = subprocess.run(cmd, cwd=str(compose_dir), capture_output=True, timeout=120, text=True)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or '').strip()
        raise RuntimeError(err or f'psql завершился с кодом {proc.returncode}')
    return []


def _remnawave_query_rows(sql: str) -> list[dict[str, Any]]:
    return _remnawave_run(sql, readonly=True)


def _source_select(source: str, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    source = normalize_db_source(source)
    if source == 'remnawave':
        if params:
            raise ValueError('Remnawave не поддерживает параметризованные запросы через compose')
        return _remnawave_run(sql, readonly=True)
    return _shopbot_select(sql, params)


def _source_console_select(source: str, sql: str) -> list[dict[str, Any]]:
    source = normalize_db_source(source)
    if source == 'remnawave':
        return _remnawave_run(sql, readonly=True)
    return _shopbot_console_select(sql)


def _source_execute(source: str, sql: str, params: tuple[Any, ...] = ()) -> int:
    source = normalize_db_source(source)
    if source == 'remnawave':
        if params:
            raise ValueError('Remnawave не поддерживает параметризованные запросы через compose')
        _remnawave_run(sql, readonly=False)
        return 0
    return _shopbot_execute(sql, params)


def _table_columns(source: str, table: str) -> list[dict[str, Any]]:
    table = validate_table_name(table)
    source = normalize_db_source(source)
    if source == 'remnawave' or is_postgresql():
        rows = _source_select(
            source,
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """ if source == 'shopbot' and is_postgresql() else f"""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '{table}'
            ORDER BY ordinal_position
            """,
            (table,) if source == 'shopbot' and is_postgresql() else (),
        )
        return [
            {
                'name': r['column_name'],
                'type': r.get('data_type'),
                'nullable': r.get('is_nullable') == 'YES',
                'default': r.get('column_default'),
            }
            for r in rows
        ]

    rows = _shopbot_select(f'PRAGMA table_info({_quote_ident(table)})')
    return [
        {
            'name': r['name'],
            'type': r.get('type'),
            'nullable': not bool(r.get('notnull')),
            'default': r.get('dflt_value'),
            'pk': bool(r.get('pk')),
        }
        for r in rows
    ]


def _table_primary_key(source: str, table: str) -> list[str]:
    table = validate_table_name(table)
    source = normalize_db_source(source)
    if source == 'remnawave' or is_postgresql():
        sql = (
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = %s
              AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
            """
            if source == 'shopbot' and is_postgresql()
            else f"""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = '{table}'
              AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
            """
        )
        rows = _source_select(source, sql, (table,) if source == 'shopbot' and is_postgresql() else ())
        return [str(r['column_name']) for r in rows]

    cols = _table_columns(source, table)
    pk = [c['name'] for c in cols if c.get('pk')]
    return pk


def list_tables(source: str = 'shopbot') -> list[dict[str, Any]]:
    source = normalize_db_source(source)
    tables: list[dict[str, Any]] = []
    try:
        if source == 'remnawave' or is_postgresql():
            rows = _source_select(
                source,
                """
                SELECT relname AS table_name,
                       COALESCE(n_live_tup, 0)::bigint AS rows,
                       pg_total_relation_size(relid) AS size_bytes
                FROM pg_stat_user_tables
                WHERE schemaname = 'public'
                ORDER BY relname
                """,
            )
            for row in rows:
                name = str(row.get('table_name') or '')
                sz = row.get('size_bytes')
                tables.append({
                    'id': name,
                    'label': _remnawave_table_label(name) if source == 'remnawave' else name,
                    'rows': int(row.get('rows') or 0),
                    'size_bytes': int(sz) if sz is not None else None,
                    'size_label': format_bytes(sz),
                    'protected': is_table_protected(source, name),
                })
        else:
            names = _shopbot_select(
                "SELECT name AS table_name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            for row in names:
                name = str(row.get('table_name') or '')
                try:
                    cnt = _shopbot_select(f'SELECT COUNT(*) AS c FROM {_quote_ident(name)}')
                    count = int(cnt[0]['c']) if cnt else 0
                except Exception:
                    count = 0
                tables.append({
                    'id': name,
                    'label': name,
                    'rows': count,
                    'size_bytes': None,
                    'size_label': '—',
                    'protected': is_table_protected(source, name),
                })
    except Exception as exc:
        logger.warning('list_tables failed (%s): %s', source, exc)
        raise
    return tables


def get_table_detail(source: str, table: str) -> dict[str, Any]:
    source = normalize_db_source(source)
    table = validate_table_name(table)
    columns = _table_columns(source, table)
    pk = _table_primary_key(source, table)
    col_names = {c['name'] for c in columns}
    for item in list_tables(source):
        if item['id'] == table:
            meta = item
            break
    else:
        meta = {'id': table, 'label': table, 'rows': 0, 'size_label': '—', 'protected': is_table_protected(source, table)}
    return {
        'table': table,
        'label': meta.get('label', table),
        'rows': meta.get('rows', 0),
        'size_label': meta.get('size_label', '—'),
        'protected': meta.get('protected', False),
        'primary_key': pk,
        'columns': columns,
        'column_names': sorted(col_names),
        'can_delete': bool(pk) and not meta.get('protected', False),
        'can_truncate': not meta.get('protected', False),
    }


def browse_table(
    source: str,
    table: str,
    *,
    page: int = 1,
    limit: int = 50,
    order_by: str | None = None,
    order_dir: str = 'asc',
) -> dict[str, Any]:
    source = normalize_db_source(source)
    table = validate_table_name(table)
    detail = get_table_detail(source, table)
    limit = max(1, min(int(limit), _MAX_BROWSE_LIMIT))
    page = max(1, int(page))
    offset = (page - 1) * limit
    order_dir = 'desc' if (order_dir or '').lower() == 'desc' else 'asc'

    order_clause = ''
    if order_by:
        col = validate_column_name(order_by)
        if col not in detail['column_names']:
            raise ValueError('Неизвестная колонка для сортировки')
        order_clause = f' ORDER BY {_quote_ident(col)} {order_dir.upper()}'

    qtable = _quote_ident(table)
    total = int(detail.get('rows') or 0)
    if source == 'shopbot' and not is_postgresql():
        cnt = _shopbot_select(f'SELECT COUNT(*) AS c FROM {qtable}')
        total = int(cnt[0]['c']) if cnt else 0

    rows = _source_select(source, f'SELECT * FROM {qtable}{order_clause} LIMIT {limit} OFFSET {offset}')
    serialized = []
    for row in rows:
        serialized.append({k: _serialize_cell(v) for k, v in row.items()})
    return {
        'table': table,
        'page': page,
        'limit': limit,
        'total': total,
        'pages': max(1, (total + limit - 1) // limit),
        'columns': detail['columns'],
        'column_names': [c['name'] for c in detail['columns']],
        'primary_key': detail['primary_key'],
        'rows': serialized,
        'protected': detail['protected'],
        'can_delete': detail['can_delete'],
        'can_truncate': detail['can_truncate'],
    }


def _serialize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def delete_table_rows(source: str, table: str, keys: list[dict[str, Any]]) -> tuple[int, str]:
    source = normalize_db_source(source)
    table = validate_table_name(table)
    if is_table_protected(source, table):
        return 0, 'Таблица защищена от удаления'
    if not keys:
        return 0, 'Не указаны строки'

    detail = get_table_detail(source, table)
    pk_cols = detail['primary_key']
    if not pk_cols:
        return 0, 'У таблицы нет первичного ключа — удаление по строкам недоступно'

    deleted = 0
    qtable = _quote_ident(table)
    for key in keys[:100]:
        if not isinstance(key, dict):
            continue
        clauses = []
        params: list[Any] = []
        for col in pk_cols:
            if col not in key:
                return deleted, f'Не указан ключ {col}'
            validate_column_name(col)
            if source == 'remnawave':
                val = key[col]
                if val is None:
                    clauses.append(f'{_quote_ident(col)} IS NULL')
                elif isinstance(val, (int, float)):
                    clauses.append(f'{_quote_ident(col)} = {val}')
                else:
                    safe = str(val).replace("'", "''")
                    clauses.append(f"{_quote_ident(col)} = '{safe}'")
            else:
                clauses.append(f'{_quote_ident(col)} = ?')
                params.append(key[col])
        where = ' AND '.join(clauses)
        if source == 'remnawave':
            _source_execute(source, f'DELETE FROM {qtable} WHERE {where}')
            deleted += 1
        else:
            deleted += _shopbot_execute(f'DELETE FROM {qtable} WHERE {where}', tuple(params))
    return deleted, f'Удалено строк: {deleted}'


def truncate_table(source: str, table: str, confirm: str) -> tuple[bool, str]:
    source = normalize_db_source(source)
    table = validate_table_name(table)
    if is_table_protected(source, table):
        return False, 'Таблица защищена от очистки'
    expected = f'TRUNCATE {table}'
    if (confirm or '').strip() != expected:
        return False, f'Для подтверждения введите: {expected}'

    qtable = _quote_ident(table)
    try:
        if source == 'remnawave' or is_postgresql():
            _source_execute(source, f'TRUNCATE TABLE {qtable} RESTART IDENTITY CASCADE')
        else:
            _shopbot_execute(f'DELETE FROM {qtable}')
            try:
                _shopbot_execute('DELETE FROM sqlite_sequence WHERE name = ?', (table,))
            except Exception:
                pass
        return True, f'Таблица {table} очищена'
    except Exception as exc:
        logger.exception('truncate_table failed')
        return False, str(exc)


def execute_readonly_query(source: str, sql: str) -> dict[str, Any]:
    source = normalize_db_source(source)
    text = (sql or '').strip()
    if not text:
        raise ValueError('Пустой запрос')
    if ';' in text.rstrip(';'):
        raise ValueError('Разрешён только один SQL-запрос')
    lower = text.lower()
    if not (lower.startswith('select') or lower.startswith('with') or lower.startswith('explain')):
        raise ValueError('Разрешены только SELECT / WITH / EXPLAIN')
    _validate_readonly_sql(source, text)

    limited = text
    if 'limit' not in lower:
        limited = f'{text.rstrip(";")} LIMIT {_MAX_QUERY_ROWS}'

    rows = _source_console_select(source, limited)
    columns = list(rows[0].keys()) if rows else []
    return {
        'columns': columns,
        'rows': [{k: _serialize_cell(v) for k, v in row.items()} for row in rows],
        'count': len(rows),
        'truncated': len(rows) >= _MAX_QUERY_ROWS,
    }


def export_table_csv(source: str, table: str, *, limit: int = _MAX_EXPORT_ROWS) -> tuple[str, str]:
    source = normalize_db_source(source)
    table = validate_table_name(table)
    limit = max(1, min(int(limit), _MAX_EXPORT_ROWS))
    qtable = _quote_ident(table)
    rows = _source_select(source, f'SELECT * FROM {qtable} LIMIT {limit}')
    if not rows:
        return table, ''
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow({k: _serialize_cell(v) for k, v in row.items()})
    return table, buf.getvalue()


def get_connection_stats(source: str) -> dict[str, Any]:
    source = normalize_db_source(source)
    if source == 'shopbot' and not is_postgresql():
        return {'supported': False}
    try:
        rows = _source_select(
            source,
            """
            SELECT
                count(*) FILTER (WHERE state = 'active') AS active,
                count(*) FILTER (WHERE state = 'idle') AS idle,
                count(*) AS total
            FROM pg_stat_activity
            WHERE datname = current_database()
            """,
        )
        row = rows[0] if rows else {}
        return {
            'supported': True,
            'active': int(row.get('active') or 0),
            'idle': int(row.get('idle') or 0),
            'total': int(row.get('total') or 0),
        }
    except Exception as exc:
        return {'supported': True, 'error': str(exc)}


def get_remnawave_database_overview() -> dict[str, Any]:
    from shop_bot.data_manager import remnawave_backup as rw

    overview = _overview_shell('remnawave')
    overview['configured'] = rw.is_remnawave_backup_configured()
    cfg = rw.get_remnawave_backup_settings()
    overview['connection_mode'] = cfg.get('mode') or 'local'
    if cfg.get('ssh_target'):
        overview['connection_mode'] = f"ssh ({cfg['ssh_target']})"

    if not overview['configured']:
        overview['error'] = 'Remnawave не настроен — укажите DATABASE_URL или каталог compose в центре бэкапов'
        return overview

    try:
        version_rows = _remnawave_query_rows('SELECT version() AS v')
        if version_rows:
            overview['postgres_version'] = str(version_rows[0].get('v', '')).split(',')[0]

        size_rows = _remnawave_query_rows(
            'SELECT current_database() AS db_name, pg_database_size(current_database()) AS sz',
        )
        if size_rows:
            overview['db_name'] = size_rows[0].get('db_name')
            try:
                sz = int(size_rows[0].get('sz') or 0)
                overview['db_size_bytes'] = sz
                overview['db_size_label'] = format_bytes(sz)
            except (TypeError, ValueError):
                pass

        stat_rows = _remnawave_query_rows(
            """
            SELECT relname AS table_name, COALESCE(n_live_tup, 0)::bigint AS rows
            FROM pg_stat_user_tables
            ORDER BY n_live_tup DESC
            LIMIT 15
            """,
        )
        tables = []
        total_rows = 0
        for row in stat_rows:
            name = str(row.get('table_name') or '')
            try:
                count = int(row.get('rows') or 0)
            except (TypeError, ValueError):
                count = 0
            total_rows += count
            tables.append({'id': name, 'label': _remnawave_table_label(name), 'rows': count})
        overview['tables'] = tables
        overview['table_rows_total'] = total_rows
        overview['connected'] = True
    except Exception as exc:
        logger.warning('Remnawave database overview failed: %s', exc)
        overview['error'] = str(exc)
    return overview


def _shopbot_autocommit_sql(sql: str) -> None:
    if not is_postgresql():
        raise RuntimeError('Autocommit SQL доступен только для PostgreSQL')
    from shop_bot.data_manager.db.dialect import DATABASE_URL
    import psycopg

    with psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)


def run_maintenance_analyze(source: str = 'shopbot') -> tuple[bool, str]:
    source = normalize_db_source(source)
    if source == 'remnawave':
        return _run_remnawave_analyze()
    try:
        with get_db_connection() as conn:
            if is_postgresql():
                conn.execute('ANALYZE')
            else:
                conn.execute(sql_vacuum())
            conn.commit()
        return True, 'ANALYZE выполнен'
    except Exception as exc:
        logger.exception('Database maintenance analyze failed')
        return False, str(exc)


def _run_remnawave_analyze() -> tuple[bool, str]:
    from shop_bot.data_manager import remnawave_backup as rw

    if not rw.is_remnawave_backup_configured():
        return False, 'Remnawave не настроен'
    try:
        _remnawave_run('ANALYZE', readonly=False)
        return True, 'ANALYZE выполнен для Remnawave'
    except Exception as exc:
        logger.exception('Remnawave analyze failed')
        return False, str(exc)


def run_maintenance(source: str, action: str, table: str | None = None) -> tuple[bool, str]:
    source = normalize_db_source(source)
    action = (action or 'analyze').strip().lower()
    table = validate_table_name(table) if table else None

    if action == 'analyze':
        return run_maintenance_analyze(source)

    if source == 'remnawave':
        return _run_remnawave_maintenance(action, table)

    try:
        if is_postgresql():
            if action == 'vacuum' and table:
                _shopbot_autocommit_sql(f'VACUUM ANALYZE {_quote_ident(table)}')
            elif action == 'vacuum':
                _shopbot_autocommit_sql('VACUUM ANALYZE')
            elif action == 'reindex' and table:
                _shopbot_autocommit_sql(f'REINDEX TABLE {_quote_ident(table)}')
            elif action == 'reindex':
                _shopbot_autocommit_sql('REINDEX DATABASE CURRENT')
            else:
                return False, f'Неизвестное действие: {action}'
        elif action in ('vacuum', 'reindex'):
            with get_db_connection() as conn:
                conn.execute(sql_vacuum())
                conn.commit()
        else:
            return False, f'Неизвестное действие: {action}'
        labels = {
            'vacuum': 'VACUUM выполнен',
            'reindex': 'REINDEX выполнен',
        }
        return True, labels.get(action, 'Обслуживание выполнено')
    except Exception as exc:
        logger.exception('Database maintenance failed')
        return False, str(exc)


def _run_remnawave_maintenance(action: str, table: str | None) -> tuple[bool, str]:
    from shop_bot.data_manager import remnawave_backup as rw

    if not rw.is_remnawave_backup_configured():
        return False, 'Remnawave не настроен'

    sql = ''
    if action == 'vacuum' and table:
        sql = f'VACUUM ANALYZE {_quote_ident(table)}'
    elif action == 'vacuum':
        sql = 'VACUUM ANALYZE'
    elif action == 'reindex' and table:
        sql = f'REINDEX TABLE {_quote_ident(table)}'
    elif action == 'reindex':
        sql = 'REINDEX DATABASE CURRENT'
    else:
        return False, f'Неизвестное действие: {action}'

    try:
        _remnawave_run(sql, readonly=False)
        return True, f'{action.upper()} выполнен для Remnawave'
    except Exception as exc:
        logger.exception('Remnawave maintenance failed')
        return False, str(exc)
