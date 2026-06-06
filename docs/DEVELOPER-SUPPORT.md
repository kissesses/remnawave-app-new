# Developer Support (клиент)

Клиентская установка **Remnawave App** подключается к **внешнему maintainer hub** (сервер автора на [rw-shop](https://github.com/kissesses/rw-shop)).

В публичном репозитории **нет** раздела `/developer`, inbox и API `/v1/*` — только страница **`/developer-support`** в панели.

## Включение

В `.env` клиентской установки:

```env
DEVELOPER_SUPPORT_ENABLED=1
DEVELOPER_SUPPORT_HUB_URL=https://support.example.com
```

URL хаба задаётся **только через окружение** — защита от фишинга.

## Что делает клиент

1. **Привязка панели** (Device Authorization + Ed25519) — код переносится вручную на hub `/bind`
2. **Тикеты** — создание, переписка, вложения; подпись запросов ключом установки
3. **Диагностика** — версия, домен, fingerprint; секреты API не передаются

## Права RBAC

Раздел «Поддержка разработчика» — право `dev_support` (Настройки → Администраторы и роли).

## Maintainer hub

Hub принимает `/bind`, `/v1/pairing/*`, `/v1/tickets/*` — разворачивается из **private rw-shop** с:

```env
DEVELOPER_SUPPORT_HUB_ENABLED=1
DEVELOPER_SUPPORT_HUB_PUBLIC_URL=https://support.example.com
```

Maintainer inbox: `https://support.example.com/developer` (superadmin + 2FA).
