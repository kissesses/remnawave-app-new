/**
 * Broadcast Studio — template library (built-in presets + custom themes)
 */
(function () {
    'use strict';

    const SNIPPET_LEN = 88;
    const AUDIENCE_LABELS = {
        all: 'Все',
        with_keys: 'Активные',
        expired_keys: 'Истекшие',
        without_trial: 'После триала',
        not_used_trial: 'Без триала',
        test: 'Тест',
        expiring_keys: 'Истекает',
    };

    let state = {
        categories: [],
        presets: [],
        custom: {},
        source: 'builtin',
        category: 'all',
        search: '',
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

    function stripHtml(raw) {
        return String(raw ?? '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function snippet(text) {
        const plain = stripHtml(text);
        if (!plain) return 'Пустой шаблон';
        return plain.length > SNIPPET_LEN ? `${plain.slice(0, SNIPPET_LEN)}…` : plain;
    }

    function catLabel(id) {
        return state.categories.find((c) => c.id === id)?.label || id || '';
    }

    function toast(kind, msg) {
        if (window.showToast) window.showToast(kind, msg);
    }

    function switchComposeTab(tab) {
        document.querySelectorAll('[data-brc-compose]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.brcCompose === tab);
        });
        document.querySelectorAll('[data-brc-compose-pane]').forEach((pane) => {
            pane.classList.toggle('is-active', pane.dataset.brcComposePane === tab);
        });
    }

    function applyAudience(mode) {
        if (!mode) return;
        const radio = document.querySelector(`input[name="mode"][value="${mode}"]`);
        if (!radio) return;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        if (mode === 'expiring_keys') {
            $('expiring-days-selector')?.classList.remove('hidden');
        }
    }

    function applyTemplate(text, audience, label) {
        const ta = $('broadcast-text');
        if (!ta || !text) return;
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        applyAudience(audience);
        switchComposeTab('editor');
        document.querySelector('[data-bc-target="compose"]')?.click();
        toast('success', label ? `Шаблон «${label}» применён` : 'Шаблон применён');
    }

    function filteredBuiltin() {
        const q = state.search.trim().toLowerCase();
        return state.presets.filter((p) => {
            if (state.category !== 'all' && p.category !== state.category) return false;
            if (!q) return true;
            const hay = `${p.label} ${p.desc} ${p.category} ${p.text}`.toLowerCase();
            return hay.includes(q);
        });
    }

    function filteredCustom() {
        const q = state.search.trim().toLowerCase();
        return Object.entries(state.custom).filter(([title, content]) => {
            if (!q) return true;
            return `${title} ${content}`.toLowerCase().includes(q);
        });
    }

    function renderCategories() {
        const wrap = $('brc-tpl-categories');
        if (!wrap) return;
        if (state.source !== 'builtin') {
            wrap.hidden = true;
            wrap.innerHTML = '';
            return;
        }
        wrap.hidden = false;
        const cats = [{ id: 'all', label: 'Все' }, ...state.categories];
        wrap.innerHTML = cats.map((c) => (
            `<button type="button" class="brc-cat-filter${state.category === c.id ? ' is-active' : ''}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`
        )).join('');
        wrap.querySelectorAll('.brc-cat-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.category = btn.dataset.cat || 'all';
                renderCategories();
                renderGrid();
            });
        });
    }

    function renderGrid() {
        const grid = $('brc-tpl-grid');
        const countEl = $('brc-tpl-count');
        if (!grid) return;

        if (state.source === 'custom') {
            const items = filteredCustom();
            if (!items.length) {
                grid.innerHTML = (
                    '<div class="brc-tpl-empty">' +
                    '<span class="material-symbols-outlined">bookmark_border</span>' +
                    '<p>Нет сохранённых шаблонов</p>' +
                    '<span>Напишите текст в редакторе и нажмите «Сохранить»</span>' +
                    '</div>'
                );
            } else {
                grid.innerHTML = items.map(([title, content]) => (
                    `<article class="brc-tpl-card brc-tpl-card--custom" data-custom-title="${encodeURIComponent(title)}">` +
                    `<span class="brc-tpl-card__icon material-symbols-outlined">bookmark</span>` +
                    `<span class="brc-tpl-card__badges"><span class="brc-tpl-card__cat">Мой</span></span>` +
                    `<h4 class="brc-tpl-card__title">${escapeHtml(title)}</h4>` +
                    `<p class="brc-tpl-card__snippet">${escapeHtml(snippet(content))}</p>` +
                    `<div class="brc-tpl-card__actions">` +
                    `<button type="button" class="brc-tpl-card__use" data-action="use">Использовать</button>` +
                    `<button type="button" class="brc-tpl-card__edit" data-action="edit" title="Редактировать"><span class="material-symbols-outlined">edit</span></button>` +
                    `<button type="button" class="brc-tpl-card__del" data-action="delete" title="Удалить"><span class="material-symbols-outlined">delete</span></button>` +
                    `</div></article>`
                )).join('');
            }
            if (countEl) countEl.textContent = `${items.length} сохранённых · максимум 5`;
            bindCustomCards(grid);
            return;
        }

        const items = filteredBuiltin();
        grid.innerHTML = items.map((p) => {
            const aud = AUDIENCE_LABELS[p.audience] || '';
            return (
                `<button type="button" class="brc-tpl-card" data-preset-id="${escapeHtml(p.id)}">` +
                `<span class="brc-tpl-card__icon material-symbols-outlined">${escapeHtml(p.icon || 'chat')}</span>` +
                `<span class="brc-tpl-card__badges">` +
                `<span class="brc-tpl-card__cat">${escapeHtml(catLabel(p.category))}</span>` +
                (aud ? `<span class="brc-tpl-card__aud">${escapeHtml(aud)}</span>` : '') +
                `</span>` +
                `<h4 class="brc-tpl-card__title">${escapeHtml(p.label)}</h4>` +
                `<p class="brc-tpl-card__meta">${escapeHtml(p.desc || '')}</p>` +
                `<p class="brc-tpl-card__snippet">${escapeHtml(snippet(p.text))}</p>` +
                `<span class="brc-tpl-card__use">Использовать <span class="material-symbols-outlined">arrow_forward</span></span>` +
                `</button>`
            );
        }).join('') || '<p class="brc-tpl-empty">Ничего не найдено</p>';

        if (countEl) countEl.textContent = `${items.length} из ${state.presets.length} готовых шаблонов`;

        grid.querySelectorAll('.brc-tpl-card[data-preset-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const preset = state.presets.find((p) => p.id === btn.dataset.presetId);
                if (preset) applyTemplate(preset.text, preset.audience, preset.label);
            });
        });
    }

    function bindCustomCards(grid) {
        grid.querySelectorAll('.brc-tpl-card--custom').forEach((card) => {
            const title = decodeURIComponent(card.dataset.customTitle || '');
            const content = state.custom[title] || '';
            card.querySelector('[data-action="use"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                applyTemplate(content, null, title);
            });
            card.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                $('modal-msg-title').value = title;
                $('modal-msg-content').value = content;
                window.openModal?.('newMessageModal');
            });
            card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await window.showCustomConfirm?.(`Удалить шаблон «${title}»?`, 'Удаление шаблона');
                if (!ok) return;
                const formData = new FormData();
                formData.append('title', title);
                formData.append('csrf_token', window.getCsrfToken?.() || '');
                try {
                    const resp = await fetch('/settings/themes/delete', { method: 'POST', body: formData });
                    const data = await resp.json();
                    if (data.ok) {
                        toast('success', 'Шаблон удалён');
                        await loadData();
                    }
                } catch (_) {
                    toast('danger', 'Ошибка удаления');
                }
            });
        });
    }

    async function loadData() {
        try {
            const resp = await fetch('/settings/broadcast/presets', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) return;
            state.categories = data.categories || [];
            state.presets = data.presets || [];
            state.custom = data.custom || {};
            renderCategories();
            renderGrid();
        } catch (e) {
            console.warn('Broadcast presets', e);
            const countEl = $('brc-tpl-count');
            if (countEl) countEl.textContent = 'Не удалось загрузить шаблоны';
        }
    }

    function bindEvents() {
        document.querySelectorAll('[data-brc-compose]').forEach((btn) => {
            btn.addEventListener('click', () => switchComposeTab(btn.dataset.brcCompose));
        });

        document.querySelectorAll('[data-brc-source]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.source = btn.dataset.brcSource || 'builtin';
                document.querySelectorAll('[data-brc-source]').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                });
                renderCategories();
                renderGrid();
            });
        });

        $('brc-tpl-search')?.addEventListener('input', (e) => {
            state.search = e.target.value;
            renderGrid();
        });

        $('brc-save-custom-tpl')?.addEventListener('click', () => {
            const ta = $('broadcast-text');
            const text = ta?.value?.trim() || '';
            if (!text) {
                toast('warning', 'Сначала напишите текст в редакторе');
                switchComposeTab('editor');
                return;
            }
            $('modal-msg-content').value = text;
            $('modal-msg-title').value = '';
            window.openModal?.('newMessageModal');
        });
    }

    window.loadBroadcastThemes = async function loadBroadcastThemes() {
        await loadData();
    };

    window.BroadcastTemplates = {
        reload: loadData,
        applyTemplate,
        switchComposeTab,
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('tab-broadcast')) return;
        bindEvents();
        loadData();
    });
})();
