(function () {
    'use strict';

    const SOURCE_LABELS = {
        manual: 'Вручную',
        auto: 'Автобэкап',
        pre_restore: 'Pre-restore',
        telegram: 'Telegram',
        upload: 'Загрузка',
    };

    const SCOPE_LABELS = {
        database: 'База данных',
        files: 'Полный проект',
        full: 'БД + проект',
        remnawave: 'Remnawave Panel',
    };

    let cfg = {};
    let panelCfgRef = null;
    let allItems = [];
    let viewMode = 'grid';

    function getCsrf() {
        if (typeof window.getCsrfToken === 'function') return window.getCsrfToken();
        return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
            || document.querySelector('input[name="csrf_token"]')?.value || '';
    }

    async function fetchWithCsrf(url, options = {}, retried = false) {
        const headers = {
            ...(options.headers || {}),
            'X-CSRFToken': getCsrf(),
            'X-Requested-With': 'XMLHttpRequest',
        };
        const resp = await fetch(url, { ...options, headers, credentials: 'same-origin' });
        if (!retried && resp.status === 400) {
            try {
                const data = await resp.clone().json();
                if (data.error === 'csrf_expired' && typeof window.refreshCsrfToken === 'function') {
                    const ok = await window.refreshCsrfToken();
                    if (ok) return fetchWithCsrf(url, options, true);
                    window.showToast?.('warning', 'Сессия формы устарела. Обновите страницу (F5).');
                }
            } catch (_) { /* not JSON */ }
        }
        return resp;
    }

    function openModal(id) {
        if (typeof window.openModal === 'function') window.openModal(id);
        else document.getElementById(id)?.classList.add('open');
    }

    function closeModal(id) {
        if (typeof window.closeModal === 'function') window.closeModal(id);
        else document.getElementById(id)?.classList.remove('open');
    }

    function detailUrl(pCfg, name) {
        return (pCfg.detailUrl || '') + encodeURIComponent(name) + '.json';
    }

    function downloadUrl(pCfg, name) {
        return (pCfg.downloadUrlBase || '') + encodeURIComponent(name);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderArchiveCard(b, isFirst) {
        const src = b.source || 'manual';
        const srcLabel = b.source_label || SOURCE_LABELS[src] || src;
        const scope = b.scope || 'database';
        const scopeLabel = b.scope_label || SCOPE_LABELS[scope] || scope;
        const enc = b.encrypted ? '<span class="bv-lock-badge" title="AES-256"><span class="material-symbols-outlined">lock</span></span>' : '';
        return `
            <button type="button" class="backups-archive-card" data-backup-name="${escapeHtml(b.name)}"
                data-source="${escapeHtml(src)}" data-scope="${escapeHtml(scope)}"
                data-size="${Number(b.size) || 0}" data-mtime="${Number(b.mtime) || 0}"
                data-note="${escapeHtml(b.note || '')}" data-encrypted="${b.encrypted ? '1' : '0'}">
                <div class="backups-archive-card__head">
                    <span class="backups-archive-card__badge backups-archive-card__badge--scope-${escapeHtml(scope)}">${escapeHtml(scopeLabel)}</span>
                    <span class="backups-archive-card__badge backups-archive-card__badge--${escapeHtml(src)}">${escapeHtml(srcLabel)}</span>
                    ${enc}
                    ${isFirst ? '<span class="backups-badge-new">Новый</span>' : ''}
                </div>
                <p class="backups-archive-card__name">${escapeHtml(b.name)}</p>
                ${b.note ? `<p class="backups-archive-card__note">${escapeHtml(b.note)}</p>` : ''}
                <p class="backups-archive-card__meta">${escapeHtml(b.modified)} · ${escapeHtml(b.size_human)}</p>
            </button>`;
    }

    function bindArchiveCards(root, pCfg) {
        root.querySelectorAll('.backups-archive-card').forEach((card) => {
            card.addEventListener('click', () => openDetailModal(pCfg, card.dataset.backupName));
        });
    }

    function renderScopeBar(byScope) {
        const bar = document.getElementById('bv-scope-bar');
        if (!bar) return;
        if (!byScope || !Object.keys(byScope).length) {
            bar.innerHTML = '';
            return;
        }
        bar.innerHTML = Object.entries(byScope).map(([scope, count]) => {
            const label = SCOPE_LABELS[scope] || scope;
            return `<span class="bv-scope-chip bv-scope-chip--${escapeHtml(scope)}">${escapeHtml(label)}: <strong>${count}</strong></span>`;
        }).join('');
    }

    function updateNextAutobackup(summary) {
        const el = document.getElementById('bv-health-next');
        const c = summary?.config || cfg;
        if (!el) return;
        if (!c || !c.interval_days || c.interval_days <= 0) {
            el.textContent = '—';
            return;
        }
        const latest = summary?.latest_mtime;
        if (!latest) {
            el.textContent = 'ожидает';
            return;
        }
        const nextMs = (Number(latest) * 1000) + c.interval_days * 86400000;
        const diff = nextMs - Date.now();
        if (diff <= 0) {
            el.textContent = 'скоро';
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        el.textContent = days > 0 ? `~${days} дн.` : `~${hours} ч.`;
    }

    function updateDeliveryAlert(config) {
        const el = document.getElementById('backups-delivery-alert');
        if (!el || !config) return;
        if (config.autobackup_delivery_blocked && config.delivery_alerts?.length) {
            el.classList.remove('hidden', 'backups-delivery-alert--warn');
            const list = config.delivery_alerts.map((m) => `<li>${escapeHtml(m)}</li>`).join('');
            el.innerHTML = `
                <span class="material-symbols-outlined">warning</span>
                <div>
                    <strong>Автобэкап в Telegram не будет выполняться</strong>
                    <ul class="backups-delivery-alert__list">${list}</ul>
                </div>`;
            el.style.display = '';
        } else if (config.autobackup_telegram && config.interval_days > 0 && !config.archive_channel_configured) {
            el.classList.add('backups-delivery-alert--warn');
            el.style.display = '';
        } else if (el.dataset.staticAlert !== '1') {
            el.style.display = 'none';
        }
    }

    function updateStats(summary) {
        if (!summary) return;
        const countEl = document.getElementById('backups-stat-count');
        const sizeEl = document.getElementById('backups-stat-size');
        const latestEl = document.getElementById('backups-stat-latest');
        const encEl = document.getElementById('backups-stat-encrypted');
        const autobackupText = document.getElementById('backups-stat-autobackup-text');
        const autobackupCard = document.getElementById('backups-stat-autobackup');
        const healthAutobackup = document.getElementById('bv-health-autobackup');

        if (countEl) countEl.textContent = summary.count ?? '0';
        if (sizeEl) sizeEl.textContent = summary.total_human ?? '—';
        if (latestEl) latestEl.textContent = summary.latest_modified || '—';
        if (encEl) encEl.textContent = summary.encrypted_count ?? '0';

        if (summary.config) cfg = summary.config;
        updateDeliveryAlert(summary.config);
        renderScopeBar(summary.by_scope);
        updateNextAutobackup(summary);

        const days = cfg.interval_days;
        if (autobackupText && days !== undefined) {
            autobackupText.textContent = days > 0 ? `${days} дн.` : 'Выключен';
            autobackupCard?.classList.toggle('backups-stat-card--ok', days > 0);
            autobackupCard?.classList.toggle('backups-stat-card--off', days <= 0);
        }
        if (healthAutobackup) {
            healthAutobackup.textContent = days > 0 ? `${days} дн.` : 'Выкл';
            const wrap = healthAutobackup.closest('.bv-health__item');
            wrap?.classList.toggle('bv-health__item--ok', days > 0);
            wrap?.classList.toggle('bv-health__item--off', days <= 0);
        }
    }

    function getFilterState() {
        return {
            q: (document.getElementById('bv-archive-search')?.value || '').trim().toLowerCase(),
            scope: document.getElementById('bv-filter-scope')?.value || '',
            source: document.getElementById('bv-filter-source')?.value || '',
            sort: document.getElementById('bv-sort')?.value || 'newest',
        };
    }

    function filterAndSortItems(items) {
        const { q, scope, source, sort } = getFilterState();
        let list = [...items];
        if (scope) list = list.filter((b) => (b.scope || 'database') === scope);
        if (source) list = list.filter((b) => (b.source || 'manual') === source);
        if (q) {
            list = list.filter((b) => {
                const hay = `${b.name} ${b.note || ''}`.toLowerCase();
                return hay.includes(q);
            });
        }
        list.sort((a, b) => {
            const ma = Number(a.mtime) || 0;
            const mb = Number(b.mtime) || 0;
            const sa = Number(a.size) || 0;
            const sb = Number(b.size) || 0;
            switch (sort) {
                case 'oldest': return ma - mb;
                case 'size_desc': return sb - sa;
                case 'size_asc': return sa - sb;
                default: return mb - ma;
            }
        });
        return list;
    }

    function renderTimeline(items, pCfg) {
        const groups = new Map();
        items.forEach((b) => {
            const key = (b.modified || '').split(' ')[0] || 'Без даты';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(b);
        });
        let html = '<div class="bv-timeline">';
        groups.forEach((groupItems, title) => {
            html += `<div class="bv-timeline__group"><p class="bv-timeline__group-title">${escapeHtml(title)}</p><div class="bv-timeline__items">`;
            groupItems.forEach((b, i) => {
                html += renderArchiveCard(b, i === 0 && items[0]?.name === b.name);
            });
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }

    function renderList(items, pCfg) {
        const root = document.getElementById('backups-list-root');
        const select = document.getElementById('restore-existing-select');
        const meta = document.getElementById('bv-list-meta');
        if (!root) return;

        allItems = items || [];
        const filtered = filterAndSortItems(allItems);

        if (meta) {
            if (!allItems.length) {
                meta.classList.add('hidden');
            } else {
                meta.classList.remove('hidden');
                meta.textContent = filtered.length === allItems.length
                    ? `Показано ${filtered.length} архивов`
                    : `Показано ${filtered.length} из ${allItems.length}`;
            }
        }

        if (!filtered.length) {
            const emptyMsg = allItems.length ? 'Нет архивов по фильтру' : 'Архивов пока нет';
            root.innerHTML = `
                <div class="backups-empty-state bv-empty" id="backups-empty-state">
                    <div class="bv-empty__icon"><span class="material-symbols-outlined">${allItems.length ? 'filter_alt_off' : 'cloud_off'}</span></div>
                    <p>${emptyMsg}</p>
                    <span>${allItems.length ? 'Сбросьте фильтры или измените поиск' : 'Создайте первый бэкап'}</span>
                    ${!allItems.length ? `
                    <div class="bv-quick-create">
                        <button type="button" class="bv-quick-create__btn" data-bv-quick-scope="database"><span class="material-symbols-outlined">database</span> БД</button>
                        <button type="button" class="bv-quick-create__btn" data-bv-quick-scope="full"><span class="material-symbols-outlined">deployed_code</span> Полный</button>
                        <button type="button" class="bv-quick-create__btn" data-bv-quick-scope="remnawave"><span class="material-symbols-outlined">dns</span> Remnawave</button>
                    </div>` : ''}
                </div>`;
            bindQuickCreate(root, pCfg);
            if (select) select.innerHTML = '<option value="">— Выберите архив —</option>';
            return;
        }

        let inner;
        if (viewMode === 'timeline') {
            inner = renderTimeline(filtered, pCfg);
        } else {
            const gridClass = viewMode === 'list' ? 'backups-grid bv-view-list' : 'backups-grid';
            inner = `<div class="${gridClass}" id="backups-grid">${filtered.map((b, i) => renderArchiveCard(b, i === 0)).join('')}</div>`;
        }
        root.innerHTML = inner;
        bindArchiveCards(root, pCfg);
        bindQuickCreate(root, pCfg);

        if (select) {
            select.innerHTML = '<option value="">— Выберите архив —</option>'
                + allItems.map((b) => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join('');
        }
    }

    function bindQuickCreate(root, pCfg) {
        root.querySelectorAll('[data-bv-quick-scope]').forEach((btn) => {
            btn.addEventListener('click', () => runQuickCreate(btn.dataset.bvQuickScope, pCfg));
        });
    }

    async function runQuickCreate(scope, pCfg) {
        if (!scope || !pCfg) return;
        const note = 'Быстрое создание';
        try {
            const resp = await fetchWithCsrf(pCfg.createUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note, scope }),
            });
            const data = await resp.json();
            if (data.ok) {
                window.showToast?.('success', data.message || 'Создано');
                await refreshList(pCfg);
                if (data.name) openDetailModal(pCfg, data.name);
            } else {
                window.showToast?.('danger', data.error || 'Ошибка');
            }
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        }
    }

    async function refreshList(pCfg) {
        const loading = document.getElementById('backups-list-loading');
        loading?.classList.remove('hidden');
        try {
            const resp = await fetch(pCfg.listUrl, { credentials: 'same-origin' });
            const data = await resp.json();
            if (data.ok) {
                const summary = { ...data.summary, config: data.config || data.summary?.config };
                renderList(data.items || [], pCfg);
                updateStats(summary);
            }
        } catch (_) {
            window.showToast?.('danger', 'Не удалось обновить список');
        } finally {
            loading?.classList.add('hidden');
        }
    }

    function renderDetailBody(item) {
        const valid = item.valid ? 'Да' : 'Нет';
        const sqlFiles = (item.sql_files || []).join(', ') || '—';
        const roots = (item.file_roots || []).join(', ') || '—';
        const filesCount = item.files_count || (item.manifest?.files?.file_count) || 0;
        return `
            <div class="backups-detail-grid">
                <div><span class="backups-detail-label">Состав</span><strong>${escapeHtml(item.scope_label)}</strong></div>
                <div><span class="backups-detail-label">Источник</span><strong>${escapeHtml(item.source_label)}</strong></div>
                <div><span class="backups-detail-label">Размер</span><strong>${escapeHtml(item.size_human)}</strong></div>
                <div><span class="backups-detail-label">Валидность</span><strong>${valid}</strong></div>
            </div>
            ${item.note ? `<p class="backups-detail-note"><span class="backups-detail-label">Заметка</span> ${escapeHtml(item.note)}</p>` : ''}
            ${item.includes_database ? `<p class="backups-detail-preview"><span class="backups-detail-label">SQL</span> ${escapeHtml(sqlFiles)}</p>` : ''}
            ${item.includes_files ? `<p class="backups-detail-preview"><span class="backups-detail-label">Файлы</span> ${filesCount} шт. (${escapeHtml(roots)})</p>` : ''}
            ${item.includes_remnawave ? `<p class="backups-detail-preview"><span class="backups-detail-label">Remnawave</span> ${escapeHtml((item.remnawave_info?.compose_dir) || (item.manifest?.remnawave?.compose_dir) || '—')}</p>` : ''}
            ${item.encrypted ? '<p class="backups-detail-preview"><span class="backups-detail-label">Шифрование</span> AES-256</p>' : ''}
        `;
    }

    function applyRestoreOptions(item) {
        const dbCb = document.querySelector('#backups-restore-form input[name="restore_database"][type="checkbox"]');
        const filesCb = document.querySelector('#backups-restore-form input[name="restore_files"][type="checkbox"]');
        const rwCb = document.querySelector('#backups-restore-form input[name="restore_remnawave"][type="checkbox"]');
        if (dbCb) {
            dbCb.checked = !!item.includes_database;
            dbCb.disabled = !item.includes_database;
        }
        if (filesCb) {
            filesCb.checked = !!item.includes_files;
            filesCb.disabled = !item.includes_files;
        }
        if (rwCb) {
            rwCb.checked = !!item.includes_remnawave;
            rwCb.disabled = !item.includes_remnawave;
        }
    }

    function setRestoreOptionsForItem(item) {
        applyRestoreOptions(item);
        document.querySelector('[data-bv-target="restore"]')?.click();
    }

    function renderDetailActions(pCfg, name) {
        return `
            <a href="${downloadUrl(pCfg, name)}" class="backups-btn backups-btn--ghost">
                <span class="material-symbols-outlined">download</span> Скачать
            </a>
            <button type="button" class="backups-btn backups-btn--ghost" data-action="duplicate" data-name="${escapeHtml(name)}">
                <span class="material-symbols-outlined">content_copy</span> Копия
            </button>
            <button type="button" class="backups-btn backups-btn--telegram" data-action="telegram" data-name="${escapeHtml(name)}">
                <span class="material-symbols-outlined">send</span> Telegram
            </button>
            <button type="button" class="backups-btn backups-btn--ghost" data-action="restore" data-name="${escapeHtml(name)}">
                <span class="material-symbols-outlined">settings_backup_restore</span> Восстановить
            </button>
            <button type="button" class="backups-btn backups-btn--danger" data-action="delete" data-name="${escapeHtml(name)}">
                <span class="material-symbols-outlined">delete</span> Удалить
            </button>
        `;
    }

    async function openDetailModal(pCfg, name) {
        if (!name) return;
        const title = document.getElementById('backup-detail-title');
        const sub = document.getElementById('backup-detail-sub');
        const body = document.getElementById('backup-detail-body');
        const actions = document.getElementById('backup-detail-actions');
        if (title) title.textContent = name;
        if (sub) sub.textContent = 'Загрузка…';
        if (body) body.innerHTML = '<p class="backups-detail-loading">Загрузка…</p>';
        if (actions) actions.innerHTML = '';
        openModal('backupDetailModal');

        try {
            const resp = await fetch(detailUrl(pCfg, name), { credentials: 'same-origin' });
            const data = await resp.json();
            if (!data.ok || !data.item) {
                if (body) body.innerHTML = '<p class="backups-detail-loading">Архив не найден</p>';
                return;
            }
            const item = data.item;
            if (sub) sub.textContent = `${item.source_label} · ${item.modified}`;
            if (body) body.innerHTML = renderDetailBody(item);
            applyRestoreOptions(item);
            const hidden = document.getElementById('restore-existing-hidden');
            const select = document.getElementById('restore-existing-select');
            if (select) select.value = name;
            if (hidden) hidden.value = name;
            if (actions) {
                actions.innerHTML = renderDetailActions(pCfg, name);
                actions.querySelectorAll('[data-action]').forEach((btn) => {
                    btn.addEventListener('click', () => handleDetailAction(pCfg, btn));
                });
            }
        } catch (_) {
            if (body) body.innerHTML = '<p class="backups-detail-loading">Ошибка загрузки</p>';
        }
    }

    async function handleDetailAction(pCfg, btn) {
        const action = btn.dataset.action;
        const name = btn.dataset.name;
        if (!name) return;

        if (action === 'restore') {
            const select = document.getElementById('restore-existing-select');
            const hidden = document.getElementById('restore-existing-hidden');
            const fileInput = document.getElementById('backups-file-input');
            if (select) select.value = name;
            if (hidden) hidden.value = name;
            if (fileInput) fileInput.value = '';
            fetch(detailUrl(pCfg, name))
                .then((r) => r.json())
                .then((data) => { if (data.ok && data.item) setRestoreOptionsForItem(data.item); })
                .catch(() => {});
            closeModal('backupDetailModal');
            document.getElementById('backups-restore-submit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.showToast?.('success', `Выбран архив ${name}`);
            return;
        }

        if (action === 'delete') {
            if (!confirm(pCfg.deleteConfirm || 'Удалить?')) return;
            btn.disabled = true;
            try {
                const fd = new FormData();
                fd.append('csrf_token', getCsrf());
                fd.append('name', name);
                const resp = await fetchWithCsrf(pCfg.deleteUrl, { method: 'POST', body: fd });
                const data = await resp.json();
                if (data.ok) {
                    window.showToast?.('success', data.message || 'Удалено');
                    closeModal('backupDetailModal');
                    await refreshList(pCfg);
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка');
                }
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
            return;
        }

        if (action === 'duplicate') {
            btn.disabled = true;
            try {
                const resp = await fetchWithCsrf(pCfg.duplicateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                const data = await resp.json();
                if (data.ok) {
                    window.showToast?.('success', data.message || 'Копия создана');
                    await refreshList(pCfg);
                    if (data.name) openDetailModal(pCfg, data.name);
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка');
                }
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
            return;
        }

        if (action === 'telegram') {
            btn.disabled = true;
            try {
                const resp = await fetchWithCsrf(pCfg.telegramUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                const data = await resp.json();
                if (data.ok) window.showToast?.('success', data.message || 'Отправлено');
                else window.showToast?.('danger', data.error || 'Ошибка');
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
        }
    }

    function initNav() {
        const nav = document.querySelector('[data-bv-nav]');
        if (!nav) return;
        nav.querySelectorAll('[data-bv-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-bv-target');
                nav.querySelectorAll('.bv-nav__btn').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                    b.removeAttribute('aria-current');
                });
                btn.setAttribute('aria-current', 'page');
                document.querySelectorAll('[data-bv-panel]').forEach((panel) => {
                    panel.classList.toggle('is-active', panel.getAttribute('data-bv-panel') === target);
                });
            });
        });
    }

    function initToolbar(pCfg) {
        const rerender = () => renderList(allItems, pCfg);
        ['bv-archive-search', 'bv-filter-scope', 'bv-filter-source', 'bv-sort'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', rerender);
        });

        document.querySelectorAll('[data-bv-view]').forEach((btn) => {
            btn.addEventListener('click', () => {
                viewMode = btn.getAttribute('data-bv-view') || 'grid';
                document.querySelectorAll('[data-bv-view]').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                });
                rerender();
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === '/' && document.getElementById('bv-archive-search')) {
                e.preventDefault();
                document.getElementById('bv-archive-search').focus();
                document.querySelector('[data-bv-target="archives"]')?.click();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                openModal('backupCreateModal');
            }
        });
    }

    function initScopeBarFromPage() {
        const initial = {};
        document.querySelectorAll('.backups-archive-card').forEach((card) => {
            const sc = card.dataset.scope || 'database';
            initial[sc] = (initial[sc] || 0) + 1;
        });
        if (Object.keys(initial).length) renderScopeBar(initial);
    }

    function init(panelCfg) {
        cfg = panelCfg;
        panelCfgRef = panelCfg;

        document.querySelectorAll('[data-close-modal]').forEach((btn) => {
            btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
        });

        initNav();
        initToolbar(panelCfg);
        initScopeBarFromPage();

        const encCount = document.querySelectorAll('.backups-archive-card[data-encrypted="1"]').length;
        if (encCount) {
            const encEl = document.getElementById('backups-stat-encrypted');
            if (encEl && encEl.textContent === '0') encEl.textContent = String(encCount);
        }

        document.getElementById('backups-refresh-btn')?.addEventListener('click', () => refreshList(panelCfg));
        document.getElementById('backups-create-open')?.addEventListener('click', () => openModal('backupCreateModal'));

        document.getElementById('backup-create-confirm')?.addEventListener('click', async () => {
            const btn = document.getElementById('backup-create-confirm');
            const note = document.getElementById('backup-create-note')?.value?.trim() || '';
            const scope = document.querySelector('input[name="backup-create-scope"]:checked')?.value || 'database';
            btn.disabled = true;
            try {
                const resp = await fetchWithCsrf(panelCfg.createUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note, scope }),
                });
                const data = await resp.json();
                if (data.ok) {
                    window.showToast?.('success', data.message || 'Создано');
                    closeModal('backupCreateModal');
                    await refreshList(panelCfg);
                    if (data.name) openDetailModal(panelCfg, data.name);
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка');
                }
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
        });

        document.getElementById('backups-cleanup-btn')?.addEventListener('click', async () => {
            if (!confirm('Удалить лишние архивы сверх лимита хранения?')) return;
            const btn = document.getElementById('backups-cleanup-btn');
            btn.disabled = true;
            try {
                const resp = await fetchWithCsrf(panelCfg.cleanupUrl, { method: 'POST' });
                const data = await resp.json();
                if (data.ok) {
                    window.showToast?.('success', data.message || `Удалено: ${data.removed}`);
                    await refreshList(panelCfg);
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка');
                }
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
        });

        async function saveBackupSettings(e) {
            e.preventDefault();
            const form = document.getElementById('backups-settings-form');
            const payload = {
                backup_interval_days: form?.backup_interval_days?.value,
                backup_keep_count: form?.backup_keep_count?.value,
                backup_autobackup_telegram: form?.backup_autobackup_telegram?.checked ? '1' : '0',
                backup_compress_level: form?.backup_compress_level?.value,
                backup_autobackup_scope: form?.backup_autobackup_scope?.value,
                backup_include_env: form?.backup_include_env?.checked ? '1' : '0',
                backup_encrypt_enabled: form?.backup_encrypt_enabled?.checked ? '1' : '0',
                backup_password_mode: form?.backup_password_mode?.value,
                backup_master_password: form?.backup_master_password?.value,
                backup_remnawave_mode: document.querySelector('[name="backup_remnawave_mode"]')?.value,
                backup_remnawave_compose_dir: document.querySelector('[name="backup_remnawave_compose_dir"]')?.value,
                backup_remnawave_ssh_target: document.querySelector('[name="backup_remnawave_ssh_target"]')?.value,
                backup_remnawave_pg_service: document.querySelector('[name="backup_remnawave_pg_service"]')?.value,
                backup_remnawave_database_url: document.querySelector('[name="backup_remnawave_database_url"]')?.value,
            };
            try {
                const resp = await fetchWithCsrf(panelCfg.settingsUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await resp.json();
                if (data.ok) {
                    window.showToast?.('success', 'Настройки сохранены');
                    updateStats({
                        config: data.config,
                        count: document.getElementById('backups-stat-count')?.textContent,
                        total_human: document.getElementById('backups-stat-size')?.textContent,
                        latest_modified: document.getElementById('backups-stat-latest')?.textContent,
                        latest_mtime: allItems[0]?.mtime,
                        by_scope: allItems.reduce((acc, b) => {
                            const sc = b.scope || 'database';
                            acc[sc] = (acc[sc] || 0) + 1;
                            return acc;
                        }, {}),
                        encrypted_count: allItems.filter((b) => b.encrypted).length,
                    });
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка');
                }
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            }
        }

        document.getElementById('backups-settings-form')?.addEventListener('submit', saveBackupSettings);
        document.getElementById('backups-remnawave-form')?.addEventListener('submit', saveBackupSettings);

        const restoreForm = document.getElementById('backups-restore-form');
        const restoreSelect = document.getElementById('restore-existing-select');
        const restoreHidden = document.getElementById('restore-existing-hidden');
        const fileInput = document.getElementById('backups-file-input');
        const fileLabel = document.getElementById('backups-file-label');
        const dropZone = document.getElementById('backups-drop-zone');

        restoreForm?.addEventListener('submit', (ev) => {
            const fromSelect = restoreSelect?.value || '';
            const hasFile = fileInput?.files?.length;
            if (restoreHidden) restoreHidden.value = hasFile ? '' : fromSelect;
            if (!hasFile && !fromSelect) {
                ev.preventDefault();
                window.showToast?.('warning', 'Выберите архив или загрузите файл');
                return;
            }
            if (!confirm(panelCfg.restoreConfirm || 'Продолжить восстановление?')) {
                ev.preventDefault();
            }
        });

        restoreSelect?.addEventListener('change', async () => {
            if (fileInput && restoreSelect.value) {
                fileInput.value = '';
                if (fileLabel) fileLabel.textContent = '.zip или .sql';
            }
            const name = restoreSelect?.value || '';
            if (!name || !panelCfg.detailUrl) return;
            try {
                const resp = await fetch(detailUrl(panelCfg, name), { credentials: 'same-origin' });
                const data = await resp.json();
                if (data.ok && data.item) applyRestoreOptions(data.item);
            } catch (_) { /* keep current checkboxes */ }
        });

        fileInput?.addEventListener('change', () => {
            const name = fileInput.files?.[0]?.name;
            if (fileLabel) fileLabel.textContent = name || '.zip или .sql';
            if (restoreSelect && name) restoreSelect.value = '';
        });

        if (dropZone && fileInput) {
            ['dragenter', 'dragover'].forEach((ev) => {
                dropZone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    dropZone.classList.add('is-dragover');
                });
            });
            ['dragleave', 'drop'].forEach((ev) => {
                dropZone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('is-dragover');
                });
            });
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files;
                if (files?.length) {
                    fileInput.files = files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            });
            dropZone.addEventListener('click', (e) => {
                if (e.target === fileInput) return;
                fileInput.click();
            });
        }

        document.getElementById('backup-send-telegram-new')?.addEventListener('click', async function () {
            const btn = this;
            btn.disabled = true;
            try {
                const resp = await fetchWithCsrf(panelCfg.telegramUrl, { method: 'POST' });
                const data = await resp.json();
                if (data.ok) window.showToast?.('success', data.message || 'Отправлено');
                else window.showToast?.('danger', data.error || 'Ошибка');
            } catch (_) {
                window.showToast?.('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
        });

        if (panelCfg.initialSummary) {
            updateStats(panelCfg.initialSummary);
            if (panelCfg.initialSummary.config) cfg = panelCfg.initialSummary.config;
        }

        const root = document.getElementById('backups-list-root');
        if (root) {
            allItems = Array.from(root.querySelectorAll('.backups-archive-card')).map((card) => ({
                name: card.dataset.backupName,
                source: card.dataset.source,
                scope: card.dataset.scope,
                size: card.dataset.size,
                mtime: card.dataset.mtime,
                note: card.dataset.note,
                modified: card.querySelector('.backups-archive-card__meta')?.textContent?.split('·')[0]?.trim(),
                size_human: card.querySelector('.backups-archive-card__meta')?.textContent?.split('·')[1]?.trim(),
                encrypted: card.dataset.encrypted === '1',
            }));
            bindArchiveCards(root, panelCfg);
            bindQuickCreate(root, panelCfg);
        }
    }

    window.BackupsPanel = { init, refreshList, openDetailModal };
})();
