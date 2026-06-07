# Changelog

## [1.0.4] — 2026-06-07

### Added

- **Dashboard:** чеклист первого запуска (бот → хосты → платежи → тарифы → старт).
- **WebApp auth:** временные токены авторизации в Redis (fallback in-memory).
- **CI:** smoke-тесты (`tests/`) и workflow `.github/workflows/tests.yml`.

### Changed

- **User Timeline:** переименование UI в «Лента активности»; экспорт с учётом фильтров; timestamp trial из `vpn_keys`.
- **Уведомления:** audit → Telegram (`panel_audit_notify`), toggles SQL/db.query, RBAC create-topics.
- **Настройки:** единый default `enable_referrals=false`, подпись «СБП» для YooKassa, autobackup только в `/backups`, `glass-hub` в default WebApp designs.

### Docs

- `docs/INSTALL.md`: секция Advanced (Stealth, SQL, Node, RePanel).
- `docs/RE-PANEL-INSTALL.md`: пометка «не для shop-установки».

---

## [1.0.3] — 2026-06-07

### Security

- **TOTP при входе:** rate limit (5 попыток / 15 мин на IP+admin), сброс pending-сессии при блокировке.
- **SQL step-up TOTP:** rate limit на `/settings/database/stepup/totp`.
- **YooMoney OAuth:** `state` в сессии, `@login_required` на callback, проверка admin + `settings_payments: edit`, RBAC mapping.

### Added

- **RBAC:** синхронизация с rw-shop (view/edit, Superadmin protection, endpoint map, session refresh).
- **Telegram topic routing:** `telegram_notify`, UI в Настройки → Боты → Уведомления.
- **User Timeline:** лента активности пользователя (`/users/<id>/timeline`).

### Changed

- **Настройки:** единые иконки по темам (sidebar, sub-nav, section headers); Referrals и Content на общем `section_nav`; заголовки секций на classic/ios.
- **2FA / Security setup:** общие partials, toast fix, cancel TOTP login, macOS CSS.

### Docs

- `.env.example`: `SHOPBOT_SESSION_COOKIE_DOMAIN` для поддоменов.
- `docs/INSTALL.md`: заметка про cookie domain.

---

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
