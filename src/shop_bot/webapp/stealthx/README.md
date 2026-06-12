# STEALTHX — Premium VPN Landing & API

Премиальный cyberpunk VPN-бренд, встроенный в Remnawave App webapp.

## Запуск (один Docker + один .env)

```bash
cp .env.example .env
# заполните SHOPBOT_SECRET_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD

docker compose pull && docker compose up -d
# или локальная сборка:
docker compose up -d --build
# или скрипт:
./scripts/docker-up.sh
```

### Co-install с Remnawave Panel (по умолчанию)

В `.env`:
```env
COMPOSE_NETWORK_EXTERNAL=true
COMPOSE_NETWORK_NAME=remnawave-network
```

Nginx Panel: `remnawave-app-new:8000` → `app.example.com`

### Standalone (без Panel)

В `.env`:
```env
COMPOSE_NETWORK_EXTERNAL=false
COMPOSE_NETWORK_NAME=shopbot-network
SHOPBOT_SESSION_SECURE=0
SHOPBOT_REQUIRE_TOTP=0
```

## Маршруты

| URL | Описание |
|-----|----------|
| `/` | STEALTHX landing |
| `/app/*` | Telegram-кабинет |
| `/login` | Вход |
| `/api/plans` | Тарифы |
| `/api/servers` | VPN-серверы |

## Переменные STEALTHX в `.env`

| Variable | Default | Описание |
|----------|---------|----------|
| `STEALTHX_JWT_SECRET` | `SHOPBOT_SECRET_KEY` | JWT-секрет |
| `STEALTHX_JWT_ACCESS_MINUTES` | `15` | TTL access token |
| `STEALTHX_JWT_REFRESH_DAYS` | `7` | TTL refresh token |
| `STEALTHX_AUTO_CONFIGURE` | `1` | Webapp on + дизайн stealthx + seed |
| `STEALTHX_INIT_STRICT` | `0` | `1` = падать при ошибке init |

## Nginx

- [`deploy/nginx/stealthx.conf`](deploy/nginx/stealthx.conf) — HTTP
- [`deploy/nginx/stealthx-production.conf`](deploy/nginx/stealthx-production.conf) — HTTPS

## База данных

Таблицы создаются при старте (`schema_postgres.py` + `scripts/stealthx-docker-init.py`):

`stealthx_plans`, `stealthx_subscriptions`, `stealthx_vpn_servers`, `stealthx_payments`, `stealthx_logs`
