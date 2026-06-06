#!/bin/sh
set -e
cd /app/project
echo "[entrypoint] PostgreSQL schema check..."
attempt=1
max_attempts=30
while [ "$attempt" -le "$max_attempts" ]; do
    if /app/.venv/bin/python -c "from shop_bot.data_manager import remnawave_repository as r; r.initialize_db()"; then
        echo "[entrypoint] Database ready (attempt ${attempt})"
        break
    fi
    if [ "$attempt" -eq "$max_attempts" ]; then
        echo "[entrypoint] FATAL: could not initialize database after ${max_attempts} attempts" >&2
        exit 1
    fi
    echo "[entrypoint] DB not ready, retry ${attempt}/${max_attempts} in 3s..."
    sleep 3
    attempt=$((attempt + 1))
done
exec /app/.venv/bin/python -m shop_bot
