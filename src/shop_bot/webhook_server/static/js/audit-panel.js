/**
 * Audit Studio — journal UI with filters, detail modal, export
 */
(function () {
    'use strict';

    const PAGE_SIZE = 50;
    const DEBOUNCE_MS = 350;
    const LIVE_MS = 30000;

    let state = {
        offset: 0,
        total: 0,
        loading: false,
        group: 'all',
        catalog: { groups: [], actions: [], admins: [] },
        liveTimer: null,
        detailJson: '',
    };

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(kind, msg) {
        window.showToast?.(kind, msg);
    }

    function filterParams() {
        const p = new URLSearchParams();
        const q = $('aud-q')?.value?.trim();
        const admin = $('aud-admin')?.value?.trim();
        const ip = $('aud-ip')?.value?.trim();
        const dateFrom = $('aud-date-from')?.value;
        const dateTo = $('aud-date-to')?.value;
        if (q) p.set('q', q);
        if (admin) p.set('admin', admin);
        if (ip) p.set('ip', ip);
        if (dateFrom) p.set('date_from', dateFrom);
        if (dateTo) p.set('date_to', dateTo);
        if (state.group && state.group !== 'all') p.set('group', state.group);
        return p;
    }

    function syncExportLink() {
        const link = $('aud-export');
        if (!link) return;
        const qs = filterParams().toString();
        link.href = `/settings/audit/export${qs ? `?${qs}` : ''}`;
    }

    function formatTime(raw) {
        if (!raw) return '—';
        try {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return String(raw);
            return d.toLocaleString('ru-RU', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
        } catch (_) {
            return String(raw);
        }
    }

    function actionBadgeClass(group) {
        const map = {
            auth: 'aud-badge--auth',
            access: 'aud-badge--access',
            db: 'aud-badge--db',
            user: 'aud-badge--user',
            bot: 'aud-badge--bot',
            settings: 'aud-badge--settings',
            mail: 'aud-badge--mail',
            dashboard: 'aud-badge--dashboard',
            audit: 'aud-badge--audit',
        };
        return map[group] || 'aud-badge--default';
    }

    function renderRow(entry) {
        const group = entry.action_group || 'other';
        return (
            `<tr class="aud-row" data-id="${entry.id}" tabindex="0">` +
            `<td class="aud-cell aud-cell--time">${escapeHtml(formatTime(entry.created_at))}</td>` +
            `<td class="aud-cell">${escapeHtml(entry.admin_login || '—')}</td>` +
            `<td class="aud-cell"><span class="aud-badge ${actionBadgeClass(group)}">${escapeHtml(entry.action_label || entry.action || '—')}</span></td>` +
            `<td class="aud-cell aud-cell--sum" title="${escapeHtml(entry.summary || '')}">${escapeHtml(entry.summary || '—')}</td>` +
            `<td class="aud-cell aud-cell--ip">${escapeHtml(entry.ip || '—')}</td>` +
            `</tr>`
        );
    }

    function renderTable(entries, reset) {
        const tbody = $('aud-tbody');
        if (!tbody) return;
        if (reset) tbody.innerHTML = '';
        if (!entries.length && reset) {
            tbody.innerHTML = '<tr><td colspan="5" class="aud-table-empty">Ничего не найдено</td></tr>';
            return;
        }
        if (!entries.length) return;
        const empty = tbody.querySelector('.aud-table-empty');
        if (empty) empty.remove();
        tbody.insertAdjacentHTML('beforeend', entries.map(renderRow).join(''));
        tbody.querySelectorAll('.aud-row:not([data-bound])').forEach((row) => {
            row.dataset.bound = '1';
            row.addEventListener('click', () => openDetail(row.dataset.id));
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDetail(row.dataset.id);
                }
            });
        });
    }

    function updateMeta() {
        const meta = $('aud-meta');
        const filtered = $('aud-stat-filtered');
        const shown = Math.min(state.offset, state.total);
        if (meta) {
            meta.textContent = state.total
                ? `Показано ${shown} из ${state.total}`
                : 'Записей нет';
        }
        if (filtered) filtered.textContent = String(state.total);
        const more = $('aud-more');
        if (more) more.hidden = state.offset >= state.total;
    }

    async function loadList(reset) {
        if (state.loading) return;
        if (reset) {
            state.offset = 0;
            $('aud-tbody').innerHTML = '<tr><td colspan="5" class="aud-table-empty">Загрузка…</td></tr>';
        }
        state.loading = true;
        const params = filterParams();
        params.set('offset', String(state.offset));
        params.set('limit', String(PAGE_SIZE));
        syncExportLink();
        try {
            const resp = await fetch(`/settings/audit/list?${params}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) {
                toast('danger', data.error || 'Ошибка загрузки');
                return;
            }
            state.total = data.total || 0;
            const entries = data.entries || [];
            renderTable(entries, reset);
            state.offset += entries.length;
            updateMeta();
        } catch (e) {
            console.warn('Audit list', e);
            toast('danger', 'Не удалось загрузить журнал');
        } finally {
            state.loading = false;
        }
    }

    async function loadStats() {
        try {
            const resp = await fetch('/settings/audit/stats', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) return;
            $('aud-stat-today').textContent = String(data.today ?? '—');
            $('aud-stat-total').textContent = String(data.total ?? '—');
            renderTopList('aud-top-actions', (data.top_actions || []).map((a) => ({
                label: a.label || a.action,
                count: a.count,
                filter: () => { state.group = a.action.split('.')[0] || 'all'; renderGroups(); loadList(true); },
            })));
            renderTopList('aud-top-admins', (data.top_admins || []).map((a) => ({
                label: a.login,
                count: a.count,
                filter: () => { $('aud-admin').value = a.login; loadList(true); },
            })));
        } catch (e) {
            console.warn('Audit stats', e);
        }
    }

    function renderTopList(id, items) {
        const ul = $(id);
        if (!ul) return;
        if (!items.length) {
            ul.innerHTML = '<li class="aud-insight-empty">Нет данных</li>';
            return;
        }
        ul.innerHTML = items.map((item, idx) => (
            `<li><button type="button" class="aud-insight-item" data-idx="${idx}">` +
            `<span class="aud-insight-item__label">${escapeHtml(item.label)}</span>` +
            `<span class="aud-insight-item__count">${item.count}</span>` +
            `</button></li>`
        )).join('');
        ul.querySelectorAll('.aud-insight-item').forEach((btn) => {
            btn.addEventListener('click', () => {
                const item = items[Number(btn.dataset.idx)];
                item.filter?.();
            });
        });
    }

    async function loadCatalog() {
        try {
            const resp = await fetch('/settings/audit/catalog', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) return;
            state.catalog = data;
            const sel = $('aud-admin');
            if (sel) {
                const current = sel.value;
                sel.innerHTML = '<option value="">Все админы</option>' +
                    (data.admins || []).map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
                if (current) sel.value = current;
            }
            renderGroups();
        } catch (e) {
            console.warn('Audit catalog', e);
        }
    }

    function renderGroups() {
        const wrap = $('aud-groups');
        if (!wrap) return;
        const groups = [{ id: 'all', label: 'Все' }, ...(state.catalog.groups || [])];
        wrap.innerHTML = groups.map((g) => (
            `<button type="button" class="aud-group${state.group === g.id ? ' is-active' : ''}" data-group="${g.id}">${escapeHtml(g.label)}</button>`
        )).join('');
        wrap.querySelectorAll('.aud-group').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.group = btn.dataset.group || 'all';
                renderGroups();
                loadList(true);
            });
        });
    }

    async function openDetail(id) {
        if (!id) return;
        try {
            const resp = await fetch(`/settings/audit/entry/${id}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok || !data.entry) {
                toast('danger', data.error || 'Запись не найдена');
                return;
            }
            const e = data.entry;
            $('aud-detail-time').textContent = formatTime(e.created_at);
            $('aud-detail-title').textContent = e.action_label || e.action || '—';
            $('aud-detail-admin').textContent = `${e.admin_login || '—'} · ID ${e.admin_id ?? '—'}`;
            $('aud-detail-code').textContent = e.action || '—';
            $('aud-detail-ip').textContent = e.ip || '—';
            $('aud-detail-admin-id').textContent = e.admin_id ?? '—';
            $('aud-detail-summary').textContent = e.summary || '—';
            const parsed = e.details_parsed ?? e.details;
            state.detailJson = typeof parsed === 'string'
                ? parsed
                : JSON.stringify(parsed ?? {}, null, 2);
            $('aud-detail-json').textContent = state.detailJson || '—';
            const modal = $('audDetailModal');
            modal.hidden = false;
            modal.setAttribute('aria-hidden', 'false');
            if (typeof window.openModal === 'function') window.openModal('audDetailModal');
            else modal.classList.add('open');
        } catch (err) {
            toast('danger', 'Ошибка загрузки записи');
        }
    }

    function closeDetail() {
        const modal = $('audDetailModal');
        if (!modal) return;
        if (typeof window.closeModal === 'function') window.closeModal('audDetailModal');
        else modal.classList.remove('open');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    }

    function clearFilters() {
        ['aud-q', 'aud-ip', 'aud-date-from', 'aud-date-to'].forEach((id) => {
            const el = $(id);
            if (el) el.value = '';
        });
        if ($('aud-admin')) $('aud-admin').value = '';
        state.group = 'all';
        renderGroups();
        loadList(true);
    }

    function applyUrlParams() {
        const p = new URLSearchParams(window.location.search);
        if (p.get('admin') && $('aud-admin')) $('aud-admin').value = p.get('admin');
        if (p.get('q') && $('aud-q')) $('aud-q').value = p.get('q');
        if (p.get('group')) state.group = p.get('group');
        if (p.get('date_from') && $('aud-date-from')) $('aud-date-from').value = p.get('date_from');
        if (p.get('date_to') && $('aud-date-to')) $('aud-date-to').value = p.get('date_to');
    }

    function bindEvents() {
        let debounce = null;
        ['aud-q', 'aud-admin', 'aud-ip', 'aud-date-from', 'aud-date-to'].forEach((id) => {
            $(id)?.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => loadList(true), DEBOUNCE_MS);
            });
            $(id)?.addEventListener('change', () => loadList(true));
        });

        $('aud-refresh')?.addEventListener('click', () => {
            loadStats();
            loadList(true);
        });
        $('aud-more')?.addEventListener('click', () => loadList(false));
        $('aud-clear-filters')?.addEventListener('click', clearFilters);
        $('aud-detail-close')?.addEventListener('click', closeDetail);
        $('audDetailModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'audDetailModal') closeDetail();
        });
        $('aud-copy-json')?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(state.detailJson || '');
                toast('success', 'JSON скопирован');
            } catch (_) {
                toast('warning', 'Не удалось скопировать');
            }
        });

        $('aud-live')?.addEventListener('change', (e) => {
            clearInterval(state.liveTimer);
            state.liveTimer = null;
            if (e.target.checked) {
                state.liveTimer = setInterval(() => loadList(true), LIVE_MS);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('audDetailModal')?.classList.contains('open')) closeDetail();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('tab-audit')) return;
        closeDetail();
        applyUrlParams();
        bindEvents();
        loadCatalog().then(() => loadStats().then(() => loadList(true)));
    });
})();
