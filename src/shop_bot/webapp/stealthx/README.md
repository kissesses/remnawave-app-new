# STEALTHX — Premium VPN Landing & API

Премиальный cyberpunk VPN-бренд, интегрированный в Remnawave App webapp.

## Запуск через Docker

### Production co-install (с Remnawave Panel)

```bash
mkdir -p /opt/remnawave-app && cd /opt/remnawave-app
cp .env.production.example .env
# Заполните: SHOPBOT_SECRET_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD, SHOPBOT_MASTER_KEY
./scripts/docker-prod-up.sh
```

Файлы: `docker-compose.yml` + `docker-compose.production.yml` + `.env`

Nginx Remnawave: `remnawave-app-new:8000` → `app.example.com` (STEALTHX landing на `/`)

### Production standalone (только STEALTHX)

```bash
mkdir -p /opt/stealthx && cd /opt/stealthx
cp .env.stealthx.production.example .env
# Заполните секреты + SHOPBOT_RP_ID / SHOPBOT_RP_ORIGIN (ваш домен)
./scripts/docker-stealthx-prod-up.sh
```

Файлы: `docker-compose.stealthx.prod.yml` + `.env`  
Образ: `ghcr.io/kissesses/remnawave-app-new:latest` (без локальной сборки)

Nginx: [`deploy/nginx/stealthx-production.conf`](deploy/nginx/stealthx-production.conf)

### Dev / локально (standalone)

```bash
cp .env.stealthx.example .env.stealthx
./scripts/docker-stealthx-up.sh
```

Файлы: `docker-compose.stealthx.yml` + `.env.stealthx` (сборка из исходников)

| Режим | Compose | Env | Скрипт |
|-------|---------|-----|--------|
| Dev | `docker-compose.stealthx.yml` | `.env.stealthx.example` | `docker-stealthx-up.sh` |
| Prod standalone | `docker-compose.stealthx.prod.yml` | `.env.stealthx.production.example` | `docker-stealthx-prod-up.sh` |
| Prod co-install | `docker-compose.yml` + `docker-compose.production.yml` | `.env.production.example` | `docker-prod-up.sh` |

## Структура

```
stealthx/
├── backend/
│   ├── core/          # config, database, JWT, deps
│   ├── models/        # SQLAlchemy models
│   ├── schemas/       # Pydantic request/response
│   ├── routers/       # FastAPI REST endpoints
│   └── services/      # business logic
├── deploy/nginx/      # reverse proxy example
└── README.md
```

Frontend (единый Vite SPA):

```
frontend/src/
├── pages/landing-page.tsx
├── sections/          # Hero, Features, Servers, Pricing, ...
├── components/stealthx/
├── services/stealthx-api.ts
├── stores/stealthx-auth-store.ts
└── lib/stealthx-tokens.ts
```

## Маршруты

| URL | Описание |
|-----|----------|
| `/` | Публичный STEALTHX landing |
| `/app/*` | Telegram-кабинет (auth required) |
| `/login` | Страница входа |
| `/api/auth/register` | JWT регистрация |
| `/api/auth/login` | JWT вход |
| `/api/plans` | Тарифы |
| `/api/servers` | VPN-серверы |

## Переменные окружения (Docker)

| Variable | Default | Описание |
|----------|---------|----------|
| `STEALTHX_JWT_SECRET` | `SHOPBOT_SECRET_KEY` | Секрет JWT |
| `STEALTHX_JWT_ACCESS_MINUTES` | `15` | TTL access token |
| `STEALTHX_JWT_REFRESH_DAYS` | `7` | TTL refresh token |
| `STEALTHX_DATABASE_URL` | `SHOPBOT_DATABASE_URL` | PostgreSQL для SQLAlchemy |
| `STEALTHX_AUTO_CONFIGURE` | `1` | Автонастройка webapp + seed при старте |
| `STEALTHX_INIT_STRICT` | `0` | `1` = падать при ошибке init |

Файлы:

- [`docker-compose.stealthx.yml`](../../../docker-compose.stealthx.yml) — dev stack
- [`docker-compose.stealthx.prod.yml`](../../../docker-compose.stealthx.prod.yml) — prod standalone
- [`docker-compose.production.yml`](../../../docker-compose.production.yml) — prod overlay (co-install)
- [`.env.stealthx.example`](../../../.env.stealthx.example) — dev env
- [`.env.stealthx.production.example`](../../../.env.stealthx.production.example) — prod standalone env
- [`.env.production.example`](../../../.env.production.example) — prod co-install env
- [`scripts/docker-stealthx-up.sh`](../../../scripts/docker-stealthx-up.sh) — dev запуск
- [`scripts/docker-stealthx-prod-up.sh`](../../../scripts/docker-stealthx-prod-up.sh) — prod standalone
- [`scripts/docker-prod-up.sh`](../../../scripts/docker-prod-up.sh) — prod co-install
- [`scripts/stealthx-docker-init.py`](../../../scripts/stealthx-docker-init.py) — init при старте

## Nginx

Пример конфига: [`deploy/nginx/stealthx.conf`](deploy/nginx/stealthx.conf)

## База данных

Таблицы создаются автоматически при старте через `schema_postgres.py`:

- `stealthx_plans`
- `stealthx_subscriptions`
- `stealthx_vpn_servers`
- `stealthx_payments`
- `stealthx_logs`

Колонки `jwt_refresh_hash`, `display_name` добавляются в `users`.
