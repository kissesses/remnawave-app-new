#!/usr/bin/env bash
# Production deploy co-install с Remnawave Panel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_BASE="${COMPOSE_BASE:-docker-compose.yml}"
COMPOSE_PROD="${COMPOSE_PROD:-docker-compose.production.yml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating $ENV_FILE from .env.production.example"
  cp .env.production.example "$ENV_FILE"
  echo ""
  echo "⚠️  Заполните секреты в ${ENV_FILE} (docs/INSTALL.md)"
  echo "   Затем: ./scripts/docker-prod-up.sh"
  exit 1
fi

if ! docker network inspect remnawave-network >/dev/null 2>&1; then
  echo "⚠️  Сеть remnawave-network не найдена."
  echo "   Создайте: docker network create remnawave-network"
  echo "   (или установите Remnawave Panel — сеть создаётся автоматически)"
  exit 1
fi

required_keys=(SHOPBOT_SECRET_KEY POSTGRES_PASSWORD REDIS_PASSWORD)
missing=0
for key in "${required_keys[@]}"; do
  val="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' \"' || true)"
  if [[ -z "$val" ]]; then
    echo "⚠️  Задайте ${key} в ${ENV_FILE}"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

echo "→ Pull images..."
docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" --env-file "$ENV_FILE" pull

echo "→ Starting production stack (co-install)..."
docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_PROD" --env-file "$ENV_FILE" up -d

echo ""
echo "✓ Production запущен (STEALTHX + Remnawave co-install)"
echo "  WebApp:  remnawave-app-new:8000  → app.example.com (nginx)"
echo "  Panel:   remnawave-app-new:1337  → shop.example.com"
echo "  Health:  curl http://127.0.0.1:8000/health"
echo ""
echo "Логи: docker compose -f ${COMPOSE_BASE} -f ${COMPOSE_PROD} logs -f remnawave-app"
