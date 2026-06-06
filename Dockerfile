# syntax=docker/dockerfile:1
# Remnawave App — multi-stage: без build-essential в финальном образе (меньше pull).

ARG INSTALL_DOCKER_CLI=1

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
COPY scripts /app/project/scripts
WORKDIR /app/project

RUN chmod +x /app/project/scripts/docker-entrypoint.sh

ENTRYPOINT ["/app/project/scripts/docker-entrypoint.sh"]
