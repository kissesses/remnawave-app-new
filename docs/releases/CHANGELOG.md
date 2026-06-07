# Changelog — Remnawave App

Публичный клиентский репозиторий: [kissesses/remnawave-app](https://github.com/kissesses/remnawave-app)  
Образ: `ghcr.io/kissesses/remnawave-app`

Формат: [FORMAT.md](./FORMAT.md) · Codenames: [CODENAMES.md](./CODENAMES.md)

---

## [1.0.7] — 2026-06-07 · Amber Relay

> **Amber Relay** — главная без лагов: lite-оформление, отступы между блоками, лёгкие графики.

### EN

#### ✨ Changed

- **Dashboard lite mode** — replaced heavy premium layer (blur, ambient orbs, shine animations) with performance-first styling
- **Resource monitoring layout** — semantic blocks (`.dash-block`, `.dash-metric-grid`) with consistent `1.5rem` spacing
- **KPI cards** — solid surfaces with accent left border instead of gradient masks
- **Charts** — `fill: false`, `animation: false`, LTTB decimation; no gradient fills on line charts
- **Live updates** — removed fade transitions on stats refresh and progress-bar animations on monitor

#### 🐛 Fixed

- **Dashboard jank on macOS** — disabled `backdrop-filter` across the home page in lite mode

### RU

#### ✨ Изменено

- **Lite-режим главной** — вместо тяжёлого premium (blur, орбы, shine) — лёгкие стили без просадок FPS
- **Мониторинг ресурсов** — семантические блоки с отступами `1.5rem` между секциями
- **KPI-карточки** — сплошной фон и цветная полоска слева вместо gradient-рамок
- **Графики** — без заливки и анимации, decimation LTTB
- **Обновления данных** — без fade при refresh stats и без transition на progress-барах

#### 🐛 Исправлено

- **Лаги на MacBook** — отключён `backdrop-filter` на главной в lite-режиме

---

## [1.0.6] — 2026-06-07 · Glass Meridian

> **Glass Meridian** — главная страница получила premium-оформление и адаптацию под все макеты панели.

### EN

#### 🆕 Added

- **Dashboard themes** — per-design styling for Classic, macOS, macOS v2, Glass, and Stealth Admin (dark + light)
- **Premium home layer** — hero shell with ambient orbs, gradient title, live clock, KPI section header
- **KPI stat cards** — gradient borders, shine on hover, stagger entrance animation
- **Sliding tab indicator** — animated pill for Resources / Analytics / Activity tabs
- **Status chips** — pulsing online rings, icon capsules, responsive 2×2 grid on mobile
- **Onboarding progress bar** — visual completion tracker on first-run checklist

#### ✨ Changed

- Dashboard CSS moved to CSS variables (`--dash-*`) for consistent theming across widgets
- Topbar page title picks up `.dashboard-title` from theme manager
- Dashboard Studio preserves gradient title span when renaming the page

### RU

#### 🆕 Добавлено

- **Темы главной** — оформление под Classic, macOS, macOS v2, Glass и Stealth Admin (тёмная и светлая тема)
- **Premium-слой** — hero-блок с ambient-орбами, gradient-заголовок, живые часы, шапка KPI-зоны
- **KPI-карточки** — gradient-рамки, shine при hover, stagger-анимация появления
- **Скользящий индикатор вкладок** — анимированная pill для Ресурсы / Аналитика / Активность
- **Статус-чипы** — пульсирующие кольца «В сети», иконки в capsule, сетка 2×2 на мобиле
- **Progress-bar онбординга** — полоска прогресса в чеклисте первого запуска

#### ✨ Изменено

- CSS главной переведён на переменные (`--dash-*`) для единого стиля виджетов
- Заголовок в topbar берётся из `.dashboard-title` через theme manager
- Dashboard Studio сохраняет gradient-заголовок при переименовании страницы

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
