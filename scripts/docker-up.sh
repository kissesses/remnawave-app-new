#!/usr/bin/env bash
# Единый запуск: docker-compose.yml + .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating ${ENV_FILE} from .env.example"
  cp .env.example "$ENV_FILE"
  echo ""
  echo "⚠️  Заполните секреты в ${ENV_FILE}:"
  echo "   SHOPBOT_SECRET_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD"
  echo "   Затем: ./scripts/docker-up.sh"
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

if [[ "${COMPOSE_NETWORK_EXTERNAL:-true}" == "true" ]]; then
  if ! docker network inspect "${COMPOSE_NETWORK_NAME:-remnawave-network}" >/dev/null 2>&1; then
    echo "⚠️  Сеть ${COMPOSE_NETWORK_NAME:-remnawave-network} не найдена."
    echo "   Установите Remnawave Panel или в .env задайте:"
    echo "   COMPOSE_NETWORK_EXTERNAL=false"
    exit 1
  fi
fi

missing=0
for key in POSTGRES_PASSWORD REDIS_PASSWORD SHOPBOT_SECRET_KEY; do
  val="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d ' \"' || true)"
  if [[ -z "$val" || "$val" == change-me* ]]; then
    echo "⚠️  Задайте ${key} в ${ENV_FILE}"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  exit 1
fi

if [[ "${DOCKER_BUILD:-0}" == "1" ]]; then
  echo "→ docker compose up -d --build"
  docker compose --env-file "$ENV_FILE" up -d --build
else
  echo "→ docker compose pull"
  docker compose --env-file "$ENV_FILE" pull
  echo "→ docker compose up -d"
  docker compose --env-file "$ENV_FILE" up -d
fi

echo ""
echo "✓ Запущено"
echo "  STEALTHX:  http://127.0.0.1:8000/"
echo "  Кабинет:   http://127.0.0.1:8000/app"
echo "  Панель:    http://127.0.0.1:1337/login"
echo "  Health:    curl http://127.0.0.1:8000/health"
echo ""
echo "Логи: docker compose logs -f remnawave-app"
