/**
 * Dashboard Studio — layout customization for the main page
 */
(function () {
    'use strict';

    const TAB_WIDGET_MAP = {
        header: 'header_widgets',
        overview: 'overview',
        analytics: 'analytics',
        activity: 'activity',
    };

    const SEGMENT_OPTIONS = {
        title_size: [
            { value: 'sm', label: 'S', hint: 'Компактный' },
            { value: 'md', label: 'M', hint: 'Стандарт' },
            { value: 'lg', label: 'L', hint: 'Крупный' },
        ],
        stats_columns: [
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
        ],
        stats_density: [
            { value: 'compact', label: 'Плотно', icon: 'density_small' },
            { value: 'normal', label: 'Норма', icon: 'density_medium' },
            { value: 'relaxed', label: 'Простор', icon: 'density_large' },
        ],
        stats_card_style: [
            { value: 'glass', label: 'Glass', icon: 'blur_on' },
            { value: 'flat', label: 'Flat', icon: 'crop_square' },
            { value: 'outline', label: 'Outline', icon: 'border_style' },
        ],
        tab_style: [
            { value: 'glass', label: 'Glass', icon: 'blur_on' },
            { value: 'minimal', label: 'Minimal', icon: 'remove' },
            { value: 'solid', label: 'Solid', icon: 'view_agenda' },
        ],
        content_density: [
            { value: 'compact', label: 'Плотно', icon: 'density_small' },
            { value: 'normal', label: 'Норма', icon: 'density_medium' },
            { value: 'relaxed', label: 'Простор', icon: 'density_large' },
        ],
    };

    const TAB_HINTS = {
        header: 'Чипы статуса в шапке. Ниже — оформление заголовка.',
        overview: 'KPI-карточки на главной (всегда видны).',
        analytics: 'Графики доходов и регистраций.',
        activity: 'Speedtest, транзакции и триалы.',
        behavior: 'Вкладки, автообновление и поведение по умолчанию.',
    };

    let catalog = { widgets: [], groups: {}, tabs: [] };
    let layout = null;
    let draft = null;
    let studioTab = 'overview';
    let isSuperadmin = false;
    let savedLayoutOnOpen = null;

    function csrfHeaders(json) {
        const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
        if (json) h['Content-Type'] = 'application/json';
        if (window.getCsrfToken) h['X-CSRFToken'] = window.getCsrfToken();
        return h;
    }

    function widgetMeta(id) {
        return catalog.widgets.find((w) => w.id === id) || { id, label: id, group: '', icon: 'widgets' };
    }

    function cloneLayout(src) {
        return JSON.parse(JSON.stringify(src));
    }

    function getWidgetListKey(tab) {
        return TAB_WIDGET_MAP[tab] || tab;
    }

    function enabledSet(tab) {
        const key = getWidgetListKey(tab);
        if (key === 'header_widgets') return new Set(draft.header_widgets || []);
        return new Set((draft.widgets && draft.widgets[tab]) || []);
    }

    function reorderWidget(tab, id, dir) {
        const key = getWidgetListKey(tab);
        let list;
        if (key === 'header_widgets') {
            list = [...(draft.header_widgets || [])];
        } else {
            list = [...((draft.widgets && draft.widgets[tab]) || [])];
        }
        const allIds = catalog.widgets.filter((w) => w.tab === tab).map((w) => w.id);
        const enabled = list.filter((x) => allIds.includes(x));
        const disabled = allIds.filter((x) => !enabled.includes(x));
        const ordered = [...enabled, ...disabled];
        const idx = ordered.indexOf(id);
        if (idx < 0) return;
        const j = idx + dir;
        if (j < 0 || j >= ordered.length) return;
        ordered.splice(idx, 1);
        ordered.splice(j, 0, id);
        const newEnabled = ordered.filter((x) => enabled.includes(x));
        if (key === 'header_widgets') {
            draft.header_widgets = newEnabled;
        } else {
            draft.widgets[tab] = newEnabled;
        }
    }

    function toggleWidget(tab, id, on) {
        const key = getWidgetListKey(tab);
        let list;
        if (key === 'header_widgets') {
            list = new Set(draft.header_widgets || []);
        } else {
            list = new Set((draft.widgets && draft.widgets[tab]) || []);
        }
        if (on) list.add(id);
        else list.delete(id);
        const arr = [...list];
        if (key === 'header_widgets') draft.header_widgets = arr;
        else draft.widgets[tab] = arr;
    }

    function applyWidgetVisibility(tab, orderedIds) {
        const enabled = new Set(orderedIds);
        document.querySelectorAll(`[data-dash-widget]`).forEach((el) => {
            const wid = el.getAttribute('data-dash-widget');
            const meta = widgetMeta(wid);
            if (meta.tab !== tab) return;
            el.classList.toggle('dash-widget-hidden', !enabled.has(wid));
        });
        const container = tab === 'overview' ? document.getElementById('dash-stats') : null;
        if (!container) return;
        orderedIds.forEach((id) => {
            const el = container.querySelector(`[data-dash-widget="${id}"]`);
            if (el) container.appendChild(el);
        });
    }

    function applyDesignClasses(opts) {
        if (!opts) return;
        const o = opts;

        const pageHead = document.getElementById('dash-hero')
            || document.querySelector('.dh-hero, .dash-hero, .dashboard-page .dash-page-head, .dashboard-page .dashboard-header');
        if (pageHead) {
            pageHead.classList.remove('dash-title-sm', 'dash-title-md', 'dash-title-lg', 'dash-no-eyebrow');
            pageHead.classList.add(`dash-title-${o.title_size || 'md'}`);
            if (!o.show_eyebrow) pageHead.classList.add('dash-no-eyebrow');
        }

        const stats = document.getElementById('dash-stats');
        if (stats) {
            stats.classList.remove('dash-density-compact', 'dash-density-normal', 'dash-density-relaxed');
            stats.classList.remove('dash-cards-glass', 'dash-cards-flat', 'dash-cards-outline');
            stats.classList.add(`dash-density-${o.stats_density || 'normal'}`);
            stats.classList.add(`dash-cards-${o.stats_card_style || 'glass'}`);
        }

        const tabs = document.getElementById('dash-tabs');
        if (tabs) {
            tabs.classList.remove('dash-tabs-glass', 'dash-tabs-minimal', 'dash-tabs-solid');
            tabs.classList.add(`dash-tabs-${o.tab_style || 'glass'}`);
        }

        ['dash-panel-analytics', 'dash-panel-activity'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('dash-density-compact', 'dash-density-normal', 'dash-density-relaxed');
            el.classList.add(`dash-density-${o.content_density || 'normal'}`);
        });
    }

    function segmentControl(name, options, current) {
        return `
            <div class="dash-design-segment" role="group" aria-label="${name}">
                ${options.map((opt) => `
                    <button type="button"
                        class="dash-design-segment__btn${String(current) === String(opt.value) ? ' is-active' : ''}"
                        data-segment="${name}"
                        data-value="${opt.value}"
                        title="${opt.hint || opt.label}">
                        ${opt.icon ? `<span class="material-symbols-outlined">${opt.icon}</span>` : ''}
                        <span>${opt.label}</span>
                    </button>`).join('')}
            </div>`;
    }

    function designCard(title, icon, body) {
        return `
            <div class="dash-design-card">
                <div class="dash-design-card__head">
                    <span class="material-symbols-outlined">${icon}</span>
                    <span>${title}</span>
                </div>
                <div class="dash-design-card__body">${body}</div>
            </div>`;
    }

    function renderTabDesignPanel() {
        const designEl = document.getElementById('dash-studio-design');
        const behaviorEl = document.getElementById('dash-studio-behavior');
        if (!draft) return;

        const o = draft.options || {};

        if (studioTab === 'behavior') {
            if (designEl) designEl.innerHTML = '';
            if (!behaviorEl) return;
            behaviorEl.innerHTML = `
                ${designCard('Навигация', 'tab', `
                    <label class="dash-design-field">
                        <span>Вкладка по умолчанию</span>
                        <select id="dash-opt-default-tab" class="dash-studio-input"></select>
                    </label>
                    <label class="dash-design-field">
                        <span>Стиль вкладок</span>
                        ${segmentControl('tab_style', SEGMENT_OPTIONS.tab_style, o.tab_style || 'glass')}
                    </label>
                    <div class="dash-design-field">
                        <span>Видимые вкладки</span>
                        <div class="dash-studio-tabs-enable" id="dash-opt-tabs"></div>
                    </div>
                `)}
                ${designCard('Данные и обновление', 'sync', `
                    <label class="dash-design-field">
                        <span>Период доходов по умолчанию</span>
                        <select id="dash-opt-income-period" class="dash-studio-input">
                            <option value="today">Сегодня</option>
                            <option value="7d">7 дней</option>
                            <option value="30d">30 дней</option>
                            <option value="3m">3 мес</option>
                            <option value="6m">6 мес</option>
                            <option value="12m">1 год</option>
                            <option value="all">Все</option>
                        </select>
                    </label>
                    <label class="dash-design-field">
                        <span>Автообновление (сек)</span>
                        <input type="number" id="dash-opt-refresh" class="dash-studio-input" min="30" max="600" step="30" />
                    </label>
                    <label class="dash-design-check">
                        <input type="checkbox" id="dash-opt-hide-payments" />
                        <span>Скрывать платёжные карточки по умолчанию</span>
                    </label>
                `)}
            `;
            bindDesignFormEvents();
            fillOptionsForm();
            return;
        }

        if (behaviorEl) behaviorEl.innerHTML = '';
        if (!designEl) return;

        let cards = '';

        if (studioTab === 'header') {
            cards = `
                ${designCard('Тексты', 'title', `
                    <label class="dash-design-field">
                        <span>Заголовок</span>
                        <input type="text" id="dash-opt-title" class="dash-studio-input" placeholder="Дашборд" maxlength="120" />
                    </label>
                    <label class="dash-design-field">
                        <span>Подзаголовок</span>
                        <input type="text" id="dash-opt-subtitle" class="dash-studio-input" placeholder="Статистика, мониторинг и аналитика" maxlength="200" />
                    </label>
                `)}
                ${designCard('Шапка', 'web_asset', `
                    <label class="dash-design-field">
                        <span>Размер заголовка</span>
                        ${segmentControl('title_size', SEGMENT_OPTIONS.title_size, o.title_size || 'md')}
                    </label>
                    <label class="dash-design-check">
                        <input type="checkbox" id="dash-opt-show-eyebrow" />
                        <span>Показывать бейдж «Панель управления»</span>
                    </label>
                    <label class="dash-design-check">
                        <input type="checkbox" id="dash-opt-compact-header" />
                        <span>Компактная шапка (скрыть чипы статуса)</span>
                    </label>
                    <div class="dash-design-preview dash-design-preview--hero" aria-hidden="true">
                        <div class="dash-design-preview__eyebrow${o.show_eyebrow !== false ? '' : ' is-off'}">Панель управления · Главная</div>
                        <div class="dash-design-preview__title dash-design-preview__title--${o.title_size || 'md'}">${o.title || 'Дашборд'}</div>
                        <div class="dash-design-preview__sub">${o.subtitle || 'Статистика, мониторинг и аналитика'}</div>
                    </div>
                `)}
            `;
        } else if (studioTab === 'overview') {
            cards = `
                ${designCard('Сетка карточек', 'grid_view', `
                    <label class="dash-design-field">
                        <span>Колонок на десктопе</span>
                        ${segmentControl('stats_columns', SEGMENT_OPTIONS.stats_columns, String(o.stats_columns || 5))}
                    </label>
                    <label class="dash-design-field">
                        <span>Плотность</span>
                        ${segmentControl('stats_density', SEGMENT_OPTIONS.stats_density, o.stats_density || 'normal')}
                    </label>
                `)}
                ${designCard('Стиль карточек', 'style', `
                    <label class="dash-design-field">
                        <span>Внешний вид</span>
                        ${segmentControl('stats_card_style', SEGMENT_OPTIONS.stats_card_style, o.stats_card_style || 'glass')}
                    </label>
                    <div class="dash-design-preview dash-design-preview--cards dash-cards-${o.stats_card_style || 'glass'} dash-density-${o.stats_density || 'normal'}" aria-hidden="true">
                        <div class="dash-design-preview__stat"><span>Users</span><strong>128</strong></div>
                        <div class="dash-design-preview__stat"><span>Keys</span><strong>64</strong></div>
                        <div class="dash-design-preview__stat"><span>Earned</span><strong>12k</strong></div>
                    </div>
                `)}
            `;
        } else if (studioTab === 'analytics' || studioTab === 'activity') {
            const extra = studioTab === 'analytics' ? `
                <label class="dash-design-field">
                    <span>Период доходов по умолчанию</span>
                    <select id="dash-opt-income-period" class="dash-studio-input">
                        <option value="today">Сегодня</option>
                        <option value="7d">7 дней</option>
                        <option value="30d">30 дней</option>
                        <option value="3m">3 мес</option>
                        <option value="6m">6 мес</option>
                        <option value="12m">1 год</option>
                        <option value="all">Все</option>
                    </select>
                </label>
            ` : '';
            cards = designCard('Контент вкладки', 'view_compact', `
                <label class="dash-design-field">
                    <span>Плотность блоков</span>
                    ${segmentControl('content_density', SEGMENT_OPTIONS.content_density, o.content_density || 'normal')}
                </label>
                ${extra}
            `);
        }

        designEl.innerHTML = cards ? `<div class="dash-design-stack">${cards}</div>` : '';
        bindDesignFormEvents();
        fillOptionsForm();
    }

    function bindDesignFormEvents() {
        document.querySelectorAll('[data-segment]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.segment;
                const val = btn.dataset.value;
                if (!draft.options) draft.options = {};
                if (key === 'stats_columns') {
                    draft.options.stats_columns = parseInt(val, 10);
                } else {
                    draft.options[key] = val;
                }
                readOptionsForm();
                applyLayout(draft);
                renderTabDesignPanel();
            });
        });

        ['dash-opt-title', 'dash-opt-subtitle'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', () => {
                readOptionsForm();
                applyLayout(draft);
                renderTabDesignPanel();
            });
        });

        ['dash-opt-show-eyebrow', 'dash-opt-compact-header', 'dash-opt-hide-payments'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => {
                readOptionsForm();
                applyLayout(draft);
                if (id === 'dash-opt-show-eyebrow' || id === 'dash-opt-compact-header') {
                    renderTabDesignPanel();
                }
            });
        });

        document.getElementById('dash-opt-default-tab')?.addEventListener('change', () => readOptionsForm());
        document.getElementById('dash-opt-income-period')?.addEventListener('change', () => readOptionsForm());
        document.getElementById('dash-opt-refresh')?.addEventListener('input', () => readOptionsForm());

        document.querySelectorAll('#dash-opt-tabs [data-dash-tab]').forEach((inp) => {
            inp.addEventListener('change', () => readOptionsForm());
        });
    }

    function applyLayout(cfg) {
        if (!cfg) return;
        layout = cfg;
        const opts = cfg.options || {};

        const titleEl = document.getElementById('dash-custom-title');
        const subEl = document.getElementById('dash-custom-subtitle');
        const subTextEl = subEl?.querySelector('.dashboard-subtitle__text, .dash-hero__sub-text');
        const titleText = opts.title || 'Панель управления';
        if (titleEl) {
            const gradEl = titleEl.querySelector('.dashboard-title__gradient');
            if (gradEl) gradEl.textContent = titleText;
            else titleEl.textContent = titleText;
        }
        const subtitle = opts.subtitle || 'Статистика, мониторинг и аналитика в реальном времени';
        if (subTextEl) subTextEl.textContent = subtitle;
        else if (subEl) subEl.textContent = subtitle;

        applyDesignClasses(opts);

        const chips = document.getElementById('dash-header-chips');
        if (chips) {
            chips.classList.toggle('dash-header-compact', !!opts.compact_header);
            (cfg.header_widgets || []).forEach((id) => {
                const el = chips.querySelector(`[data-dash-widget="${id}"]`);
                if (el) chips.appendChild(el);
            });
            applyWidgetVisibility('header', cfg.header_widgets || []);
        }

        const stats = document.getElementById('dash-stats');
        if (stats) {
            stats.classList.remove('dash-cols-2', 'dash-cols-3', 'dash-cols-4', 'dash-cols-5');
            const cols = opts.stats_columns || 5;
            stats.classList.add(`dash-cols-${cols}`);
            applyWidgetVisibility('overview', (cfg.widgets && cfg.widgets.overview) || []);
        }

        ['analytics', 'activity'].forEach((tab) => {
            const ids = (cfg.widgets && cfg.widgets[tab]) || [];
            applyWidgetVisibility(tab, ids);
            const root = tab === 'analytics' ? document.getElementById('dash-panel-analytics')
                    : document.getElementById('dash-panel-activity');
            if (root) {
                ids.forEach((id) => {
                    const el = root.querySelector(`[data-dash-widget="${id}"]`);
                    if (el) root.appendChild(el);
                });
            }
        });

        (cfg.tabs || []).forEach((tabId) => {
            const btn = document.querySelector(`.dash-tab[data-tab="${tabId}"]`);
            if (btn) btn.classList.remove('dash-tab-hidden');
        });
        catalog.tabs.forEach(({ id }) => {
            if (!(cfg.tabs || []).includes(id)) {
                const btn = document.querySelector(`.dash-tab[data-tab="${id}"]`);
                if (btn) btn.classList.add('dash-tab-hidden');
            }
        });

        if (opts.hide_payments_default) {
            const statsCont = document.getElementById('dash-stats');
            if (statsCont && !localStorage.getItem('hide_payment_stats')) {
                statsCont.classList.add('hide-payments');
                localStorage.setItem('hide_payment_stats', 'true');
                const icon = document.getElementById('icon-toggle-payments');
                if (icon) icon.textContent = 'visibility_off';
            }
        }

        const interval = opts.refresh_interval_ms;
        if (interval) {
            document.querySelectorAll('[data-fetch-interval]').forEach((el) => {
                el.dataset.fetchInterval = String(interval);
            });
            if (typeof window.restartDashboardAutoRefresh === 'function') {
                window.restartDashboardAutoRefresh();
            }
        }

        if (opts.default_income_period && typeof window.setIncomePeriod === 'function') {
            const btn = document.getElementById(`p-${opts.default_income_period}`);
            if (btn) window.setIncomePeriod(opts.default_income_period, btn);
        }

        const defaultTab = (opts.default_tab === 'overview' || opts.default_tab === 'resources') ? 'analytics' : opts.default_tab;
        if (defaultTab && !window.location.hash) {
            const tabBtn = document.querySelector(`.dash-tab[data-tab="${defaultTab}"]`);
            if (tabBtn && typeof window.switchDashTab === 'function') {
                window.switchDashTab(defaultTab);
            }
        }
    }

    function renderStudioList() {
        const listEl = document.getElementById('dash-studio-widget-list');
        const hintEl = document.getElementById('dash-studio-hint');
        if (!listEl || !draft) return;

        if (hintEl) {
            hintEl.textContent = TAB_HINTS[studioTab] || TAB_HINTS.overview;
        }

        if (studioTab === 'behavior') {
            document.getElementById('dash-studio-section-widgets')?.classList.add('is-hidden');
            document.getElementById('dash-studio-section-options')?.classList.add('is-active');
            renderTabDesignPanel();
            return;
        }
        document.getElementById('dash-studio-section-widgets')?.classList.remove('is-hidden');
        document.getElementById('dash-studio-section-options')?.classList.remove('is-active');

        const tab = studioTab;
        const enabled = enabledSet(tab);
        const key = getWidgetListKey(tab);
        const ordered = key === 'header_widgets'
            ? [...(draft.header_widgets || [])]
            : [...((draft.widgets && draft.widgets[tab]) || [])];
        const allInTab = catalog.widgets.filter((w) => w.tab === tab);
        const disabled = allInTab.map((w) => w.id).filter((id) => !ordered.includes(id));
        const displayOrder = [...ordered, ...disabled];

        listEl.innerHTML = displayOrder.map((id) => {
            const m = widgetMeta(id);
            const on = enabled.has(id);
            const grp = catalog.groups[m.group] || m.group || '';
            return `
                <div class="dash-studio-widget-row${on ? '' : ' is-off'}" data-row-id="${id}">
                    <label class="dash-studio-check" style="margin:0;grid-column:auto;">
                        <input type="checkbox" data-toggle-widget="${id}" ${on ? 'checked' : ''} />
                    </label>
                    <span class="material-symbols-outlined dash-studio-widget-row__icon">${m.icon || 'widgets'}</span>
                    <span class="dash-studio-widget-row__label">${m.label}</span>
                    <span class="dash-studio-widget-row__group">${grp}</span>
                    <div class="dash-studio-widget-row__actions">
                        <button type="button" data-move="-1" data-id="${id}" title="Выше">↑</button>
                        <button type="button" data-move="1" data-id="${id}" title="Ниже">↓</button>
                    </div>
                </div>`;
        }).join('');

        listEl.querySelectorAll('[data-toggle-widget]').forEach((inp) => {
            inp.addEventListener('change', () => {
                toggleWidget(tab, inp.dataset.toggleWidget, inp.checked);
                renderStudioList();
            });
        });
        listEl.querySelectorAll('[data-move]').forEach((btn) => {
            btn.addEventListener('click', () => {
                reorderWidget(tab, btn.dataset.id, parseInt(btn.dataset.move, 10));
                renderStudioList();
            });
        });
        renderTabDesignPanel();
    }

    function renderStudioTabs() {
        const nav = document.getElementById('dash-studio-tab-nav');
        if (!nav) return;
        const items = [
            { id: 'header', label: 'Шапка', icon: 'web_asset' },
            catalog.pinned_tab
                ? { id: catalog.pinned_tab.id, label: catalog.pinned_tab.label, icon: 'grid_view' }
                : { id: 'overview', label: 'KPI на главной', icon: 'grid_view' },
            ...(catalog.tabs || []),
            { id: 'behavior', label: 'Поведение', icon: 'tune' },
        ];
        nav.innerHTML = items.map((t) => `
            <button type="button" class="dash-studio-tab${studioTab === t.id ? ' is-active' : ''}" data-studio-tab="${t.id}">
                <span class="material-symbols-outlined" style="font-size:1rem">${t.icon || 'tab'}</span>
                ${t.label}
            </button>`).join('');
        nav.querySelectorAll('[data-studio-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                studioTab = btn.dataset.studioTab;
                renderStudioTabs();
                renderStudioList();
            });
        });
    }

    function fillOptionsForm() {
        const o = draft?.options || {};
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        ensureDefaultTabSelect();
        set('dash-opt-title', o.title || '');
        set('dash-opt-subtitle', o.subtitle || '');
        set('dash-opt-default-tab', o.default_tab || 'analytics');
        set('dash-opt-stats-cols', String(o.stats_columns || 5));
        set('dash-opt-income-period', o.default_income_period || '30d');
        set('dash-opt-refresh', String(Math.round((o.refresh_interval_ms || 120000) / 1000)));
        const hp = document.getElementById('dash-opt-hide-payments');
        if (hp) hp.checked = !!o.hide_payments_default;
        const ch = document.getElementById('dash-opt-compact-header');
        if (ch) ch.checked = !!o.compact_header;
        const se = document.getElementById('dash-opt-show-eyebrow');
        if (se) se.checked = o.show_eyebrow !== false;
        renderTabCheckboxes();
    }

    function renderTabCheckboxes() {
        const wrap = document.getElementById('dash-opt-tabs');
        if (!wrap || !draft) return;
        const enabled = new Set(draft.tabs || []);
        wrap.innerHTML = (catalog.tabs || []).map((t) => `
            <label>
                <input type="checkbox" data-dash-tab="${t.id}" ${enabled.has(t.id) ? 'checked' : ''} />
                ${t.label}
            </label>`).join('');
    }

    function readOptionsForm() {
        const o = { ...(draft.options || {}) };
        const titleEl = document.getElementById('dash-opt-title');
        if (titleEl) o.title = titleEl.value.trim();
        const subEl = document.getElementById('dash-opt-subtitle');
        if (subEl) o.subtitle = subEl.value.trim();

        const defaultTabEl = document.getElementById('dash-opt-default-tab');
        if (defaultTabEl) o.default_tab = defaultTabEl.value || 'analytics';

        const colsEl = document.getElementById('dash-opt-stats-cols');
        if (colsEl) o.stats_columns = parseInt(colsEl.value || '5', 10);

        const periodEl = document.getElementById('dash-opt-income-period');
        if (periodEl) o.default_income_period = periodEl.value || '30d';

        const refreshEl = document.getElementById('dash-opt-refresh');
        if (refreshEl) {
            const sec = parseInt(refreshEl.value || '120', 10);
            o.refresh_interval_ms = Math.max(30, Math.min(600, sec)) * 1000;
        }

        const hp = document.getElementById('dash-opt-hide-payments');
        if (hp) o.hide_payments_default = !!hp.checked;
        const ch = document.getElementById('dash-opt-compact-header');
        if (ch) o.compact_header = !!ch.checked;
        const se = document.getElementById('dash-opt-show-eyebrow');
        if (se) o.show_eyebrow = !!se.checked;
        draft.options = o;

        const tabWrap = document.getElementById('dash-opt-tabs');
        if (tabWrap) {
            const tabs = [];
            tabWrap.querySelectorAll('[data-dash-tab]').forEach((inp) => {
                if (inp.checked) tabs.push(inp.dataset.dashTab);
            });
            draft.tabs = tabs.length ? tabs : ['analytics', 'activity'];
        }
    }

    function closeStudio(revert) {
        if (revert && savedLayoutOnOpen) {
            applyLayout(savedLayoutOnOpen);
        }
        document.getElementById('dashboardStudioModal')?.classList.remove('open');
    }

    function openStudio() {
        savedLayoutOnOpen = cloneLayout(layout || window.__DASHBOARD_LAYOUT__ || {});
        draft = cloneLayout(savedLayoutOnOpen);
        studioTab = 'overview';
        renderStudioTabs();
        renderStudioList();
        const globalBtn = document.getElementById('dash-studio-save-global');
        if (globalBtn) globalBtn.hidden = !isSuperadmin;
        if (typeof window.openModal === 'function') window.openModal('dashboardStudioModal');
        else document.getElementById('dashboardStudioModal')?.classList.add('open');
    }

    async function saveLayout(scope) {
        readOptionsForm();
        const res = await fetch('/dashboard/layout/prefs', {
            method: 'POST',
            credentials: 'same-origin',
            headers: csrfHeaders(true),
            body: JSON.stringify({ layout: draft, scope: scope || 'admin' }),
        });
        const data = await res.json();
        if (!data.ok) {
            window.showToast?.('danger', data.error || 'Ошибка сохранения');
            return;
        }
        layout = data.layout;
        window.__DASHBOARD_LAYOUT__ = layout;
        applyLayout(layout);
        window.showToast?.('success', scope === 'global' ? 'Глобальный макет сохранён' : 'Макет сохранён');
        savedLayoutOnOpen = cloneLayout(layout);
        closeStudio(false);
    }

    async function resetLayout() {
        const ok = await window.showConfirm?.({
            title: 'Сброс макета',
            message: 'Вернуть главную к настройкам по умолчанию (глобальным)?',
            type: 'warning',
            confirmText: 'Сбросить',
        });
        if (!ok) return;
        const res = await fetch('/dashboard/layout/prefs', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: csrfHeaders(false),
        });
        const data = await res.json();
        if (data.ok) {
            layout = data.layout;
            window.__DASHBOARD_LAYOUT__ = layout;
            applyLayout(layout);
            window.showToast?.('success', 'Макет сброшен');
        }
    }

    async function loadConfig() {
        if (window.__DASHBOARD_LAYOUT__) {
            layout = window.__DASHBOARD_LAYOUT__;
            applyLayout(layout);
        }
        try {
            const res = await fetch('/dashboard/layout/config.json', {
                credentials: 'same-origin',
                headers: csrfHeaders(false),
            });
            const data = await res.json();
            if (!data.ok) return;
            catalog = data.catalog || catalog;
            layout = data.layout || layout;
            isSuperadmin = !!data.is_superadmin;
            window.__DASHBOARD_LAYOUT__ = layout;
            applyLayout(layout);
            populateDefaultTabSelect();
        } catch (e) {
            console.warn('Dashboard Studio config load failed', e);
        }
    }

    function ensureDefaultTabSelect() {
        const sel = document.getElementById('dash-opt-default-tab');
        if (!sel || sel.options.length) return;
        (catalog.tabs || []).forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.label;
            sel.appendChild(opt);
        });
    }

    function populateDefaultTabSelect() {
        ensureDefaultTabSelect();
    }

    function hookRefreshSection() {
        const orig = window.refreshDashboardSection;
        if (typeof orig !== 'function' || orig.__dashStudioWrapped) return;
        window.refreshDashboardSection = async function wrappedRefresh(id) {
            await orig(id);
            if (id === 'dash-stats' && layout) {
                applyWidgetVisibility('overview', (layout.widgets && layout.widgets.overview) || []);
            }
        };
        window.refreshDashboardSection.__dashStudioWrapped = true;
    }

    function bindEvents() {
        document.getElementById('dash-open-studio')?.addEventListener('click', openStudio);
        document.getElementById('dash-studio-close')?.addEventListener('click', () => closeStudio(true));
        document.getElementById('dash-studio-save')?.addEventListener('click', () => saveLayout('admin'));
        document.getElementById('dash-studio-save-global')?.addEventListener('click', () => saveLayout('global'));
        document.getElementById('dash-studio-reset')?.addEventListener('click', resetLayout);
        document.getElementById('dash-studio-preview')?.addEventListener('click', () => {
            readOptionsForm();
            applyLayout(draft);
            savedLayoutOnOpen = cloneLayout(draft);
            closeStudio(false);
            window.showToast?.('info', 'Черновик на странице — сохраните в Studio, чтобы не потерять');
        });
        document.getElementById('dashboardStudioModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'dashboardStudioModal') {
                closeStudio(true);
            }
        });
        if (window.location.hash === '#customize') {
            setTimeout(openStudio, 400);
        }
    }

    window.DashboardStudio = { applyLayout, openStudio, loadConfig };

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.getElementById('dash-stats')) return;
        bindEvents();
        hookRefreshSection();
        loadConfig();
    });
})();
