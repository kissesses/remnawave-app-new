(function () {
    'use strict';

    const cfg = window.DATABASE_PANEL || {};
    const csrf = cfg.csrfToken || document.querySelector('meta[name="csrf-token"]')?.content || '';

    const state = {
        source: cfg.currentSource || 'shopbot',
        workspace: 'overview',
        tables: [],
        modal: {
            table: null,
            detail: null,
            browse: null,
            page: 1,
            selected: new Set(),
        },
    };

    function toast(msg, ok) {
        if (typeof window.showToast === 'function') {
            window.showToast(ok ? 'success' : 'danger', msg);
        }
    }

    function showStepupError(msg) {
        const el = document.getElementById('db-stepup-error');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-CSRFToken': csrf,
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            body: JSON.stringify(Object.assign({ csrf_token: csrf }, body || {})),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
            throw new Error(data.error || data.message || 'Ошибка запроса');
        }
        return data;
    }

    async function getJson(url) {
        const res = await fetch(url, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
            throw new Error(data.error || data.message || 'Ошибка запроса');
        }
        return data;
    }

    function sourceQuery() {
        return `source=${encodeURIComponent(state.source)}`;
    }

    function base64urlToBuffer(base64url) {
        const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        return buf.buffer;
    }

    function bufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function prepareRequestOptions(options) {
        const pubKey = Object.assign({}, options);
        pubKey.challenge = base64urlToBuffer(pubKey.challenge);
        if (Array.isArray(pubKey.allowCredentials)) {
            pubKey.allowCredentials = pubKey.allowCredentials.map((c) => (
                Object.assign({}, c, { id: base64urlToBuffer(c.id) })
            ));
        }
        return pubKey;
    }

    function serializeCredential(credential) {
        const response = credential.response;
        return {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: bufferToBase64url(response.clientDataJSON),
                authenticatorData: bufferToBase64url(response.authenticatorData),
                signature: bufferToBase64url(response.signature),
                userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
            },
        };
    }

    async function passkeyStepup() {
        if (!window.PublicKeyCredential) {
            showStepupError('Passkey не поддерживается в этом браузере');
            return;
        }
        showStepupError('');
        const btn = document.getElementById('db-stepup-passkey-btn');
        if (btn) btn.disabled = true;
        try {
            const begin = await postJson('/settings/database/stepup/passkey/options', {});
            const pubKey = prepareRequestOptions(begin.options);
            const credential = await navigator.credentials.get({ publicKey: pubKey });
            await postJson('/settings/database/stepup/passkey/verify', {
                credential: serializeCredential(credential),
            });
            window.location.reload();
        } catch (e) {
            showStepupError(e.message || 'Passkey не принят');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function onTelegramStepup(user) {
        showStepupError('');
        try {
            await postJson('/settings/database/stepup/telegram', user);
            window.location.reload();
        } catch (e) {
            showStepupError(e.message || 'Telegram не принят');
        }
    }

    window.onDatabaseTelegramStepup = onTelegramStepup;

    function formatRemaining(sec) {
        const s = Math.max(0, Math.floor(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    function initStepupGate() {
        const totpForm = document.getElementById('db-stepup-totp-form');
        totpForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            showStepupError('');
            const code = document.getElementById('db-stepup-totp-code')?.value?.trim();
            if (!code) return;
            try {
                await postJson('/settings/database/stepup/totp', { code });
                window.location.reload();
            } catch (err) {
                showStepupError(err.message || 'Неверный код');
            }
        });

        document.getElementById('db-stepup-passkey-btn')?.addEventListener('click', passkeyStepup);

        const tgWrap = document.getElementById('db-stepup-telegram-wrap');
        if (tgWrap && cfg.telegramBotUsername) {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://telegram.org/js/telegram-widget.js?22';
            script.setAttribute('data-telegram-login', cfg.telegramBotUsername);
            script.setAttribute('data-size', 'medium');
            script.setAttribute('data-onauth', 'onDatabaseTelegramStepup(user)');
            script.setAttribute('data-request-access', 'write');
            tgWrap.appendChild(script);
        }
    }

    function setOverviewError(msg) {
        const el = document.getElementById('db-overview-error');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
    }

    function applyOverview(overview, source) {
        if (!overview) return;
        const label = overview.source_label || (source === 'remnawave' ? 'Remnawave Panel' : 'ShopBot');
        document.getElementById('db-source-caption')?.replaceChildren(document.createTextNode(label));
        document.getElementById('db-maint-source')?.replaceChildren(document.createTextNode(label));

        const status = document.getElementById('db-overview-status');
        if (status) {
            const setField = (name, text) => {
                const el = status.querySelector(`[data-field="${name}"]`);
                if (el) el.textContent = text;
            };
            setField('engine', overview.engine || '—');
            setField('connected', overview.connected ? 'OK' : 'Ошибка');
            setField('connection_mode', overview.connection_mode || '—');
            setField('db_name', overview.db_name || '—');
            setField('db_size_label', overview.db_size_label || '—');
            setField('table_rows_total', String(overview.table_rows_total ?? 0));
            const pgRow = status.querySelector('[data-row="postgres_version"]');
            const pgVal = overview.postgres_version || '';
            if (pgRow) {
                pgRow.classList.toggle('hidden', !pgVal);
                setField('postgres_version', pgVal);
            }
        }

        const tablesEl = document.getElementById('db-overview-tables');
        if (tablesEl) {
            tablesEl.innerHTML = '';
            const tables = overview.tables || [];
            if (!tables.length) {
                const row = document.createElement('div');
                row.className = 'settings-macos-row settings-macos-row--info db-panel__empty-tables';
                const val = document.createElement('span');
                val.className = 'settings-macos-row__value';
                val.textContent = 'Нет данных';
                row.appendChild(val);
                tablesEl.appendChild(row);
            } else {
                tables.forEach((t) => {
                    const row = document.createElement('div');
                    row.className = 'settings-macos-row settings-macos-row--info';
                    const title = document.createElement('span');
                    title.className = 'settings-macos-row__title';
                    title.textContent = t.label || t.id || '—';
                    const value = document.createElement('span');
                    value.className = 'settings-macos-row__value db-panel__mono';
                    value.textContent = String(t.rows ?? 0);
                    row.append(title, value);
                    tablesEl.appendChild(row);
                });
            }
        }

        setOverviewError(overview.error || '');
        const rwHint = document.getElementById('db-rw-hint');
        if (rwHint) {
            const show = source === 'remnawave' && overview.configured === false;
            rwHint.classList.toggle('hidden', !show);
        }
        document.getElementById('db-backups-group')?.classList.toggle('hidden', source === 'remnawave');
    }

    function setActiveSource(source) {
        document.querySelectorAll('.db-panel__source-btn').forEach((btn) => {
            const active = btn.dataset.source === source;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.getElementById('db-panel-unlocked')?.setAttribute('data-source', source);
    }

    function switchWorkspace(name) {
        state.workspace = name;
        document.querySelectorAll('.db-panel__workspace-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.workspace === name);
        });
        document.querySelectorAll('.db-panel__workspace').forEach((panel) => {
            const active = panel.dataset.workspace === name;
            panel.classList.toggle('hidden', !active);
            panel.classList.toggle('is-active', active);
        });
        if (name === 'tables') loadTables();
        if (name === 'maintenance') loadConnStats();
    }

    async function switchSource(source) {
        if (!source || source === state.source) return;
        setActiveSource(source);
        state.source = source;
        setOverviewError('');
        document.querySelectorAll('.db-panel__source-btn').forEach((b) => { b.disabled = true; });
        try {
            const data = await postJson('/settings/database/source', { source });
            state.source = data.source || source;
            applyOverview(data.overview, state.source);
            if (state.workspace === 'tables') await loadTables();
            if (state.workspace === 'maintenance') await loadConnStats();
        } catch (e) {
            setActiveSource(state.source);
            setOverviewError(e.message || 'Не удалось переключить базу');
        } finally {
            document.querySelectorAll('.db-panel__source-btn').forEach((b) => { b.disabled = false; });
        }
    }

    async function loadTables() {
        const list = document.getElementById('db-tables-list');
        if (!list) return;
        list.innerHTML = '<div class="settings-macos-row settings-macos-row--info"><span class="settings-macos-row__value">Загрузка…</span></div>';
        try {
            const data = await getJson(`/settings/database/tables.json?${sourceQuery()}`);
            state.tables = data.tables || [];
            renderTablesList(document.getElementById('db-table-search')?.value || '');
        } catch (e) {
            list.innerHTML = `<div class="settings-macos-row settings-macos-row--info"><span class="settings-macos-row__value">${e.message}</span></div>`;
        }
    }

    function renderTablesList(filter) {
        const list = document.getElementById('db-tables-list');
        if (!list) return;
        const q = (filter || '').trim().toLowerCase();
        const items = state.tables.filter((t) => {
            if (!q) return true;
            return (t.id || '').toLowerCase().includes(q) || (t.label || '').toLowerCase().includes(q);
        });
        list.innerHTML = '';
        if (!items.length) {
            list.innerHTML = '<div class="settings-macos-row settings-macos-row--info db-panel__empty-tables"><span class="settings-macos-row__value">Нет таблиц</span></div>';
            return;
        }
        items.forEach((t) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'settings-macos-row settings-macos-row--link db-panel__table-row';
            row.innerHTML = `
                <span class="settings-macos-row__body">
                    <span class="settings-macos-row__title db-panel__mono">${t.id}${t.protected ? ' <span class="db-panel__badge">без удаления</span>' : ''}</span>
                    <span class="settings-macos-row__sub">${t.label || t.id} · ${t.rows ?? 0} строк · ${t.size_label || '—'}</span>
                </span>
                <span class="material-symbols-outlined settings-macos-row__chevron">chevron_right</span>`;
            row.addEventListener('click', () => openTableModal(t.id));
            list.appendChild(row);
        });
    }

    function renderGrid(tableEl, columns, rows, options) {
        if (!tableEl) return;
        const thead = tableEl.querySelector('thead');
        const tbody = tableEl.querySelector('tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';
        if (!columns.length) return;

        const headRow = document.createElement('tr');
        if (options?.selectable) {
            const th = document.createElement('th');
            th.textContent = '☑';
            headRow.appendChild(th);
        }
        columns.forEach((col) => {
            const th = document.createElement('th');
            th.textContent = col;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        rows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            if (options?.selectable) {
                const td = document.createElement('td');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.rowIdx = String(idx);
                cb.checked = state.modal.selected.has(idx);
                cb.addEventListener('change', () => {
                    if (cb.checked) state.modal.selected.add(idx);
                    else state.modal.selected.delete(idx);
                    updateDeleteButton();
                });
                td.appendChild(cb);
                tr.appendChild(td);
            }
            columns.forEach((col) => {
                const td = document.createElement('td');
                const val = row[col];
                td.textContent = val === null || val === undefined ? 'NULL' : String(val);
                td.title = td.textContent;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    function updateDeleteButton() {
        const btn = document.getElementById('db-table-delete-rows');
        if (!btn) return;
        const detail = state.modal.detail;
        const can = detail?.can_delete && !detail?.protected && state.modal.selected.size > 0;
        btn.disabled = !can;
    }

    function closeTableModal() {
        document.getElementById('db-table-modal')?.classList.add('hidden');
        state.modal = { table: null, detail: null, browse: null, page: 1, selected: new Set() };
    }

    async function loadTablePage(page) {
        if (!state.modal.table) return;
        state.modal.page = page;
        state.modal.selected.clear();
        updateDeleteButton();
        const grid = document.getElementById('db-table-grid');
        if (grid) grid.closest('.db-panel__grid-wrap')?.classList.add('is-loading');
        try {
            const data = await getJson(
                `/settings/database/tables/${encodeURIComponent(state.modal.table)}.json?${sourceQuery()}&page=${page}&limit=50`,
            );
            state.modal.detail = data.detail;
            state.modal.browse = data.browse;
            const browse = data.browse || {};
            const cols = browse.rows?.length
                ? Object.keys(browse.rows[0])
                : (browse.column_names || data.detail?.columns?.map((c) => c.name) || []);
            document.getElementById('db-table-modal-title').textContent = data.detail?.table || state.modal.table;
            document.getElementById('db-table-modal-sub').textContent =
                `${data.detail?.rows ?? 0} строк · ${data.detail?.size_label || '—'}${data.detail?.protected ? ' · без удаления' : ''}`;
            document.getElementById('db-table-page-label').textContent = `${browse.page || 1} / ${browse.pages || 1}`;
            document.getElementById('db-table-prev').disabled = (browse.page || 1) <= 1;
            document.getElementById('db-table-next').disabled = (browse.page || 1) >= (browse.pages || 1);
            document.getElementById('db-table-truncate').disabled = !data.detail?.can_truncate;
            document.getElementById('db-table-delete-rows').disabled = true;
            renderGrid(document.getElementById('db-table-grid'), cols, browse.rows || [], {
                selectable: Boolean(data.detail?.can_delete && !data.detail?.protected),
            });
        } catch (e) {
            toast(e.message || 'Ошибка загрузки', false);
        } finally {
            grid?.closest('.db-panel__grid-wrap')?.classList.remove('is-loading');
        }
    }

    function openTableModal(tableName) {
        state.modal.table = tableName;
        state.modal.page = 1;
        state.modal.selected.clear();
        document.getElementById('db-table-modal')?.classList.remove('hidden');
        loadTablePage(1);
    }

    async function deleteSelectedRows() {
        const detail = state.modal.detail;
        const browse = state.modal.browse;
        if (!detail || !browse || !state.modal.selected.size) return;
        const pk = detail.primary_key || [];
        if (!pk.length) return;
        if (!window.confirm(`Удалить ${state.modal.selected.size} строк(и)?`)) return;

        const keys = [];
        state.modal.selected.forEach((idx) => {
            const row = browse.rows[idx];
            if (!row) return;
            const key = {};
            pk.forEach((col) => { key[col] = row[col]; });
            keys.push(key);
        });

        try {
            const data = await postJson(
                `/settings/database/tables/${encodeURIComponent(state.modal.table)}/delete`,
                { source: state.source, keys },
            );
            toast(data.message || 'Удалено', true);
            await loadTablePage(state.modal.page);
            await loadTables();
        } catch (e) {
            toast(e.message || 'Ошибка', false);
        }
    }

    async function truncateCurrentTable() {
        const table = state.modal.table;
        if (!table) return;
        const confirm = window.prompt(`Введите TRUNCATE ${table} для подтверждения:`);
        if (!confirm) return;
        try {
            const data = await postJson(
                `/settings/database/tables/${encodeURIComponent(table)}/truncate`,
                { source: state.source, confirm },
            );
            toast(data.message || 'Готово', true);
            closeTableModal();
            await loadTables();
            const overview = await getJson(`/settings/database/info.json?${sourceQuery()}`);
            applyOverview(overview.overview, state.source);
        } catch (e) {
            toast(e.message || 'Ошибка', false);
        }
    }

    function exportCurrentTable() {
        const table = state.modal.table;
        if (!table) return;
        window.location.href = `/settings/database/tables/${encodeURIComponent(table)}/export.csv?${sourceQuery()}`;
    }

    async function vacuumCurrentTable() {
        const table = state.modal.table;
        if (!table) return;
        try {
            const data = await postJson('/settings/database/maintenance', {
                source: state.source, action: 'vacuum', table,
            });
            toast(data.message || 'Готово', true);
        } catch (e) {
            toast(e.message || 'Ошибка', false);
        }
    }

    async function runSql() {
        const sql = document.getElementById('db-sql-input')?.value?.trim();
        if (!sql) return;
        const wrap = document.getElementById('db-sql-result-wrap');
        try {
            const data = await postJson('/settings/database/query', { source: state.source, sql });
            const result = data.result || {};
            const cols = result.columns || [];
            document.getElementById('db-sql-meta').textContent =
                `${result.count || 0} строк${result.truncated ? ' (лимит)' : ''}`;
            renderGrid(document.getElementById('db-sql-grid'), cols, result.rows || []);
            wrap?.classList.remove('hidden');
        } catch (e) {
            toast(e.message || 'Ошибка SQL', false);
        }
    }

    async function runMaintenance(action, table) {
        if (action !== 'analyze' && !window.confirm(`Выполнить ${action.toUpperCase()}?`)) return;
        try {
            const data = await postJson('/settings/database/maintenance', {
                source: state.source, action, table: table || undefined,
            });
            toast(data.message || 'Готово', true);
        } catch (e) {
            toast(e.message || 'Ошибка', false);
        }
    }

    async function loadConnStats() {
        const el = document.getElementById('db-conn-stats');
        const group = document.getElementById('db-conn-stats-group');
        if (!el) return;
        try {
            const data = await getJson(`/settings/database/stats.json?${sourceQuery()}`);
            const stats = data.stats || {};
            if (!stats.supported) {
                group?.classList.add('hidden');
                return;
            }
            group?.classList.remove('hidden');
            if (stats.error) {
                el.innerHTML = `<div class="settings-macos-row settings-macos-row--info"><span class="settings-macos-row__value">${stats.error}</span></div>`;
                return;
            }
            el.innerHTML = `
                <div class="settings-macos-row settings-macos-row--info">
                    <span class="settings-macos-row__title">Активные</span>
                    <span class="settings-macos-row__value">${stats.active ?? 0}</span>
                </div>
                <div class="settings-macos-row settings-macos-row--info">
                    <span class="settings-macos-row__title">Idle</span>
                    <span class="settings-macos-row__value">${stats.idle ?? 0}</span>
                </div>
                <div class="settings-macos-row settings-macos-row--info">
                    <span class="settings-macos-row__title">Всего</span>
                    <span class="settings-macos-row__value">${stats.total ?? 0}</span>
                </div>`;
        } catch (e) {
            el.innerHTML = `<div class="settings-macos-row settings-macos-row--info"><span class="settings-macos-row__value">${e.message}</span></div>`;
        }
    }

    function initUnlocked() {
        const remainingEl = document.getElementById('db-stepup-remaining');
        let remaining = Number(cfg.remainingSec || 0);
        state.source = cfg.currentSource || 'shopbot';

        document.querySelectorAll('.db-panel__source-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchSource(btn.dataset.source));
        });

        document.querySelectorAll('.db-panel__workspace-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchWorkspace(btn.dataset.workspace));
        });

        if (state.source === 'remnawave' && cfg.remnawaveConfigured === false) {
            document.getElementById('db-rw-hint')?.classList.remove('hidden');
        }

        document.getElementById('db-tables-refresh')?.addEventListener('click', loadTables);
        document.getElementById('db-table-search')?.addEventListener('input', (e) => {
            renderTablesList(e.target.value);
        });

        document.getElementById('db-sql-run')?.addEventListener('click', runSql);
        document.querySelectorAll('.db-maint-btn').forEach((btn) => {
            btn.addEventListener('click', () => runMaintenance(btn.dataset.action));
        });

        document.querySelectorAll('[data-close-modal]').forEach((el) => {
            el.addEventListener('click', closeTableModal);
        });
        document.getElementById('db-table-prev')?.addEventListener('click', () => {
            if (state.modal.page > 1) loadTablePage(state.modal.page - 1);
        });
        document.getElementById('db-table-next')?.addEventListener('click', () => {
            loadTablePage(state.modal.page + 1);
        });
        document.getElementById('db-table-delete-rows')?.addEventListener('click', deleteSelectedRows);
        document.getElementById('db-table-truncate')?.addEventListener('click', truncateCurrentTable);
        document.getElementById('db-table-export')?.addEventListener('click', exportCurrentTable);
        document.getElementById('db-table-vacuum')?.addEventListener('click', vacuumCurrentTable);

        const tick = () => {
            if (!remainingEl || remaining <= 0) return;
            remaining -= 1;
            remainingEl.textContent = formatRemaining(remaining);
            if (remaining <= 0) window.location.reload();
        };
        if (remaining > 0) setInterval(tick, 1000);

        document.getElementById('db-stepup-lock-btn')?.addEventListener('click', async () => {
            try {
                await postJson('/settings/database/stepup/lock', {});
                window.location.reload();
            } catch (e) {
                toast(e.message || 'Ошибка', false);
            }
        });
    }

    function init() {
        if (!document.getElementById('tab-database')) return;
        initStepupGate();
        if (document.getElementById('db-panel-unlocked')) initUnlocked();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
