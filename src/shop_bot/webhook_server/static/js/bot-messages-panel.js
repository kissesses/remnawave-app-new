/**
 * Notifications Studio — Telegram bot message templates (card grid + editor modal)
 */
(function () {
    'use strict';

    const PREVIEW_DEBOUNCE = 350;
    const SNIPPET_LEN = 96;
    const CATEGORIES = [
        { id: 'purchase', label: 'Покупка' },
        { id: 'subscription', label: 'Подписка' },
        { id: 'onboarding', label: 'Onboarding' },
        { id: 'topup', label: 'Пополнение' },
        { id: 'trial', label: 'Триал' },
        { id: 'payment', label: 'Оплаты' },
        { id: 'referral', label: 'Рефералы' },
        { id: 'admin', label: 'Админ' },
        { id: 'system', label: 'Система' },
    ];

    let state = {
        templates: {},
        meta: [],
        brand: 'ShopBot',
        activeId: null,
        audienceFilter: 'all',
        categoryFilter: 'all',
        search: '',
    };

    let previewTimer = null;

    function $(id) {
        return document.getElementById(id);
    }

    async function fetchJson(url, options = {}) {
        const headers = Object.assign({
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        }, options.headers || {});
        if (options.method && options.method !== 'GET' && window.getCsrfToken) {
            headers['X-CSRFToken'] = window.getCsrfToken();
        }
        const resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, options, { headers }));
        let data = {};
        try {
            data = await resp.json();
        } catch (_) {
            data = { ok: false, error: `Ошибка ${resp.status}` };
        }
        return { resp, data };
    }

    function toast(kind, msg) {
        if (window.SettingsPage?.toast) window.SettingsPage.toast(kind, msg);
        else if (window.showToast) window.showToast(kind, msg);
    }

    function metaFor(id) {
        return state.meta.find((m) => m.id === id) || {};
    }

    function catLabel(id) {
        return CATEGORIES.find((c) => c.id === id)?.label || id || '';
    }

    function filteredMeta() {
        const q = state.search.trim().toLowerCase();
        return state.meta.filter((m) => {
            if (state.audienceFilter !== 'all' && m.audience !== state.audienceFilter) return false;
            if (state.categoryFilter !== 'all' && m.category !== state.categoryFilter) return false;
            if (!q) return true;
            const hay = `${m.label} ${m.desc} ${m.id} ${m.category}`.toLowerCase();
            return hay.includes(q);
        });
    }

    function stripHtml(raw) {
        const el = document.createElement('div');
        el.innerHTML = String(raw ?? '');
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function snippetFor(id) {
        const text = state.templates[id]?.text || '';
        const plain = stripHtml(text);
        if (!plain) return 'Пустой шаблон — нажмите, чтобы редактировать';
        return plain.length > SNIPPET_LEN ? `${plain.slice(0, SNIPPET_LEN)}…` : plain;
    }

    function renderCards() {
        const grid = $('bmsg-cards');
        if (!grid) return;
        const items = filteredMeta();
        grid.innerHTML = items.map((m) => {
            const admin = m.audience === 'admin' ? ' bmsg-card--admin' : '';
            const active = m.id === state.activeId ? ' is-active' : '';
            return (
                `<button type="button" class="bmsg-card${admin}${active}" data-id="${m.id}">` +
                `<span class="bmsg-card__top">` +
                `<span class="bmsg-card__icon material-symbols-outlined">${m.icon || 'chat'}</span>` +
                `<span class="bmsg-card__badges">` +
                `<span class="bmsg-card__cat">${escapeHtml(catLabel(m.category))}</span>` +
                `<span class="bmsg-card__aud">${m.audience === 'admin' ? 'Админ' : 'User'}</span>` +
                `</span>` +
                `</span>` +
                `<span class="bmsg-card__title">${escapeHtml(m.label)}</span>` +
                `<span class="bmsg-card__meta">${escapeHtml(m.desc || '')}</span>` +
                `<span class="bmsg-card__snippet">${escapeHtml(snippetFor(m.id))}</span>` +
                `<span class="bmsg-card__open">` +
                `<span class="material-symbols-outlined">edit</span> Редактировать` +
                `</span>` +
                `</button>`
            );
        }).join('') || '<p class="bmsg-cards-empty">Ничего не найдено</p>';

        grid.querySelectorAll('.bmsg-card').forEach((btn) => {
            btn.addEventListener('click', () => openTemplate(btn.dataset.id));
        });
    }

    function renderCatFilters() {
        const wrap = $('bmsg-cat-filters');
        if (!wrap) return;
        wrap.innerHTML = CATEGORIES.map((c) => (
            `<button type="button" class="bmsg-cat-filter${state.categoryFilter === c.id ? ' is-active' : ''}" data-cat="${c.id}">${c.label}</button>`
        )).join('');
        wrap.querySelectorAll('.bmsg-cat-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.categoryFilter = state.categoryFilter === btn.dataset.cat ? 'all' : btn.dataset.cat;
                renderCatFilters();
                renderCards();
            });
        });
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderVars(meta) {
        const wrap = $('bmsg-vars');
        const varsWrap = wrap?.closest('.bmsg-vars-wrap');
        if (!wrap) return;
        const vars = meta.vars || [];
        if (!vars.length) {
            wrap.innerHTML = '';
            if (varsWrap) varsWrap.hidden = true;
            return;
        }
        if (varsWrap) varsWrap.hidden = false;
        wrap.innerHTML = vars.map((v) => (
            `<button type="button" class="bmsg-var" data-var="${v}">{${escapeHtml(v)}}</button>`
        )).join('');
        wrap.querySelectorAll('.bmsg-var').forEach((btn) => {
            btn.addEventListener('click', () => insertVar(btn.dataset.var));
        });
    }

    function insertVar(name) {
        const ta = $('bmsg-text');
        if (!ta || !name) return;
        const token = `{${name}}`;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + token.length;
        updateCharCount();
        schedulePreview();
    }

    function updateCharCount() {
        const ta = $('bmsg-text');
        const el = $('bmsg-char-count');
        if (ta && el) el.textContent = `${ta.value.length} / 4096`;
    }

    function openModal() {
        if (typeof window.openModal === 'function') window.openModal('bmsgEditorModal');
        else $('bmsgEditorModal')?.classList.add('open');
    }

    function closeModal() {
        if (typeof window.closeModal === 'function') window.closeModal('bmsgEditorModal');
        else $('bmsgEditorModal')?.classList.remove('open');
        state.activeId = null;
        renderCards();
    }

    function onModalDismissed() {
        if (!$('bmsgEditorModal')?.classList.contains('open') && state.activeId) {
            state.activeId = null;
            renderCards();
        }
    }

    function fillEditor(id) {
        if (!id || !state.templates[id]) return;
        state.activeId = id;
        const meta = metaFor(id);
        const text = state.templates[id].text || '';

        const title = $('bmsg-editor-title');
        const desc = $('bmsg-editor-desc');
        if (title) title.textContent = meta.label || id;
        if (desc) desc.textContent = meta.desc || '';

        const badge = $('bmsg-audience-badge');
        if (badge) {
            badge.textContent = meta.audience === 'admin' ? 'Админ' : 'Пользователь';
            badge.classList.toggle('bmsg-audience-badge--admin', meta.audience === 'admin');
        }

        const ta = $('bmsg-text');
        if (ta) ta.value = text;

        const bubble = $('bmsg-preview-bubble');
        if (bubble) bubble.innerHTML = '<span style="opacity:.45">Загрузка…</span>';

        renderVars(meta);
        updateCharCount();
        schedulePreview();
        renderCards();
    }

    function openTemplate(id) {
        fillEditor(id);
        openModal();
        $('bmsg-text')?.focus();
    }

    function schedulePreview() {
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(runPreview, PREVIEW_DEBOUNCE);
    }

    async function runPreview() {
        const id = state.activeId;
        const bubble = $('bmsg-preview-bubble');
        if (!id || !bubble) return;
        const text = $('bmsg-text')?.value ?? '';
        const { data } = await fetchJson('/settings/bot-messages/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: id, text }),
        });
        if (data.ok && data.html) {
            bubble.innerHTML = data.html;
        } else {
            bubble.innerHTML = `<span style="opacity:.55">${escapeHtml(data.error || 'Ошибка превью')}</span>`;
        }
    }

    async function saveActive() {
        const id = state.activeId;
        if (!id) return;
        const text = $('bmsg-text')?.value ?? '';
        const btn = $('bmsg-save');
        if (btn) btn.disabled = true;
        try {
            const { data } = await fetchJson('/settings/bot-messages/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_id: id, text }),
            });
            if (data.ok) {
                state.templates[id] = { text };
                renderCards();
                toast('success', 'Шаблон сохранён');
            } else {
                toast('danger', data.error || 'Ошибка сохранения');
            }
        } catch (_) {
            toast('danger', 'Ошибка сети');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function resetOne() {
        const id = state.activeId;
        if (!id) return;
        const ok = window.showConfirm
            ? await window.showConfirm({ title: 'Сброс шаблона', message: 'Вернуть текст по умолчанию?', type: 'warning', confirmText: 'Сбросить' })
            : confirm('Сбросить шаблон?');
        if (!ok) return;
        const { data } = await fetchJson('/settings/bot-messages/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: id }),
        });
        if (data.ok) {
            state.templates = data.templates || state.templates;
            fillEditor(id);
            toast('success', 'Шаблон сброшен');
        }
    }

    async function resetAll() {
        const ok = window.showConfirm
            ? await window.showConfirm({ title: 'Сброс всех шаблонов', message: 'Все тексты вернутся к значениям по умолчанию.', type: 'warning', confirmText: 'Сбросить все' })
            : confirm('Сбросить все шаблоны?');
        if (!ok) return;
        const { data } = await fetchJson('/settings/bot-messages/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (data.ok) {
            state.templates = data.templates || {};
            if (state.activeId) fillEditor(state.activeId);
            renderCards();
            toast('success', 'Все шаблоны сброшены');
        }
    }

    async function loadData() {
        const { data } = await fetchJson('/settings/bot-messages/data');
        if (!data.ok) {
            toast('danger', data.error || 'Не удалось загрузить шаблоны');
            return;
        }
        state.templates = data.templates || {};
        state.meta = data.meta || [];
        state.brand = data.brand || 'ShopBot';
        const brandEl = $('bmsg-preview-brand');
        if (brandEl) brandEl.textContent = state.brand;
        const statEl = $('bmsg-stat-count');
        if (statEl) {
            statEl.querySelector('span:last-child').textContent = `${state.meta.length} шаблонов`;
        }
        renderCatFilters();
        renderCards();
    }

    function bindEvents() {
        $('bmsg-search')?.addEventListener('input', (e) => {
            state.search = e.target.value;
            renderCards();
        });
        document.querySelectorAll('.bmsg-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.audienceFilter = btn.dataset.filter || 'all';
                document.querySelectorAll('.bmsg-filter').forEach((b) => {
                    b.classList.toggle('is-active', b.dataset.filter === state.audienceFilter);
                });
                renderCards();
            });
        });
        $('bmsg-text')?.addEventListener('input', () => {
            updateCharCount();
            schedulePreview();
        });
        $('bmsg-save')?.addEventListener('click', saveActive);
        $('bmsg-reset-one')?.addEventListener('click', resetOne);
        $('bmsg-reset-all')?.addEventListener('click', resetAll);
        $('bmsg-modal-close')?.addEventListener('click', closeModal);

        const modal = $('bmsgEditorModal');
        modal?.querySelector('.modal-content')?.addEventListener('click', (e) => e.stopPropagation());
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) setTimeout(onModalDismissed, 0);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setTimeout(onModalDismissed, 0);
        });
    }

    function init() {
        if (!$('tab-content')?.classList.contains('bmsg-page')) return;
        if (!$('bmsg-cards')) return;
        bindEvents();
        loadData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
