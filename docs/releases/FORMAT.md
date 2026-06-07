# Формат релизов Remnawave App

Каждый тег `v*` на [remnawave-app](https://github.com/kissesses/remnawave-app) создаёт GitHub Release и (если настроены секреты) пост в Telegram.

## Именование обновлений (codename)

Каждое **глобальное** обновление получает **уникальное** образное имя на английском — например «Chronicle Forge», «Velvet Stitch», «Glass Meridian».

| Версия | Codename | Смысл |
|--------|----------|--------|
| 1.0.4 | Chronicle Forge | Лента, форум-уведомления, onboarding, Redis WebApp |
| 1.0.5 | Velvet Stitch | Hotfix: лента активности без 500 |

Полный реестр и правила уникальности: [CODENAMES.md](./CODENAMES.md).

## Заголовок версии

```markdown
## [1.0.5] — 2026-06-07 · Velvet Stitch
```

## Тело записи

Обязательны блоки **EN** и **RU**. Внутри — секции с эмодзи (как в Keep a Changelog):

| Секция EN | Секция RU | Эмодзи |
|-----------|-----------|--------|
| Added | Добавлено | 🆕 |
| Changed | Изменено | ✨ |
| Fixed | Исправлено | 🐛 |
| Removed | Удалено | 🗑️ |
| Security | Безопасность | 🔐 |

Пример:

```markdown
## [1.0.5] — 2026-06-07 · Velvet Stitch

> **Velvet Stitch** — лента активности снова открывается без ошибки 500.

### EN

#### 🐛 Fixed
- User timeline page returned 500 — missing `project_info` in template context

### RU

#### 🐛 Исправлено
- Страница «Лента активности» отдавала 500 — не передавался контекст шаблона (`project_info`)
```

## Workflow

1. Придумать **новый** codename → [CODENAMES.md](./CODENAMES.md).
2. Допишите секцию в [CHANGELOG.md](./CHANGELOG.md).
3. Закоммитьте и запушьте в `main` (`git push app main`).
4. Создайте и запушьте тег: `git tag v1.0.5 && git push app v1.0.5`
5. GitHub Actions:
   - **Release** — body из CHANGELOG (EN + RU, codename в заголовке)
   - **Docker** — образ `ghcr.io/kissesses/remnawave-app`
   - **Telegram** — если заданы секреты (см. ниже)

## Секреты GitHub (remnawave-app)

| Secret | Описание |
|--------|----------|
| `RELEASE_TELEGRAM_BOT_TOKEN` | Токен бота для анонсов |
| `RELEASE_TELEGRAM_CHAT_ID` | ID канала или группы (например `-100…`) |
| `RELEASE_TELEGRAM_THREAD_ID` | Опционально: топик форума |

Если секреты не заданы, шаг Telegram пропускается — релиз на GitHub всё равно создаётся.

## Commit messages

Для обычных коммитов достаточно короткого описания. Перед тегом сводите изменения в CHANGELOG — релиз читается из него, а не из git log.
