# Changelog

## [1.0.2] — 2026-06-07

### Changed

- Единый брендинг **Remnawave App** в UI, docs, письмах, TOTP/WebAuthn (вместо ShopBot / Remnawave Control).
- README: лицензия MIT (как в `LICENSE`); ссылка на `docs/DEVELOPER-SUPPORT.md`.
- Dock: «Поддержка разработчика» вместо «Dev Support».
- Developer Support: страница `/developer-support` скрыта от не-superadmin, когда функция выключена.
- Удалён неиспользуемый `DEVELOPER_SUPPORT_PAIRING_TTL_SEC` из compose/env.

---

## [1.0.1] — 2026-06-07

### Fixed

- **Restore PostgreSQL из бэкапа:** очистка схемы `public` перед replay; `pg_dump --clean --if-exists`; авто-подстановка мастер-пароля AES; реальные ошибки psql в панели и Telegram.

---

## 1.0.0 — 2026-06-04

Первый релиз публичного клиентского репозитория [remnawave-app](https://github.com/kissesses/remnawave-app).

- Telegram-магазин VPN и веб-панель для co-install с Remnawave Panel
- Developer Support (клиент): привязка панели и тикеты через внешний maintainer hub (`DEVELOPER_SUPPORT_HUB_URL`)
- Без раздела `/developer` и без встроенного Support Hub — maintainer-стек в приватном [rw-shop](https://github.com/kissesses/rw-shop)
