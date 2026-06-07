# syntax=docker/dockerfile:1
# Remnawave App — multi-stage: без build-essential в финальном образе (меньше pull).

ARG INSTALL_DOCKER_CLI=1

FROM node:22-alpine AS webapp_css
WORKDIR /css
COPY src/shop_bot/webapp/package.json src/shop_bot/webapp/tailwind.config.js ./
COPY src/shop_bot/webapp/static/css/webapp-tailwind-src.css ./static/css/
COPY src/shop_bot/webapp/app.html src/shop_bot/webapp/login.html ./
COPY src/shop_bot/webapp/module/load.html ./module/
COPY src/shop_bot/webapp/static/js ./static/js
COPY src/shop_bot/webapp/static/css/webapp-cabinet.css ./static/css/
COPY src/shop_bot/webapp/static/css/webapp-shell.css ./static/css/
RUN npm install && npm run build:css

FROM python:3.12-slim AS builder

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg \
        build-essential python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

COPY pyproject.toml /app/project/pyproject.toml
COPY src /app/project/src
COPY --from=webapp_css /css/static/css/webapp-tailwind.css /app/project/src/shop_bot/webapp/static/css/webapp-tailwind.css
WORKDIR /app/project

RUN pip install --no-cache-dir -U pip wheel \
    && pip install --no-cache-dir -e .

FROM python:3.12-slim AS runtime

ARG INSTALL_DOCKER_CLI=1
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBCONF_NONINTERACTIVE_SEEN=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && if [ "$INSTALL_DOCKER_CLI" = "1" ]; then \
        install -m 0755 -d /etc/apt/keyrings \
        && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
        && chmod a+r /etc/apt/keyrings/docker.asc \
        && . /etc/os-release \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && if [ "$INSTALL_DOCKER_CLI" = "1" ]; then \
        apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin; \
    fi \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# editable install (-e): код и шаблоны Flask читаются из src, не только из site-packages
COPY pyproject.toml /app/project/pyproject.toml
COPY src /app/project/src
COPY --from=webapp_css /css/static/css/webapp-tailwind.css /app/project/src/shop_bot/webapp/static/css/webapp-tailwind.css
COPY scripts /app/project/scripts
WORKDIR /app/project

RUN chmod +x /app/project/scripts/docker-entrypoint.sh

ENTRYPOINT ["/app/project/scripts/docker-entrypoint.sh"]
