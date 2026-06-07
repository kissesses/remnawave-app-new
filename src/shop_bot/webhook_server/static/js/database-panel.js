(function () {
    'use strict';

    const cfg = window.DATABASE_PANEL || {};
    const csrf = cfg.csrfToken || document.querySelector('meta[name="csrf-token"]')?.content || '';

    const state = {
        source: cfg.currentSource || 'shopbot',
        workspace: 'overview',
        tables: [],
        tableFilter: 'all',
        tableSort: 'name',
        lastSqlResult: null,
        modal: {
            table: null,
            detail: null,
            browse: null,
            page: 1,
            tab: 'data',
            selected: new Set(),
        },
    };

    const SQL_TEMPLATES = {
        users: 'SELECT * FROM users ORDER BY user_id DESC LIMIT 20',
        transactions: 'SELECT * FROM transactions ORDER BY id DESC LIMIT 20',
        counts: "SELECT 'users' AS table_name, COUNT(*) AS cnt FROM users UNION ALL SELECT 'transactions', COUNT(*) FROM transactions",
        tables: "SELECT relname AS table_name, n_live_tup AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS size FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_live_tup DESC",
    };

    function sqlHistoryKey() {
        return `db-sql-history-${state.source}`;
    }

    function pushSqlHistory(sql) {
        try {
            const key = sqlHistoryKey();
            const prev = JSON.parse(localStorage.getItem(key) || '[]');
            const next = [sql, ...prev.filter((s) => s !== sql)].slice(0, 20);
            localStorage.setItem(key, JSON.stringify(next));
        } catch (_) { /* ignore */ }
    }

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

    function kvRow(title, value, mono) {
        const row = document.createElement('div');
        row.className = 'db-kv__row';
        const valCls = mono ? 'db-kv__value db-panel__mono' : 'db-kv__value';
        row.innerHTML = `<span class="db-kv__title">${title}</span><span class="${valCls}">${value}</span>`;
        return row;
    }

    function rankRow(label, rows, maxRows, tableId) {
        const pct = maxRows > 0 ? Math.round((Number(rows) / maxRows) * 100) : 0;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'db-rank db-rank--clickable';
        if (tableId) {
            row.dataset.tableId = tableId;
            row.title = `Открыть ${tableId}`;
        }
        row.innerHTML = `
            <span class="db-rank__name">${label}</span>
            <div class="db-rank__track"><span class="db-rank__bar" style="width:${pct}%"></span></div>
            <span class="db-rank__val db-panel__mono">${rows}</span>`;
        if (tableId) {
            row.addEventListener('click', () => {
                switchWorkspace('tables');
                openTableModal(tableId);
            });
        }
        return row;
    }

    function setHubStats(overview) {
        const ok = !!overview?.connected;
        const connected = document.getElementById('db-stat-connected');
        if (connected) {
            connected.classList.toggle('is-online', ok);
            const icon = connected.querySelector('.db-metric__icon');
            const val = connected.querySelector('.db-metric__val');
            if (icon) icon.textContent = ok ? 'check_circle' : 'error';
            if (val) val.textContent = ok ? 'Online' : 'Offline';
        }
        const live = document.getElementById('db-status-live');
        if (live) {
            live.classList.toggle('is-online', ok);
            const label = live.querySelector('span:last-child');
            if (label) label.textContent = ok ? 'Connected' : 'Disconnected';
        }
        const sizeEl = document.getElementById('db-stat-size');
        if (sizeEl) sizeEl.textContent = overview?.db_size_label || '—';
        const rowsEl = document.getElementById('db-stat-rows');
        if (rowsEl) rowsEl.textContent = String(overview?.table_rows_total ?? 0);
    }

    function setKpiFields(overview) {
        if (!overview) return;
        const root = document.getElementById('db-workspace-overview');
        if (!root) return;
        const map = {
            engine: overview.engine || '—',
            db_name: overview.db_name || '—',
            db_size_label: overview.db_size_label || '—',
            table_rows_total: String(overview.table_rows_total ?? 0),
        };
        Object.entries(map).forEach(([name, text]) => {
            const el = root.querySelector(`.db-metric-card__val[data-field="${name}"]`);
            if (el) el.textContent = text;
        });
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
        const label = overview.source_label || (source === 'remnawave' ? 'Remnawave Panel' : 'Remnawave App');
        document.getElementById('db-source-caption')?.replaceChildren(document.createTextNode(label));
        document.getElementById('db-maint-source')?.replaceChildren(document.createTextNode(label));

        setHubStats(overview);
        setKpiFields(overview);

        const status = document.getElementById('db-overview-status');
        if (status) {
            const setField = (name, text) => {
                const el = status.querySelector(`[data-field="${name}"]`);
                if (el) el.textContent = text;
            };
            setField('engine', overview.engine || '—');
            const connEl = status.querySelector('[data-field="connected"]');
            const connOk = !!overview.connected;
            if (connEl) {
                connEl.textContent = connOk ? 'OK' : 'Ошибка';
                connEl.classList.toggle('db-kv__value--pill', connOk);
            }
            setField('connection_mode', overview.connection_mode || '—');
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
                const empty = document.createElement('div');
                empty.className = 'db-empty';
                empty.textContent = 'Нет данных';
                tablesEl.appendChild(empty);
            } else {
                const maxRows = Math.max(...tables.map((t) => Number(t.rows) || 0), 1);
                tables.forEach((t) => {
                    tablesEl.appendChild(rankRow(t.label || t.id || '—', t.rows ?? 0, maxRows, t.id));
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
            const active = btn.dataset.workspace === name;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.db-panel__workspace').forEach((panel) => {
            const active = panel.dataset.workspace === name;
            panel.classList.toggle('hidden', !active);
            panel.classList.toggle('is-active', active);
        });
        if (name === 'tables') loadTables();
        if (name === 'health') {
            loadHealth();
            loadConnStats();
        }
    }

    async function refreshOverview() {
        const btn = document.getElementById('db-refresh-btn');
        btn?.classList.add('is-spinning');
        try {
            const data = await getJson(`/settings/database/info.json?${sourceQuery()}`);
            applyOverview(data.overview, state.source);
            if (state.workspace === 'tables') await loadTables();
            if (state.workspace === 'health') {
                await loadHealth();
                await loadConnStats();
            }
            toast('Данные обновлены', true);
        } catch (e) {
            toast(e.message || 'Не удалось обновить', false);
        } finally {
            btn?.classList.remove('is-spinning');
        }
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
            if (state.workspace === 'health') {
                await loadHealth();
                await loadConnStats();
            }
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
        list.innerHTML = '<div class="db-empty">Загрузка…</div>';
        try {
            const data = await getJson(`/settings/database/tables.json?${sourceQuery()}`);
            state.tables = data.tables || [];
            renderTablesList(document.getElementById('db-table-search')?.value || '');
        } catch (e) {
            list.innerHTML = `<div class="db-empty">${e.message}</div>`;
        }
    }

    function sortTables(items) {
        const sorted = [...items];
        if (state.tableSort === 'rows-desc') {
            sorted.sort((a, b) => (Number(b.rows) || 0) - (Number(a.rows) || 0));
        } else if (state.tableSort === 'size-desc') {
            sorted.sort((a, b) => (Number(b.size_bytes) || 0) - (Number(a.size_bytes) || 0));
        } else {
            sorted.sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { sensitivity: 'base' }));
        }
        return sorted;
    }

    function filterTables(items, filterText) {
        let list = items;
        if (state.tableFilter === 'data') list = list.filter((t) => !t.protected);
        else if (state.tableFilter === 'protected') list = list.filter((t) => t.protected);
        const q = (filterText || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter((t) => (
            (t.id || '').toLowerCase().includes(q) || (t.label || '').toLowerCase().includes(q)
        ));
    }

    function renderTablesList(filter) {
        const list = document.getElementById('db-tables-list');
        if (!list) return;
        const items = sortTables(filterTables(state.tables, filter));
        list.innerHTML = '';
        if (!items.length) {
            list.innerHTML = '<div class="db-empty">Нет таблиц</div>';
            return;
        }
        const maxRows = Math.max(...items.map((t) => Number(t.rows) || 0), 1);
        items.forEach((t) => {
            const pct = maxRows > 0 ? Math.round((Number(t.rows) / maxRows) * 100) : 0;
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'db-table-row db-panel__table-row';
            row.innerHTML = `
                <span class="db-table-row__body">
                    <span class="db-table-row__title db-panel__mono">${t.id}${t.protected ? ' <span class="db-panel__badge">без удаления</span>' : ''}</span>
                    <span class="db-table-row__sub">${t.label || t.id} · ${t.rows ?? 0} строк · ${t.size_label || '—'}</span>
                </span>
                <span class="material-symbols-outlined db-table-row__chevron">chevron_right</span>
                <span class="db-table-row__bar-wrap"><span class="db-table-row__bar" style="width:${pct}%"></span></span>`;
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
        state.modal = {
            table: null, detail: null, browse: null, page: 1, tab: 'data', selected: new Set(),
        };
        switchModalTab('data');
    }

    function switchModalTab(name) {
        state.modal.tab = name;
        document.querySelectorAll('.db-modal-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.modalTab === name);
        });
        document.querySelectorAll('[data-modal-pane]').forEach((pane) => {
            pane.classList.toggle('hidden', pane.dataset.modalPane !== name);
        });
    }

    function renderSchema(detail) {
        const wrap = document.getElementById('db-table-schema');
        if (!wrap) return;
        const cols = detail?.columns || [];
        if (!cols.length) {
            wrap.innerHTML = '<div class="db-empty">Нет колонок</div>';
            return;
        }
        const pk = new Set(detail?.primary_key || []);
        const table = document.createElement('table');
        table.className = 'db-schema-table';
        table.innerHTML = `
            <thead><tr>
                <th>Колонка</th><th>Тип</th><th>NULL</th><th>Default</th>
            </tr></thead>`;
        const tbody = document.createElement('tbody');
        cols.forEach((col) => {
            const tr = document.createElement('tr');
            const name = col.name || '—';
            const pkBadge = pk.has(name) ? '<span class="db-schema-pk">PK</span>' : '';
            tr.innerHTML = `
                <td class="db-panel__mono">${name}${pkBadge}</td>
                <td>${col.type || '—'}</td>
                <td>${col.nullable ? 'YES' : 'NO'}</td>
                <td class="db-panel__mono">${col.default ?? '—'}</td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.innerHTML = '';
        wrap.appendChild(table);
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
            renderSchema(data.detail);
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
        switchModalTab('data');
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

    function setSqlResultActions(visible) {
        document.getElementById('db-sql-copy')?.toggleAttribute('hidden', !visible);
        document.getElementById('db-sql-export')?.toggleAttribute('hidden', !visible);
    }

    function csvEscape(val) {
        const s = val === null || val === undefined ? '' : String(val);
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    function sqlResultToCsv(result) {
        const cols = result?.columns || [];
        const rows = result?.rows || [];
        const lines = [cols.map(csvEscape).join(',')];
        rows.forEach((row) => {
            lines.push(cols.map((c) => csvEscape(row[c])).join(','));
        });
        return lines.join('\n');
    }

    function copySqlResult() {
        const result = state.lastSqlResult;
        if (!result?.columns?.length) return;
        const text = sqlResultToCsv(result);
        navigator.clipboard?.writeText(text).then(
            () => toast('Скопировано в буфер', true),
            () => toast('Не удалось скопировать', false),
        );
    }

    function exportSqlResult() {
        const result = state.lastSqlResult;
        if (!result?.columns?.length) return;
        const blob = new Blob([sqlResultToCsv(result)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `query-${state.source}-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function runSql() {
        const sql = document.getElementById('db-sql-input')?.value?.trim();
        if (!sql) return;
        const wrap = document.getElementById('db-sql-result-wrap');
        try {
            const data = await postJson('/settings/database/query', { source: state.source, sql });
            const result = data.result || {};
            pushSqlHistory(sql);
            state.lastSqlResult = result;
            const cols = result.columns || [];
            document.getElementById('db-sql-meta').textContent =
                `${result.count || 0} строк${result.truncated ? ' (лимит)' : ''}`;
            renderGrid(document.getElementById('db-sql-grid'), cols, result.rows || []);
            wrap?.classList.remove('hidden');
            setSqlResultActions(Boolean(cols.length));
        } catch (e) {
            toast(e.message || 'Ошибка SQL', false);
        }
    }

    function applySqlTemplate(key) {
        const tpl = SQL_TEMPLATES[key];
        if (!tpl) return;
        const input = document.getElementById('db-sql-input');
        if (input) input.value = tpl;
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

    function healthCard(icon, label, value, tone) {
        const card = document.createElement('div');
        card.className = `db-health-card${tone ? ` db-health-card--${tone}` : ''}`;
        card.innerHTML = `
            <span class="material-symbols-outlined db-health-card__icon">${icon}</span>
            <span class="db-health-card__val">${value}</span>
            <span class="db-health-card__lbl">${label}</span>`;
        return card;
    }

    function cacheHitTone(pct) {
        if (pct === null || pct === undefined) return '';
        if (pct >= 95) return 'ok';
        if (pct >= 85) return 'warn';
        return 'bad';
    }

    async function loadHealth() {
        const grid = document.getElementById('db-health-grid');
        if (!grid) return;
        grid.innerHTML = '<div class="db-empty">Загрузка метрик…</div>';
        try {
            const data = await getJson(`/settings/database/health.json?${sourceQuery()}`);
            const h = data.health || {};
            if (!h.supported) {
                grid.innerHTML = '<div class="db-empty">Метрики недоступны для этого источника</div>';
                return;
            }
            if (h.error) {
                grid.innerHTML = `<div class="db-empty">${h.error}</div>`;
                return;
            }
            grid.innerHTML = '';
            const cacheVal = h.cache_hit_pct != null ? `${h.cache_hit_pct}%` : '—';
            grid.append(
                healthCard('memory', 'Cache hit', cacheVal, cacheHitTone(h.cache_hit_pct)),
                healthCard('table_rows', 'Живые строки', String(h.live_tuples ?? 0)),
                healthCard('delete_sweep', 'Мёртвые строки', String(h.dead_tuples ?? 0), h.dead_tuples > 10000 ? 'warn' : ''),
                healthCard('table', 'Таблиц', String(h.table_count ?? 0)),
                healthCard('key', 'Индексов', String(h.index_count ?? 0)),
                healthCard('lan', 'Backends', String(h.backends ?? 0)),
                healthCard('sync', 'Commits', String(h.commits ?? 0), 'ok'),
                healthCard('undo', 'Rollbacks', String(h.rollbacks ?? 0), h.rollbacks > 0 ? 'warn' : ''),
                healthCard('block', 'Deadlocks', String(h.deadlocks ?? 0), h.deadlocks > 0 ? 'bad' : 'ok'),
            );
        } catch (e) {
            grid.innerHTML = `<div class="db-empty">${e.message}</div>`;
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
                el.innerHTML = `<div class="db-empty">${stats.error}</div>`;
                return;
            }
            el.innerHTML = '';
            el.append(
                kvRow('Активные', String(stats.active ?? 0)),
                kvRow('Idle', String(stats.idle ?? 0)),
                kvRow('Всего', String(stats.total ?? 0)),
            );
        } catch (e) {
            el.innerHTML = `<div class="db-empty">${e.message}</div>`;
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

        document.querySelectorAll('.db-goto-tables').forEach((btn) => {
            btn.addEventListener('click', () => switchWorkspace('tables'));
        });

        document.getElementById('db-overview-tables')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-table-id]');
            if (!btn?.dataset.tableId) return;
            switchWorkspace('tables');
            openTableModal(btn.dataset.tableId);
        });

        document.getElementById('db-refresh-btn')?.addEventListener('click', refreshOverview);

        if (state.source === 'remnawave' && cfg.remnawaveConfigured === false) {
            document.getElementById('db-rw-hint')?.classList.remove('hidden');
        }

        document.getElementById('db-tables-refresh')?.addEventListener('click', loadTables);
        document.getElementById('db-table-search')?.addEventListener('input', (e) => {
            renderTablesList(e.target.value);
        });
        document.getElementById('db-table-sort')?.addEventListener('change', (e) => {
            state.tableSort = e.target.value || 'name';
            renderTablesList(document.getElementById('db-table-search')?.value || '');
        });
        document.querySelectorAll('#db-table-filters .db-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.tableFilter = btn.dataset.tableFilter || 'all';
                document.querySelectorAll('#db-table-filters .db-filter').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                });
                renderTablesList(document.getElementById('db-table-search')?.value || '');
            });
        });

        document.getElementById('db-sql-run')?.addEventListener('click', runSql);
        document.getElementById('db-sql-input')?.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                runSql();
            }
        });
        document.getElementById('db-sql-template')?.addEventListener('change', (e) => {
            applySqlTemplate(e.target.value);
            e.target.value = '';
        });
        document.getElementById('db-sql-copy')?.addEventListener('click', copySqlResult);
        document.getElementById('db-sql-export')?.addEventListener('click', exportSqlResult);
        document.querySelectorAll('.db-maint-btn').forEach((btn) => {
            btn.addEventListener('click', () => runMaintenance(btn.dataset.action));
        });

        document.querySelectorAll('[data-close-modal]').forEach((el) => {
            el.addEventListener('click', closeTableModal);
        });
        document.querySelectorAll('.db-modal-tab').forEach((btn) => {
            btn.addEventListener('click', () => switchModalTab(btn.dataset.modalTab || 'data'));
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

    window.reinitDatabasePanel = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
