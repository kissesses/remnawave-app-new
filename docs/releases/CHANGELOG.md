# Changelog — Remnawave App

Публичный клиентский репозиторий: [kissesses/remnawave-app](https://github.com/kissesses/remnawave-app)  
Образ: `ghcr.io/kissesses/remnawave-app`

Формат: [FORMAT.md](./FORMAT.md) · Codenames: [CODENAMES.md](./CODENAMES.md)

---

## [1.0.5] — 2026-06-07 · Velvet Stitch

> **Velvet Stitch** — лента активности снова открывается без ошибки 500.

### EN

#### 🐛 Fixed

- **User activity timeline** — page no longer returns 500; common template context (`project_info`) is passed like on other panel routes

### RU

#### 🐛 Исправлено

- **Лента активности** — страница больше не отдаёт 500; передаётся общий контекст шаблона (`project_info`), как на остальных экранах панели

---

## [1.0.4] — 2026-06-07 · Chronicle Forge

> **Chronicle Forge** — первый клиентский релиз: лента, форум-уведомления и onboarding без maintainer-стека.

### EN

#### 🆕 Added

- **Activity feed** — per-user timeline with category filters, search, and JSON/CSV export
- **Forum notifications** — optional Telegram forum topics for panel audit events (admin actions)
- **Onboarding checklist** — dashboard wizard for first-time setup steps
- **WebApp auth** — Redis-backed one-time tokens (multi-worker safe)
- **Smoke tests** — pytest suite and CI workflow on `main`

#### ✨ Changed

- Referrals disabled by default for new installs; clearer SBP label in settings
- Autobackup summary on settings tab links to dedicated `/backups` page
- Default WebApp design includes `glass-hub`

#### 📚 Docs

- Advanced install notes in `INSTALL.md` and `RE-PANEL-INSTALL.md`

### RU

#### 🆕 Добавлено

- **Лента активности** — timeline пользователя с фильтрами, поиском и экспортом JSON/CSV
- **Уведомления в форум** — опциональные топики Telegram для audit-событий панели
- **Onboarding** — чеклист на дашборде для первичной настройки
- **WebApp auth** — одноразовые токены в Redis (корректно при нескольких воркерах)
- **Smoke-тесты** — pytest и CI на `main`

#### ✨ Изменено

- Рефералка выключена по умолчанию; подпись «СБП» в настройках
- Сводка автобэкапа на вкладке настроек ведёт на `/backups`
- В дефолтных дизайнах WebApp добавлен `glass-hub`

#### 📚 Документация

- Расширенные заметки по установке в `INSTALL.md` и `RE-PANEL-INSTALL.md`
