/**
 * Mail Studio — SMTP template editor
 */
(function () {
    'use strict';

    const PREVIEW_DEBOUNCE = 400;
    const SUBJECT_SOFT_MAX = 60;
    const PREHEADER_SOFT_MAX = 100;

    const ACCENT_PRESETS = [
        { color: '#0A84FF', label: 'Синий' },
        { color: '#5856D6', label: 'Фиолетовый' },
        { color: '#34C759', label: 'Зелёный' },
        { color: '#FF9500', label: 'Оранжевый' },
        { color: '#FF2D55', label: 'Розовый' },
        { color: '#64D2FF', label: 'Голубой' },
    ];

    const HTML_SNIPPETS = [
        { label: 'Абзац', html: '<p style="margin:0 0 12px;line-height:1.55;">Текст абзаца</p>' },
        { label: 'Код', html: '<p style="margin:16px 0;text-align:center;"><span style="display:inline-block;padding:14px 28px;font-size:28px;font-weight:700;letter-spacing:0.2em;background:#f5f5f7;border-radius:12px;">{{code}}</span></p>' },
        { label: 'Список', html: '<ul style="margin:0 0 12px;padding-left:1.2em;line-height:1.55;"><li>Пункт один</li><li>Пункт два</li></ul>' },
        { label: 'Таблица', html: '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;"><tr><td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">Поле</td><td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600;">Значение</td></tr></table>' },
        { label: 'Инфо', html: '<div style="margin:12px 0;padding:12px 14px;border-radius:10px;background:#e8f4fd;border:1px solid #b3d9f7;font-size:13px;line-height:1.5;color:#1c1c1e;">Информационный блок</div>' },
        { label: 'Внимание', html: '<div style="margin:12px 0;padding:12px 14px;border-radius:10px;background:#fff4e5;border:1px solid #ffd699;font-size:13px;line-height:1.5;color:#1c1c1e;">Предупреждение</div>' },
        { label: 'Разделитель', html: '<hr style="margin:20px 0;border:none;border-top:1px solid rgba(0,0,0,0.08);" />' },
        { label: '2 колонки', html: '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0;"><tr><td style="width:50%;padding:0 8px 0 0;vertical-align:top;font-size:14px;line-height:1.5;">Левая</td><td style="width:50%;padding:0 0 0 8px;vertical-align:top;font-size:14px;line-height:1.5;">Правая</td></tr></table>' },
        { label: 'Примечание', html: '<p style="margin:12px 0 0;font-size:13px;color:#8e8e93;">Серый текст-подсказка</p>' },
    ];

    const FIELD_IDS = [
        'mtm-subject', 'mtm-preheader', 'mtm-headline',
        'mtm-body', 'mtm-cta-label', 'mtm-cta-url', 'mtm-footer',
    ];

    let state = {
        templates: {},
        meta: [],
        accent: '#0A84FF',
        brand: 'Remnawave App',
        footer: '',
        activeId: null,
        filter: 'all',
        search: '',
        device: 'desktop',
        zoom: 1,
        lastHtml: '',
        lastSubject: '',
        lastPreheader: '',
        previewRequestId: 0,
        lastFocusedFieldId: 'mtm-body',
        hasPreview: false,
    };

    let previewTimer = null;

    function isMailStudioPage() {
        return !!(document.getElementById('mtm-page-root') || document.getElementById('tab-mail-templates'));
    }

    function isMailChannelActive() {
        const root = $('mtm-page-root');
        return !!root && !root.hidden;
    }

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
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try {
                data = await resp.json();
            } catch (_) {
                data = { ok: false, error: `Ошибка ${resp.status}` };
            }
        } else {
            data = { ok: false, error: `Некорректный ответ (${resp.status})` };
        }
        return { resp, data };
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getDraft() {
        return {
            subject: $('mtm-subject')?.value || '',
            headline: $('mtm-headline')?.value || '',
            body: $('mtm-body')?.value || '',
            cta_label: $('mtm-cta-label')?.value || '',
            cta_url: $('mtm-cta-url')?.value || '',
            preheader: $('mtm-preheader')?.value || '',
        };
    }

    function getFooterDraft() {
        return $('mtm-footer')?.value || '';
    }

    function fillFooter(footer) {
        const el = $('mtm-footer');
        if (el) el.value = footer || '';
    }

    function fillForm(tpl) {
        if (!tpl) return;
        const map = {
            'mtm-subject': tpl.subject,
            'mtm-headline': tpl.headline,
            'mtm-body': tpl.body,
            'mtm-cta-label': tpl.cta_label,
            'mtm-cta-url': tpl.cta_url,
            'mtm-preheader': tpl.preheader,
        };
        Object.entries(map).forEach(([id, val]) => {
            const el = $(id);
            if (el) el.value = val || '';
        });
        updateFieldHints();
    }

    function charHint(len, softMax) {
        if (len <= softMax) return `${len} / ~${softMax}`;
        return `${len} — длинновато`;
    }

    function hintClass(len, softMax) {
        if (len <= softMax) return 'is-ok';
        if (len <= softMax + 20) return 'is-warn';
        return 'is-bad';
    }

    function validateCtaUrl(raw) {
        const val = (raw || '').trim();
        if (!val) return { ok: true, hint: '' };
        if (/^\{\{\s*\w+\s*\}\}$/.test(val)) return { ok: true, hint: 'переменная' };
        if (/^https:\/\/.+/i.test(val) && !/^javascript:/i.test(val) && !/^data:/i.test(val)) {
            return { ok: true, hint: 'https ✓' };
        }
        return { ok: false, hint: 'https или {{var}}' };
    }

    function updateFieldHints() {
        const subj = $('mtm-subject')?.value || '';
        const pre = $('mtm-preheader')?.value || '';
        const cta = $('mtm-cta-url')?.value || '';

        const subjHint = $('mtm-subject-hint');
        if (subjHint) {
            subjHint.textContent = charHint(subj.length, SUBJECT_SOFT_MAX);
            subjHint.className = `mtm-hint-inline ${hintClass(subj.length, SUBJECT_SOFT_MAX)}`;
        }

        const preHint = $('mtm-preheader-hint');
        if (preHint) {
            preHint.textContent = charHint(pre.length, PREHEADER_SOFT_MAX);
            preHint.className = `mtm-hint-inline ${hintClass(pre.length, PREHEADER_SOFT_MAX)}`;
        }

        const ctaCheck = validateCtaUrl(cta);
        const ctaHint = $('mtm-cta-url-hint');
        if (ctaHint) {
            ctaHint.textContent = ctaCheck.hint;
            ctaHint.className = `mtm-hint-inline mtm-hint-inline--status ${ctaCheck.ok ? 'is-ok' : 'is-bad'}`;
        }
    }

    function setPreviewVisible(on) {
        state.hasPreview = on;
        const empty = $('mtm-preview-empty');
        const frame = $('mtm-mail-frame');
        if (empty) empty.hidden = on;
        if (frame) frame.hidden = !on;
        ['mtm-copy-html', 'mtm-preview-expand', 'mtm-open-tab'].forEach((id) => {
            const btn = $(id);
            if (btn) btn.disabled = !on;
        });
    }

    function updateInboxMock(subject, preheader) {
        const subj = subject || '—';
        const pre = preheader || '—';
        const from = state.brand || 'Remnawave App';

        ['', '-modal'].forEach((suffix) => {
            const fromEl = $(`mtm-inbox-from${suffix}`);
            const subjEl = $(`mtm-inbox-subject${suffix}`);
            const preEl = $(`mtm-inbox-preheader${suffix}`);
            if (fromEl) fromEl.textContent = from;
            if (subjEl) subjEl.textContent = subj;
            if (preEl) preEl.textContent = pre;
        });
    }

    function applyPreviewToIframes(html) {
        const inline = $('mtm-preview-iframe');
        const modal = $('mtm-preview-iframe-modal');
        if (inline) inline.srcdoc = html || '';
        if (modal && modal.closest('.modal-overlay.open')) {
            modal.srcdoc = html || '';
        }
    }

    function applyDeviceMode(device) {
        state.device = device;
        document.querySelectorAll('[data-mtm-device]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.mtmDevice === device);
        });
        document.querySelectorAll('[data-mtm-device-modal]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.mtmDeviceModal === device);
        });
        ['mtm-preview-device', 'mtm-preview-device-modal'].forEach((id) => {
            const el = $(id);
            if (!el) return;
            el.classList.toggle('mtm-mail-frame__device--mobile', device === 'mobile');
            el.classList.toggle('mtm-mail-frame__device--desktop', device !== 'mobile');
        });
    }

    function applyZoom(zoom) {
        state.zoom = zoom;
        const scale = String(zoom);
        ['mtm-preview-zoom', 'mtm-preview-zoom-modal'].forEach((id) => {
            const sel = $(id);
            if (sel) sel.value = scale;
        });
        document.querySelectorAll('.mtm-mail-frame__device iframe').forEach((iframe) => {
            iframe.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
            iframe.style.marginBottom = zoom === 1 ? '' : `${(zoom - 1) * 200}px`;
        });
    }

    function setAccent(color) {
        state.accent = color;
        const accentInput = $('mtm-accent');
        if (accentInput) accentInput.value = color;
        document.documentElement.style.setProperty('--mtm-accent', color);
        document.querySelectorAll('.mtm-accent-preset').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.color === color);
        });
        if (state.activeId) schedulePreview();
    }

    function renderAccentPresets() {
        const wrap = $('mtm-accent-presets');
        if (!wrap) return;
        wrap.innerHTML = ACCENT_PRESETS.map(
            (p) => `<button type="button" class="mtm-accent-preset" data-color="${escapeHtml(p.color)}" title="${escapeHtml(p.label)}" style="--preset-color:${escapeHtml(p.color)}"></button>`
        ).join('');
        wrap.querySelectorAll('.mtm-accent-preset').forEach((btn) => {
            btn.addEventListener('click', () => setAccent(btn.dataset.color));
        });
    }

    function tileMatchesFilter(m) {
        if (state.filter !== 'all' && m.audience !== state.filter) return false;
        if (!state.search.trim()) return true;
        const q = state.search.trim().toLowerCase();
        return m.label.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    }

    function updateGalleryCount() {
        const counter = $('mtm-count');
        if (counter) counter.textContent = String(state.meta.filter(tileMatchesFilter).length);
        const stat = $('mtm-stat-count');
        if (stat) {
            const span = stat.querySelector('span:last-child');
            if (span) span.textContent = `${state.meta.length} шаблонов`;
        }
    }

    function renderGallery() {
        const gallery = $('mtm-gallery');
        if (!gallery) return;

        gallery.innerHTML = state.meta.map((m) => {
            const hidden = tileMatchesFilter(m) ? '' : ' is-hidden';
            const active = m.id === state.activeId ? ' is-selected' : '';
            const badgeClass = m.audience === 'admin' ? 'mtm-badge--admin' : 'mtm-badge--user';
            const badgeLabel = m.audience === 'admin' ? 'админ' : 'юзер';
            return `
                <button type="button" class="mtm-tile${active}${hidden}" data-mtm-id="${escapeHtml(m.id)}"
                    data-audience="${escapeHtml(m.audience)}" data-label="${escapeHtml(m.label)}" role="tab"
                    aria-selected="${m.id === state.activeId}">
                    <span class="mtm-tile__check" aria-hidden="true"><span class="material-symbols-outlined">check</span></span>
                    <span class="mtm-tile__icon material-symbols-outlined">${escapeHtml(m.icon)}</span>
                    <span class="mtm-tile__label">${escapeHtml(m.label)}</span>
                    <span class="mtm-tile__badges">
                        <span class="mtm-badge ${badgeClass}">${badgeLabel}</span>
                    </span>
                </button>`;
        }).join('');

        gallery.querySelectorAll('[data-mtm-id]').forEach((btn) => {
            btn.addEventListener('click', () => selectTemplate(btn.dataset.mtmId, true));
        });
        updateGalleryCount();
    }

    function applyFilter(filter) {
        state.filter = filter;
        document.querySelectorAll('.mtm-filter').forEach((tab) => {
            tab.classList.toggle('is-active', tab.dataset.mtmFilter === filter);
        });
        document.querySelectorAll('.mtm-tile').forEach((tile) => {
            const m = state.meta.find((x) => x.id === tile.dataset.mtmId);
            tile.classList.toggle('is-hidden', !(m && tileMatchesFilter(m)));
        });
        updateGalleryCount();
    }

    function applySearch(query) {
        state.search = query;
        document.querySelectorAll('.mtm-tile').forEach((tile) => {
            const m = state.meta.find((x) => x.id === tile.dataset.mtmId);
            tile.classList.toggle('is-hidden', !(m && tileMatchesFilter(m)));
        });
        updateGalleryCount();
    }

    function renderSnippets() {
        const bar = $('mtm-snippet-bar');
        if (!bar) return;
        bar.innerHTML = HTML_SNIPPETS.map(
            (s) => `<button type="button" class="mtm-snippet-btn" data-snippet="${escapeHtml(s.html)}">${escapeHtml(s.label)}</button>`
        ).join('');
        bar.querySelectorAll('[data-snippet]').forEach((btn) => {
            btn.addEventListener('click', () => insertSnippet(btn.dataset.snippet));
        });
    }

    function renderMeta() {
        const metaEl = $('mtm-editor-meta');
        const titleEl = $('mtm-preview-title');
        const m = state.meta.find((x) => x.id === state.activeId);
        if (!m) return;

        const audienceLabel = m.audience === 'admin' ? 'Админам' : 'Пользователям';
        if (metaEl) {
            metaEl.innerHTML = `
                <h3 class="mtm-composer__title">${escapeHtml(m.label)}</h3>
                <p class="mtm-composer__sub">${escapeHtml(m.desc)} · ${escapeHtml(audienceLabel)}</p>`;
        }
        if (titleEl) titleEl.textContent = m.label;

        const chips = $('mtm-vars-chips');
        if (chips) {
            chips.innerHTML = (m.vars || [])
                .map((v) => `<button type="button" class="mtm-var-chip" data-var="{{${escapeHtml(v)}}}">{{${escapeHtml(v)}}}</button>`)
                .join('');
            chips.querySelectorAll('.mtm-var-chip').forEach((chip) => {
                chip.addEventListener('click', () => insertVar(chip.dataset.var));
            });
        }
    }

    function insertAtField(el, text) {
        if (!el) return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const val = el.value;
        el.value = val.slice(0, start) + text + val.slice(end);
        el.focus();
        if (typeof el.selectionStart === 'number') {
            el.selectionStart = el.selectionEnd = start + text.length;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertVar(token) {
        insertAtField($(state.lastFocusedFieldId) || $('mtm-body'), token);
    }

    function insertSnippet(html) {
        const body = $('mtm-body');
        if (!body) return;
        const prefix = body.value && !body.value.endsWith('\n') ? '\n' : '';
        insertAtField(body, prefix + html);
    }

    function selectTemplate(id, fromClick) {
        if (!state.templates[id]) return;
        state.activeId = id;
        fillForm(state.templates[id]);
        document.querySelectorAll('.mtm-tile').forEach((tile) => {
            const active = tile.dataset.mtmId === id;
            tile.classList.toggle('is-selected', active);
            tile.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderMeta();
        if (fromClick) {
            setPreviewVisible(true);
            schedulePreview(true);
        } else {
            schedulePreview(true);
        }
    }

    async function loadData() {
        const { data } = await fetchJson('/settings/mail-templates/data');
        if (!data.ok) {
            window.showToast?.('danger', data.error || 'Не удалось загрузить шаблоны');
            return;
        }
        state.templates = data.templates || {};
        state.meta = data.meta || [];
        state.accent = data.accent || '#0A84FF';
        state.brand = data.brand || 'Remnawave App';
        state.footer = data.footer || '';

        const brandStat = $('mtm-stat-brand');
        if (brandStat) {
            const span = brandStat.querySelector('span:last-child');
            if (span) span.textContent = state.brand;
        }

        setAccent(state.accent);
        fillFooter(state.footer);
        if (!state.activeId && state.meta.length) {
            state.activeId = state.meta[0].id;
        }
        fillForm(state.templates[state.activeId]);
        renderGallery();
        renderMeta();
        setPreviewVisible(Boolean(state.activeId));
        schedulePreview(true);
    }

    function setPreviewLoading(on) {
        const el = $('mtm-preview-loading');
        if (el) el.hidden = !on;
    }

    function schedulePreview(immediate) {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(refreshPreview, immediate ? 0 : PREVIEW_DEBOUNCE);
    }

    async function refreshPreview() {
        if (!state.activeId) return;
        const reqId = ++state.previewRequestId;
        setPreviewLoading(true);
        const { data } = await fetchJson('/settings/mail-templates/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: state.activeId,
                draft: getDraft(),
                footer: getFooterDraft(),
                accent: $('mtm-accent')?.value || state.accent,
            }),
        });
        if (reqId !== state.previewRequestId) return;
        setPreviewLoading(false);
        if (!data.ok) return;

        state.lastHtml = data.html || '';
        state.lastSubject = data.subject || '';
        state.lastPreheader = getDraft().preheader || '';
        setPreviewVisible(true);
        applyPreviewToIframes(state.lastHtml);
        updateInboxMock(state.lastSubject, state.lastPreheader);
    }

    function openPreviewModal() {
        if (!isMailChannelActive()) return;
        const modal = $('mtmPreviewModal');
        const iframe = $('mtm-preview-iframe-modal');
        if (!modal || !state.lastHtml) return;
        if (iframe) iframe.srcdoc = state.lastHtml;
        updateInboxMock(state.lastSubject, state.lastPreheader);
        applyDeviceMode(state.device);
        applyZoom(state.zoom);
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        if (typeof window.openModal === 'function') {
            window.openModal('mtmPreviewModal');
        } else {
            modal.classList.add('open');
            document.body.classList.add('has-modal-open');
        }
    }

    function closePreviewModal() {
        const modal = $('mtmPreviewModal');
        if (!modal) return;
        if (typeof window.closeModal === 'function') {
            window.closeModal('mtmPreviewModal');
        } else {
            modal.classList.remove('open');
        }
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-overlay.open')) {
            document.body.classList.remove('has-modal-open');
        }
    }

    async function copyHtml() {
        if (!state.lastHtml) {
            window.showToast?.('info', 'Сначала дождитесь превью');
            return;
        }
        try {
            await navigator.clipboard.writeText(state.lastHtml);
            window.showToast?.('success', 'HTML скопирован');
        } catch (_) {
            window.showToast?.('danger', 'Не удалось скопировать');
        }
    }

    function openPreviewTab() {
        if (!state.lastHtml) return;
        const w = window.open('', '_blank');
        if (!w) {
            window.showToast?.('danger', 'Блокировщик всплывающих окон');
            return;
        }
        w.document.write(state.lastHtml);
        w.document.close();
    }

    async function saveTemplate() {
        if (!state.activeId) return;
        const { data } = await fetchJson('/settings/mail-templates/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: state.activeId,
                accent: $('mtm-accent')?.value,
                footer: getFooterDraft(),
                ...getDraft(),
            }),
        });
        if (data.ok) {
            state.templates[state.activeId] = { ...state.templates[state.activeId], ...getDraft() };
            state.footer = getFooterDraft();
            state.accent = $('mtm-accent')?.value || state.accent;
            document.documentElement.style.setProperty('--mtm-accent', state.accent);
            window.showToast?.('success', 'Сохранено');
        } else {
            window.showToast?.('danger', data.error || 'Ошибка сохранения');
        }
    }

    async function resetOne() {
        if (!state.activeId) return;
        const confirmed = await window.showConfirm?.({
            title: 'Сброс шаблона',
            message: 'Вернуть заводской текст для этого письма?',
            type: 'warning',
            confirmText: 'Сбросить',
            cancelText: 'Отмена',
        });
        if (!confirmed) return;
        const { data } = await fetchJson('/settings/mail-templates/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: state.activeId }),
        });
        if (data.ok) {
            state.templates = data.templates || state.templates;
            fillForm(state.templates[state.activeId]);
            schedulePreview(true);
            window.showToast?.('success', 'Шаблон сброшен');
        } else {
            window.showToast?.('danger', data.error || 'Ошибка');
        }
    }

    async function resetFooter() {
        const confirmed = await window.showConfirm?.({
            title: 'Сброс подвала',
            message: 'Вернуть заводский текст подвала для всех писем?',
            type: 'warning',
            confirmText: 'Сбросить',
            cancelText: 'Отмена',
        });
        if (!confirmed) return;
        const { data } = await fetchJson('/settings/mail-templates/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_footer: true }),
        });
        if (data.ok) {
            state.footer = data.footer || '';
            fillFooter(state.footer);
            schedulePreview(true);
            window.showToast?.('success', 'Подвал сброшен');
        } else {
            window.showToast?.('danger', data.error || 'Ошибка');
        }
    }

    async function resetAll() {
        const confirmed = await window.showConfirm?.({
            title: 'Сброс всех шаблонов',
            message: 'Вернуть заводские тексты для всех писем?',
            type: 'warning',
            confirmText: 'Сбросить всё',
            cancelText: 'Отмена',
        });
        if (!confirmed) return;
        const { data } = await fetchJson('/settings/mail-templates/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (data.ok) {
            state.templates = data.templates || state.templates;
            fillForm(state.templates[state.activeId]);
            renderGallery();
            schedulePreview(true);
            window.showToast?.('success', 'Все шаблоны сброшены');
        } else {
            window.showToast?.('danger', data.error || 'Ошибка');
        }
    }

    async function sendTest() {
        const to = $('mtm-test-email')?.value?.trim();
        if (!to) {
            window.showToast?.('info', 'Укажите email для теста');
            return;
        }
        const { resp, data } = await fetchJson('/settings/mail-templates/send-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id: state.activeId,
                to,
                draft: getDraft(),
                footer: getFooterDraft(),
            }),
        });
        const msg = data.message || data.error || 'Готово';
        window.showToast?.(data.ok ? 'success' : resp.status === 429 ? 'warning' : 'danger', msg);
    }

    function bindEvents() {
        $('mtm-save-btn')?.addEventListener('click', saveTemplate);
        $('mtm-reset-one')?.addEventListener('click', resetOne);
        $('mtm-reset-footer')?.addEventListener('click', resetFooter);
        $('mtm-reset-all')?.addEventListener('click', resetAll);
        $('mtm-preview-expand')?.addEventListener('click', openPreviewModal);
        $('mtm-send-test')?.addEventListener('click', sendTest);
        $('mtm-copy-html')?.addEventListener('click', copyHtml);
        $('mtm-copy-html-modal')?.addEventListener('click', copyHtml);
        $('mtm-open-tab')?.addEventListener('click', openPreviewTab);
        $('mtm-open-tab-modal')?.addEventListener('click', openPreviewTab);
        $('mtm-preview-modal-close')?.addEventListener('click', closePreviewModal);
        $('mtmPreviewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'mtmPreviewModal') closePreviewModal();
        });

        $('mtm-accent')?.addEventListener('input', (e) => setAccent(e.target.value));

        document.querySelectorAll('[data-mtm-filter]').forEach((tab) => {
            tab.addEventListener('click', () => applyFilter(tab.dataset.mtmFilter));
        });
        $('mtm-search')?.addEventListener('input', (e) => applySearch(e.target.value));

        document.querySelectorAll('[data-mtm-device]').forEach((btn) => {
            btn.addEventListener('click', () => applyDeviceMode(btn.dataset.mtmDevice));
        });
        document.querySelectorAll('[data-mtm-device-modal]').forEach((btn) => {
            btn.addEventListener('click', () => applyDeviceMode(btn.dataset.mtmDeviceModal));
        });

        $('mtm-preview-zoom')?.addEventListener('change', (e) => applyZoom(parseFloat(e.target.value, 10)));
        $('mtm-preview-zoom-modal')?.addEventListener('change', (e) => applyZoom(parseFloat(e.target.value, 10)));

        FIELD_IDS.forEach((id) => {
            const el = $(id);
            el?.addEventListener('focus', () => { state.lastFocusedFieldId = id; });
            el?.addEventListener('input', () => {
                updateFieldHints();
                schedulePreview();
            });
        });

        document.addEventListener('keydown', (e) => {
            if (!isMailStudioPage() || !isMailChannelActive()) return;
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === 's') {
                e.preventDefault();
                saveTemplate();
            }
            if (mod && e.key === 'p') {
                e.preventDefault();
                openPreviewModal();
            }
            if (e.key === 'Escape' && $('mtmPreviewModal')?.classList.contains('open')) {
                closePreviewModal();
            }
        });
    }

    let dataLoaded = false;

    function ensureMailData() {
        if (dataLoaded || !isMailChannelActive()) return;
        dataLoaded = true;
        loadData();
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!isMailStudioPage()) return;
        closePreviewModal();
        renderAccentPresets();
        renderSnippets();
        bindEvents();
        window.addEventListener('notify-studio-channel', (e) => {
            if (e.detail?.channel === 'mail') ensureMailData();
            else closePreviewModal();
        });
        if (isMailChannelActive()) ensureMailData();
    });
})();
