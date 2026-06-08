<div align="center">

# Remnawave App

**Telegram-магазин VPN и личный кабинет (Telegram Premium WebApp)**

Работает вместе с [Remnawave Panel](https://github.com/remnawave/panel): оплата в боте → ключ в Remnawave → конфиг пользователю.

[![Docker](https://img.shields.io/badge/GHCR-remnawave--app--new-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/kissesses/remnawave-app-new/pkgs/container/remnawave-app-new)

[Требования](#требования) · [Установка](#установка) · [Nginx](#nginx) · [WebApp](#webapp) · [Обновление](#обновление) · [Проблемы](#проблемы)

</div>

---

## Требования

Установка **только поверх работающей** [Remnawave Panel](https://docs.rw/docs/install/remnawave-panel) на **том же сервере** (co-install).

| Параметр | Минимум |
|----------|---------|
| ОС | Ubuntu 22.04+ / Debian 11+ |
| RAM | 2 GB (рекомендуется 4 GB) |
| Docker | 24+ и Compose v2 (`docker compose`) |
| Remnawave | `/opt/remnawave`, сеть `remnawave-network`, HTTPS |
| Домены | `panel.*` + `shop.*` (обязательно разные поддомены) |
| WebApp | `app.*` (опционально, отдельный поддомен) |

Проверка перед установкой:

```bash
test -f /opt/remnawave/.env && echo "OK: Remnawave"
docker network inspect remnawave-network >/dev/null && echo "OK: сеть remnawave-network"
docker ps --format '{{.Names}}' | grep -qi remnawave && echo "OK: контейнеры Remnawave"
docker --version && docker compose version
```

На сервер **не нужны** Node.js, npm и исходники — только Docker и два файла конфигурации.

---

## Установка

### 1. Remnawave Panel

Сначала установите панель по [официальной инструкции](https://docs.rw/docs/install/remnawave-panel).  
Без Remnawave App не выдаёт VPN-ключи.

### 2. Каталог и конфиги

```bash
mkdir -p /opt/remnawave-app-new && cd /opt/remnawave-app-new

curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/kissesses/remnawave-app-new/main/docker-compose.yml

curl -fsSL -o .env \
  https://raw.githubusercontent.com/kissesses/remnawave-app-new/main/.env.example
```

На сервере остаётся только:

```
/opt/remnawave-app-new/
├── docker-compose.yml
└── .env
```

Образ: `ghcr.io/kissesses/remnawave-app-new:latest` (собирается в CI, WebApp внутри образа).

### 3. Секреты в `.env`

```bash
cd /opt/remnawave-app-new

pw=$(openssl rand -hex 24)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pw/" .env

sk=$(openssl rand -hex 64)
sed -i -E "s/^#? ?SHOPBOT_SECRET_KEY=.*/SHOPBOT_SECRET_KEY=${sk}/" .env
grep -qE '^SHOPBOT_SECRET_KEY=' .env || echo "SHOPBOT_SECRET_KEY=${sk}" >> .env

mk=$(openssl rand 32 | openssl base64 -A | tr '+/' '-_')
sed -i -E "s/^#? ?SHOPBOT_MASTER_KEY=.*/SHOPBOT_MASTER_KEY=${mk}/" .env
grep -qE '^SHOPBOT_MASTER_KEY=' .env || echo "SHOPBOT_MASTER_KEY=${mk}" >> .env

rp=$(openssl rand -hex 24)
grep -qE '^REDIS_PASSWORD=' .env \
  && sed -i -E "s/^#? ?REDIS_PASSWORD=.*/REDIS_PASSWORD=${rp}/" .env \
  || echo "REDIS_PASSWORD=${rp}" >> .env
sed -i -E "s|^#? ?SHOPBOT_REDIS_URL=.*|SHOPBOT_REDIS_URL=redis://:${rp}@redis:6379/0|" .env
grep -qE '^SHOPBOT_REDIS_URL=' .env || echo "SHOPBOT_REDIS_URL=redis://:${rp}@redis:6379/0" >> .env

grep -q '^SHOPBOT_REQUIRE_TOTP=' .env || echo 'SHOPBOT_REQUIRE_TOTP=1' >> .env
chmod 600 .env
```

При необходимости укажите в `.env`:

```env
SHOPBOT_IMAGE_TAG=latest
TZ=Europe/Moscow
```

### 4. Запуск

```bash
cd /opt/remnawave-app-new

docker network inspect remnawave-network >/dev/null && echo "OK: сеть"
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f --tail=50
```

Проверка с хоста:

```bash
curl -fsS http://127.0.0.1:1337/login >/dev/null && echo "OK: панель"
curl -fsS http://127.0.0.1:8000/health && echo "OK: WebApp"
```

Порты на localhost: **1337** (админ-панель), **8000** (Telegram WebApp).

### 5. Первичная настройка

| Шаг | Действие |
|-----|----------|
| 1 | Откройте `https://shop.example.com/setup` |
| 2 | Укажите Remnawave API token, логин и пароль админа |
| 3 | **Настройки → Telegram** — токен бота, username, ID админа |
| 4 | **Настройки → Хосты** — URL и API Remnawave |
| 5 | **Тарифы → Запустить бота** |
| 6 | **Настройки → WebApp** — домен, включить кабинет |

---

## Nginx

Публичный доступ — через **Nginx Remnawave** (`remnawave-nginx`), не через порты на `0.0.0.0`.

В `/opt/remnawave/nginx` добавьте upstream (имя контейнера из `docker-compose.yml`):

```nginx
upstream remnawave_app_panel {
    server remnawave-app-new:1337;
}

upstream remnawave_app_webapp {
    server remnawave-app-new:8000;
}
```

Пример server block для панели (`shop.example.com`):

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;

    location / {
        proxy_pass http://remnawave_app_panel;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Пример для WebApp (`app.example.com`):

```nginx
server {
    listen 443 ssl http2;
    server_name app.example.com;

    location / {
        proxy_pass http://remnawave_app_webapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Применить:

```bash
docker exec remnawave-nginx nginx -t
docker exec remnawave-nginx nginx -s reload
```

> **Важно:** внутри `remnawave-nginx` нельзя использовать `127.0.0.1:1337` — только имя контейнера `remnawave-app-new:1337`, иначе будет 502.

Проверка из nginx-контейнера:

```bash
docker exec remnawave-nginx curl -fsS --max-time 3 http://remnawave-app-new:1337/login >/dev/null && echo OK
docker exec remnawave-nginx curl -fsS --max-time 3 http://remnawave-app-new:8000/health >/dev/null && echo OK
```

---

## WebApp

Личный кабинет — React SPA в стиле Telegram Premium. Собирается **внутри Docker-образа**, на сервер ничего дополнительно ставить не нужно.

В панели: **Настройки → WebApp** — URL (`https://app.example.com`), включить Mini App.  
В [@BotFather](https://t.me/botfather) или в настройках бота — Menu Button на этот URL.

---

## Обновление

Только вручную на сервере:

```bash
cd /opt/remnawave-app-new
docker compose pull
docker compose up -d --force-recreate
```

Если в репозитории изменился `docker-compose.yml`:

```bash
cd /opt/remnawave-app-new
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/kissesses/remnawave-app-new/main/docker-compose.yml
docker compose pull
docker compose up -d --force-recreate
```

Проверка версии образа:

```bash
docker compose images
docker inspect ghcr.io/kissesses/remnawave-app-new:latest --format '{{.Created}}'
```

---

## Проблемы

| Симптом | Что проверить |
|---------|----------------|
| 502 Bad Gateway | Upstream в nginx: `remnawave-app-new:1337`, не `127.0.0.1` |
| Панель не открывается | `docker compose ps`, `curl http://127.0.0.1:1337/login` |
| WebApp «не собран» | Образ устарел — `docker compose pull` |
| Бот не отвечает | Панель → Telegram, «Запустить бота» |
| Нет ключей | Remnawave API token и хосты в настройках |

Диагностика:

```bash
cd /opt/remnawave-app-new
docker compose ps
docker compose logs remnawave-app-new --tail=100
curl -fsS http://127.0.0.1:1337/login | head -3
curl -fsS http://127.0.0.1:8000/health
```

Подробнее: [docs/INSTALL.md](docs/INSTALL.md)

---

## Ссылки

| | |
|---|---|
| Репозиторий | [github.com/kissesses/remnawave-app-new](https://github.com/kissesses/remnawave-app-new) |
| Docker-образ | `ghcr.io/kissesses/remnawave-app-new:latest` |
| Переменные окружения | [.env.example](.env.example) |
| Issues | [github.com/kissesses/remnawave-app-new/issues](https://github.com/kissesses/remnawave-app-new/issues) |

---

<div align="center">

**MIT** · [kissesses/remnawave-app-new](https://github.com/kissesses/remnawave-app-new)

</div>
