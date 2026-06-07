(function () {
    'use strict';

    const routes = window.__TRIAL_ROUTES__ || {};
    let currentView = 'active';
    let currentPage = 1;
    let extendKeyId = null;
    let grantInFlight = false;

    const ERROR_LABELS = {
        trial_already_used: 'Пробный период уже использован',
        user_not_found: 'Пользователь не найден',
        user_banned: 'Пользователь заблокирован',
        no_hosts: 'Нет серверов в панели',
        host_required: 'Укажите сервер',
        grant_failed: 'Не удалось выдать триал',
        forbidden: 'Недостаточно прав',
        not_trial_key: 'Это не trial-ключ',
        key_not_found: 'Ключ не найден',
    };

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
            return;
        }
        console.log('[trial]', msg);
    }

    function csrfHeaders() {
        const h = { 'X-Requested-With': 'XMLHttpRequest' };
        const token = routes.csrf
            || (typeof window.getCsrfToken === 'function' ? window.getCsrfToken() : '')
            || document.querySelector('meta[name="csrf-token"]')?.content
            || '';
        if (token) h['X-CSRFToken'] = token;
        return h;
    }

    function formatError(err) {
        if (!err) return 'Ошибка';
        return ERROR_LABELS[err] || String(err);
    }

    function formatStatValue(key, value) {
        if (key === 'conversion_pct') return value + '%';
        if (key === 'converted') return value + ' купили';
        return String(value);
    }

    function tableColspan() {
        return currentView === 'eligible' ? 4 : 6;
    }

    function formatRefreshTime() {
        const el = $('#tr-last-refresh');
        if (!el) return;
        const now = new Date();
        el.textContent = '· обновлено ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }

    function updateTableHead(view) {
        const head = $('#tr-table-head');
        if (!head) return;
        if (view === 'eligible') {
            head.innerHTML = '<tr><th>Пользователь</th><th>Регистрация</th><th>Статус</th><th></th></tr>';
        } else {
            head.innerHTML = '<tr><th>Пользователь</th><th>Сервер</th><th>Создан</th><th>Истекает</th><th>Статус</th><th></th></tr>';
        }
    }

    function renderPagination(container, page, totalPages) {
        if (!container) return;
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const prev = document.createElement('button');
        prev.textContent = '‹';
        prev.disabled = page <= 1;
        prev.addEventListener('click', () => loadList(page - 1));
        container.appendChild(prev);

        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let p = start; p <= end; p++) {
            const btn = document.createElement('button');
            btn.textContent = String(p);
            if (p === page) btn.classList.add('is-active');
            btn.addEventListener('click', () => loadList(p));
            container.appendChild(btn);
        }

        const next = document.createElement('button');
        next.textContent = '›';
        next.disabled = page >= totalPages;
        next.addEventListener('click', () => loadList(page + 1));
        container.appendChild(next);
    }

    async function loadStats() {
        try {
            const res = await fetch(routes.stats + '?days=30', { credentials: 'same-origin' });
            const data = await res.json();
            if (!data.ok) return;

            const stats = data.stats || {};
            $$('[data-stat]').forEach((el) => {
                const key = el.getAttribute('data-stat');
                if (stats[key] !== undefined) el.textContent = formatStatValue(key, stats[key]);
            });

            renderChart(data.series || []);
            formatRefreshTime();
        } catch (e) {
            console.error('trial stats', e);
        }
    }

    function renderChart(series) {
        const chart = $('#tr-chart');
        if (!chart) return;
        chart.innerHTML = '';
        const max = Math.max(1, ...series.map((s) => s.count || 0));
        const showLabels = series.length <= 14;

        series.forEach((point) => {
            const wrap = document.createElement('div');
            wrap.className = 'tr-chart__bar-wrap';
            const bar = document.createElement('div');
            bar.className = 'tr-chart__bar';
            const pct = ((point.count || 0) / max) * 100;
            bar.style.height = Math.max(2, pct) + '%';
            bar.title = (point.day || '') + ': ' + (point.count || 0);
            wrap.appendChild(bar);
            if (showLabels && point.day) {
                const label = document.createElement('span');
                label.className = 'tr-chart__label';
                label.textContent = point.day.slice(5);
                wrap.appendChild(label);
            }
            chart.appendChild(wrap);
        });
    }

    async function loadList(page) {
        currentPage = page || 1;
        const body = $('#tr-table-body');
        const empty = $('#tr-empty');
        const pagination = $('#tr-pagination');
        if (!body) return;

        updateTableHead(currentView);
        body.innerHTML = '<tr><td colspan="' + tableColspan() + '" style="text-align:center;padding:1.5rem;color:var(--tr-dim)">Загрузка…</td></tr>';

        const url = new URL(routes.list, window.location.origin);
        url.searchParams.set('view', currentView);
        url.searchParams.set('page', String(currentPage));
        url.searchParams.set('ajax_pagination', '1');

        try {
            const res = await fetch(url.toString(), { credentials: 'same-origin' });
            const data = await res.json();
            if (!data.ok && !data.html) throw new Error('load failed');

            body.innerHTML = data.html || '';
            const hasRows = body.querySelector('tr');
            if (empty) empty.classList.toggle('hidden', !!hasRows);
            renderPagination(pagination, data.current_page || 1, data.total_pages || 1);
        } catch (e) {
            body.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            console.error('trial list', e);
        }
    }

    function setGrantHostValue(hostName) {
        const sel = $('#tr_grant_host');
        if (!sel || sel.disabled) return;
        if (hostName && Array.from(sel.options).some((o) => o.value === hostName)) {
            sel.value = hostName;
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function mountModals() {
        $$('.tr-modal').forEach((modal) => {
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
        });
    }

    function setModalOpen(open) {
        document.documentElement.classList.toggle('tr-modal-open', open);
        document.body.classList.toggle('tr-modal-open', open);
    }

    function openGrantModal(presetUserId) {
        const m = document.getElementById('tr-grant-modal');
        if (!m) return;
        m.classList.remove('hidden');
        m.scrollTop = 0;
        setModalOpen(true);

        const userInput = $('#tr-grant-user');
        if (userInput) {
            userInput.value = presetUserId ? String(presetUserId) : '';
        }

        const settingsHost = ($('#trial_host_id')?.value || '').trim();
        if (settingsHost) setGrantHostValue(settingsHost);
        else setGrantHostValue($('#tr_grant_host')?.value || '');

        window.setTimeout(() => userInput?.focus(), 60);
    }

    function openModal(id) {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('hidden');
        m.scrollTop = 0;
        setModalOpen(true);
    }

    function closeModals() {
        $$('.tr-modal').forEach((m) => m.classList.add('hidden'));
        if (!$$('.tr-modal:not(.hidden)').length) setModalOpen(false);
        $$('.soft-select.open').forEach((w) => w.classList.remove('open'));
        extendKeyId = null;
    }

    async function postJson(url, payload) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { ...csrfHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload || {}),
            });
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                try {
                    return await res.json();
                } catch (_) {
                    return { ok: false, error: `Ошибка ${res.status}` };
                }
            }
            return { ok: false, error: `Некорректный ответ (${res.status})` };
        } catch (_) {
            return { ok: false, error: 'Сетевая ошибка' };
        }
    }

    async function handleGrant(userIdOrName, hostName, force) {
        if (grantInFlight) return;
        const submitBtn = $('#tr-grant-submit');
        const hostDisabled = !!$('#tr_grant_host')?.disabled;
        grantInFlight = true;
        if (submitBtn) submitBtn.disabled = true;

        try {
            const raw = (userIdOrName || '').trim();
            const payload = { host_name: hostName, force: !!force };
            if (/^\d+$/.test(raw)) payload.telegram_id = parseInt(raw, 10);
            else payload.username = raw.replace(/^@/, '');
            const data = await postJson(routes.grant, payload);
            if (!data.ok) {
                toast(formatError(data.error) || data.message || 'Не удалось выдать триал', 'error');
                return;
            }
            toast(data.message || 'Триал выдан', 'success');
            closeModals();
            loadStats();
            loadList(1);
        } finally {
            grantInFlight = false;
            if (submitBtn) submitBtn.disabled = hostDisabled;
        }
    }

    async function handleReset(userId) {
        if (!confirm('Сбросить флаг trial_used? Пользователь сможет активировать триал снова.')) return;
        const data = await postJson(routes.reset, { telegram_id: userId });
        if (!data.ok) {
            toast(formatError(data.error) || 'Ошибка', 'error');
            return;
        }
        toast(data.message || 'Флаг сброшен', 'success');
        loadStats();
        loadList(currentPage);
    }

    async function handleExtend() {
        if (!extendKeyId) return;
        const days = parseInt($('#tr-extend-days')?.value || '0', 10);
        if (!days) {
            toast('Укажите количество дней', 'error');
            return;
        }
        const url = routes.extend.replace('/0/', '/' + extendKeyId + '/');
        const data = await postJson(url, { delta_days: days });
        if (!data.ok) {
            toast(formatError(data.error) || 'Не удалось продлить', 'error');
            return;
        }
        toast('Ключ продлён', 'success');
        closeModals();
        loadList(currentPage);
    }

    async function handleRevoke(keyId) {
        if (!confirm('Отозвать пробный ключ? Действие необратимо.')) return;
        const url = routes.revoke.replace('/0/', '/' + keyId + '/');
        const data = await postJson(url, {});
        if (!data.ok) {
            toast(formatError(data.error) || 'Не удалось отозвать', 'error');
            return;
        }
        toast(data.message || 'Ключ отозван', 'success');
        loadStats();
        loadList(currentPage);
    }

    async function saveSettings(e) {
        e.preventDefault();
        const form = $('#tr-settings-form');
        if (!form || !routes.canEditSettings) return;
        const fd = new FormData(form);
        try {
            const res = await fetch(routes.settings, {
                method: 'POST',
                credentials: 'same-origin',
                headers: csrfHeaders(),
                body: fd,
            });
            const data = await res.json();
            if (!data.ok) {
                toast(data.error || 'Ошибка сохранения', 'error');
                return;
            }
            toast(data.message || 'Сохранено', 'success');
        } catch (err) {
            toast('Ошибка сохранения', 'error');
        }
    }

    function bindEvents() {
        $('#tr-refresh-btn')?.addEventListener('click', () => {
            loadStats();
            loadList(currentPage);
        });

        $$('#tr-view-tabs .tr-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                $$('#tr-view-tabs .tr-tab').forEach((t) => t.classList.remove('is-active'));
                tab.classList.add('is-active');
                currentView = tab.getAttribute('data-tr-view') || 'active';
                loadList(1);
            });
        });

        $('#tr-settings-form')?.addEventListener('submit', saveSettings);

        $('#tr-grant-open')?.addEventListener('click', () => openGrantModal());
        $$('[data-tr-close]').forEach((el) => el.addEventListener('click', closeModals));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModals();
        });

        $('#tr-grant-submit')?.addEventListener('click', () => {
            const user = $('#tr-grant-user')?.value;
            const host = $('#tr_grant_host')?.value;
            const force = $('#tr-grant-force')?.checked;
            if (!user || !host) {
                toast('Укажите пользователя и сервер', 'error');
                return;
            }
            handleGrant(user, host, force);
        });

        $('#tr-extend-submit')?.addEventListener('click', handleExtend);

        $('#tr-table-body')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tr-action]');
            if (!btn) return;
            const row = btn.closest('tr');
            const action = btn.getAttribute('data-tr-action');
            const keyId = row?.getAttribute('data-key-id');
            const userId = row?.getAttribute('data-user-id');

            if (action === 'extend' && keyId) {
                extendKeyId = parseInt(keyId, 10);
                openModal('tr-extend-modal');
            } else if (action === 'revoke' && keyId) {
                handleRevoke(parseInt(keyId, 10));
            } else if (action === 'reset' && userId) {
                handleReset(parseInt(userId, 10));
            } else if (action === 'grant' && userId) {
                const hostSel = $('#tr_grant_host');
                const settingsHost = ($('#trial_host_id')?.value || '').trim();
                const host = hostSel?.value || settingsHost;
                if (!host) {
                    openGrantModal(userId);
                    return;
                }
                handleGrant(userId, host, false);
            }

            const copyBtn = e.target.closest('[data-copy-id]');
            if (copyBtn) {
                const id = copyBtn.getAttribute('data-copy-id');
                navigator.clipboard?.writeText(id).then(() => toast('ID скопирован', 'success'));
            }
        });
    }

    function initSoftSelects() {
        if (typeof window.initSoftSelect !== 'function') return;
        window.initSoftSelect('trial_host_id', 'Выборочно (пользователь выбирает)');
        window.initSoftSelect('tr_grant_host', 'Выберите сервер');
    }

    function init() {
        if (!routes.stats) return;
        mountModals();
        bindEvents();
        initSoftSelects();
        loadStats();
        loadList(1);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
