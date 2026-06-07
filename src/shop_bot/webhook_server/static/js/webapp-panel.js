(function () {
    'use strict';

    const cfg = window.WEBAPP_PANEL || {};
    let previewDesignId = null;
    let previewDevice = 'mobile';

    function $(id) { return document.getElementById(id); }

    function toast(msg, ok) {
        if (window.showToast) window.showToast(ok ? 'success' : 'danger', msg);
    }

    function previewUrl(designId) {
        const params = new URLSearchParams({
            device: previewDevice,
            title: $('webapp_title')?.value?.trim() || '',
            logo: $('webapp_logo')?.value?.trim() || '',
            accent: $('webapp_accent_color')?.value?.trim() || '',
        });
        const tpl = cfg.previewUrlTemplate || '/settings/webapp/preview/__ID__';
        return `${tpl.replace('__ID__', encodeURIComponent(designId))}?${params}`;
    }

    function setPreviewLoading(on) {
        const el = $('wapp-preview-loading');
        if (el) el.hidden = !on;
    }

    function showPreview(designId, label, force) {
        if (!designId) return;
        if (!force && previewDesignId === designId) {
            const iframe = $('wapp-preview-iframe');
            if (iframe) iframe.src = previewUrl(designId);
            return;
        }
        previewDesignId = designId;
        $('wapp-preview-empty')?.setAttribute('hidden', '');
        $('wapp-preview-browser')?.removeAttribute('hidden');
        $('wapp-preview-reload') && ($('wapp-preview-reload').disabled = false);
        const openLink = $('wapp-preview-open');
        if (openLink) {
            openLink.href = previewUrl(designId);
            openLink.hidden = false;
        }
        if (label) $('wapp-preview-title').textContent = label;
        const iframe = $('wapp-preview-iframe');
        if (!iframe) return;
        setPreviewLoading(true);
        iframe.onload = () => setPreviewLoading(false);
        iframe.onerror = () => setPreviewLoading(false);
        iframe.src = previewUrl(designId);
    }

    function syncTiles() {
        let defaultId = $('webapp_default_design')?.value || 'classic';
        document.querySelectorAll('.wapp-tile').forEach((tile) => {
            const enableCb = tile.querySelector('.wapp-tile__enable');
            const defaultRb = tile.querySelector('.wapp-tile__default');
            const enabled = Boolean(enableCb?.checked);
            tile.classList.toggle('is-enabled', enabled);
            tile.classList.toggle('is-default', defaultRb?.checked || tile.dataset.designId === defaultId);
        });
    }

    function syncDefaultSelect() {
        const select = $('webapp_default_design');
        if (!select) return;
        const enabled = Array.from(document.querySelectorAll('.wapp-tile__enable:checked')).map((el) => el.value);
        Array.from(select.options).forEach((opt) => {
            const ok = enabled.includes(opt.value);
            opt.hidden = !ok;
            opt.disabled = !ok;
        });
        if (!enabled.includes(select.value) && enabled.length) select.value = enabled[0];
        if (!enabled.length) {
            const first = document.querySelector('.wapp-tile__enable');
            if (first) first.checked = true;
        }
        syncTiles();
    }

    function applyFilters() {
        const active = document.querySelector('.wapp-filter.is-active');
        const groupId = active?.dataset.group || 'all';
        const query = ($('wapp-design-search')?.value || '').trim().toLowerCase();
        document.querySelectorAll('.wapp-tile').forEach((tile) => {
            const inGroup = groupId === 'all' || tile.dataset.group === groupId;
            const label = (tile.dataset.label || '').toLowerCase();
            const id = (tile.dataset.designId || '').toLowerCase();
            const match = !query || label.includes(query) || id.includes(query);
            tile.classList.toggle('is-hidden', !(inGroup && match));
        });
        const n = document.querySelectorAll('.wapp-tile:not(.is-hidden)').length;
        const counter = $('wapp-design-count');
        if (counter) counter.textContent = String(n);
    }

    function switchWorkspace(name) {
        document.querySelectorAll('.wapp-workspace-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.wappWorkspace === name);
        });
        document.querySelectorAll('.wapp-workspace-pane').forEach((pane) => {
            pane.classList.toggle('hidden', pane.dataset.wappPane !== name);
        });
        if (name === 'overview') {
            loadLogs();
        }
        if (name === 'deploy') {
            refreshHealth();
        }
    }

    function bindWorkspaceNav() {
        document.querySelectorAll('.wapp-workspace-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchWorkspace(btn.dataset.wappWorkspace || 'design'));
        });
    }

    function bindFilters() {
        document.querySelectorAll('.wapp-filter').forEach((tab) => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.wapp-filter').forEach((t) => t.classList.remove('is-active'));
                tab.classList.add('is-active');
                applyFilters();
            });
        });
        $('wapp-design-search')?.addEventListener('input', applyFilters);
    }

    function bindTiles() {
        document.querySelectorAll('.wapp-tile').forEach((tile) => {
            const enableCb = tile.querySelector('.wapp-tile__enable');
            const defaultRb = tile.querySelector('.wapp-tile__default');
            tile.addEventListener('click', (e) => {
                if (e.target === enableCb || e.target === defaultRb) return;
                if (defaultRb) {
                    defaultRb.checked = true;
                    if ($('webapp_default_design')) $('webapp_default_design').value = tile.dataset.designId;
                    syncTiles();
                }
                showPreview(tile.dataset.designId, tile.dataset.label, true);
            });
            enableCb?.addEventListener('change', () => {
                if (!document.querySelector('.wapp-tile__enable:checked')) {
                    enableCb.checked = true;
                    toast('Должен быть включён хотя бы один дизайн', false);
                }
                syncDefaultSelect();
            });
            defaultRb?.addEventListener('change', () => {
                if ($('webapp_default_design')) $('webapp_default_design').value = tile.dataset.designId;
                syncTiles();
            });
        });
        $('webapp_default_design')?.addEventListener('change', (e) => {
            const val = e.target.value;
            document.querySelectorAll('.wapp-tile__default').forEach((rb) => {
                rb.checked = rb.value === val;
            });
            syncTiles();
            const tile = document.querySelector(`.wapp-tile[data-design-id="${val}"]`);
            if (tile) showPreview(val, tile.dataset.label, true);
        });
    }

    function bindPreviewActions() {
        $('wapp-preview-reload')?.addEventListener('click', () => {
            previewDesignId = null;
            const selected = document.querySelector('.wapp-tile.is-default') || document.querySelector('.wapp-tile.is-enabled');
            if (selected) showPreview(selected.dataset.designId, selected.dataset.label, true);
        });
        document.querySelectorAll('.wapp-device-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.wapp-device-btn').forEach((b) => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                previewDevice = btn.dataset.device || 'mobile';
                previewDesignId = null;
                const selected = document.querySelector('.wapp-tile.is-default') || document.querySelector('.wapp-tile.is-enabled');
                if (selected) showPreview(selected.dataset.designId, selected.dataset.label, true);
            });
        });
    }

    function bindAssetPreviews() {
        function bindInput(inputId, imgId, phId) {
            const input = $(inputId);
            const img = $(imgId);
            const ph = $(phId);
            if (!input) return;
            input.addEventListener('input', () => {
                const url = input.value.trim();
                if (url && img) {
                    img.src = url;
                    img.hidden = false;
                    ph && (ph.hidden = true);
                } else if (img) {
                    img.hidden = true;
                    ph && (ph.hidden = false);
                }
                if (previewDesignId) showPreview(previewDesignId, $('wapp-preview-title')?.textContent, true);
            });
        }
        bindInput('webapp_logo', 'webapp-logo-preview', 'webapp-logo-placeholder');
        bindInput('webapp_icon', 'webapp-icon-preview', 'webapp-icon-placeholder');
        $('webapp_title')?.addEventListener('input', () => {
            if (previewDesignId) showPreview(previewDesignId, $('wapp-preview-title')?.textContent, true);
        });
        const colorPicker = $('webapp_accent_picker');
        const colorText = $('webapp_accent_color');
        colorPicker?.addEventListener('input', () => {
            if (colorText) colorText.value = colorPicker.value;
        });
        colorText?.addEventListener('input', () => {
            const v = colorText.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v) && colorPicker) colorPicker.value = v;
        });
    }

    function bindEnableToggle() {
        const toggle = $('webapp_enable');
        const pill = $('wapp-status-pill');
        if (!toggle || !pill) return;
        toggle.addEventListener('change', () => {
            pill.classList.toggle('wapp-stat--on', toggle.checked);
            const text = pill.querySelector('.wapp-stat__text');
            const icon = pill.querySelector('.material-symbols-outlined');
            if (text) text.textContent = toggle.checked ? 'Включён' : 'Выключен';
            if (icon) icon.textContent = toggle.checked ? 'check_circle' : 'cancel';
        });
    }

    function updateNginxPreview() {
        const domain = ($('webapp_domen')?.value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] || 'lk.example.com';
        const block = `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location / {
        proxy_pass http://remnawave-app:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# После проверки: certbot --nginx -d ${domain}`;
        const pre = $('wapp-nginx-config');
        if (pre) pre.textContent = block;
    }

    async function refreshHealth() {
        try {
            const resp = await fetch('/settings/webapp/health.json');
            const data = await resp.json();
            if (!data.ok) return;
            renderHealth(data.health || {});
        } catch (e) {
            console.error(e);
        }
    }

    function renderHealth(health) {
        const setCard = (key, text, state) => {
            const card = document.querySelector(`.wapp-health-card[data-health="${key}"]`);
            if (!card) return;
            const val = card.querySelector('.wapp-health-card__val');
            if (val) val.textContent = text;
            card.classList.remove('is-ok', 'is-bad', 'is-warn');
            if (state) card.classList.add(state);
        };
        setCard('port', health.port_local?.ok ? 'Online' : 'Offline', health.port_local?.ok ? 'is-ok' : 'is-bad');
        setCard('dns', health.dns?.ok ? (health.dns.ip || 'OK') : 'Fail', health.dns?.ok ? 'is-ok' : 'is-warn');
        const ssl = health.ssl || {};
        let sslText = '—';
        let sslState = '';
        if (ssl.ok && ssl.days_left != null) {
            sslText = `${ssl.days_left}d`;
            sslState = ssl.warn ? 'is-warn' : 'is-ok';
        } else if (health.dns?.domain) {
            sslText = 'No cert';
            sslState = 'is-bad';
        }
        setCard('ssl', sslText, sslState);
        const http = health.http || {};
        setCard('http', http.status ? String(http.status) : '—', http.ok ? 'is-ok' : 'is-warn');

        const pill = $('wapp-health-pill');
        if (pill) {
            const ok = health.port_local?.ok;
            pill.classList.toggle('wapp-stat--on', ok);
            pill.classList.toggle('wapp-stat--warn', !ok);
            const span = pill.querySelector('span:last-child');
            if (span) span.textContent = ok ? 'Online' : 'Offline';
        }
        const openLink = $('wapp-open-link');
        if (openLink && health.public_url) openLink.href = health.public_url;
        const previewUrlEl = $('wapp-preview-url');
        if (previewUrlEl && health.public_url) previewUrlEl.textContent = health.public_url;
    }

    async function refreshMeta() {
        try {
            const resp = await fetch('/settings/webapp/meta.json');
            const data = await resp.json();
            if (!data.ok || !data.meta) return;
            const m = data.meta;
            $('wapp-designs-pill')?.querySelector('span:last-child') &&
                ($('wapp-designs-pill').querySelector('span:last-child').textContent = `${m.enabled_design_count} / ${m.total_designs} дизайнов`);
            $('wapp-domain-pill')?.querySelector('span:last-child') &&
                ($('wapp-domain-pill').querySelector('span:last-child').textContent = m.domain_display || 'Не задан');
            $('wapp-kpi-picks') && ($('wapp-kpi-picks').textContent = String(m.analytics?.total_picks || 0));
            $('wapp-kpi-popular') && ($('wapp-kpi-popular').textContent = m.analytics?.popular_label || '—');
            renderHealth(m.health || {});
            updateStatsBars(m.analytics?.design_stats || {}, m.analytics?.total_picks || 0);
        } catch (e) {
            console.error(e);
        }
    }

    function updateStatsBars(stats, total) {
        document.querySelectorAll('.wapp-stats-bar').forEach((row) => {
            const id = row.dataset.design;
            const uses = stats[id] || 0;
            const pct = total ? Math.round((uses * 100) / total) : 0;
            const track = row.querySelector('.wapp-stats-bar__track i');
            const val = row.querySelector('.wapp-stats-bar__val');
            if (track) track.style.width = `${pct}%`;
            if (val) val.textContent = String(uses);
        });
    }

    async function loadLogs() {
        const view = $('wapp-log-view');
        if (!view) return;
        view.textContent = 'Загрузка…';
        try {
            const resp = await fetch('/settings/webapp/logs.json?lines=80');
            const data = await resp.json();
            if (!data.ok) {
                view.textContent = data.error || 'Ошибка';
                return;
            }
            view.textContent = (data.lines || []).join('\n') || 'Нет записей [WEBAPP]';
        } catch (e) {
            view.textContent = String(e);
        }
    }

    function bindMiscActions() {
        $('wapp-copy-nginx')?.addEventListener('click', async () => {
            const text = $('wapp-nginx-config')?.textContent || '';
            try {
                await navigator.clipboard.writeText(text);
                toast('Nginx config скопирован', true);
            } catch (e) {
                toast('Не удалось скопировать', false);
            }
        });
        $('wapp-copy-deeplink')?.addEventListener('click', async () => {
            const link = cfg.tgDeeplink || '';
            if (!link) return;
            try {
                await navigator.clipboard.writeText(link);
                toast('Deep Link скопирован', true);
            } catch (e) {
                toast('Не удалось скопировать', false);
            }
        });
        $('wapp-refresh-logs')?.addEventListener('click', loadLogs);
        $('wapp-refresh-stats')?.addEventListener('click', refreshMeta);
        $('webapp_domen')?.addEventListener('input', updateNginxPreview);
    }

    async function saveSettings(e) {
        e.preventDefault();
        const btn = $('btn-save-webapp');
        const original = btn?.innerHTML;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined">progress_activity</span> Сохранение…';
        }
        const formData = new FormData();
        formData.append('csrf_token', window.getCsrfToken?.() || cfg.csrfToken || '');
        formData.append('enable', $('webapp_enable')?.checked ? 'true' : 'false');
        formData.append('tg_fullscreen', $('tg_fullscreen')?.checked ? 'true' : 'false');
        formData.append('theme_picker', $('webapp_theme_picker')?.checked ? 'true' : 'false');
        formData.append('title', $('webapp_title')?.value || '');
        formData.append('domen', $('webapp_domen')?.value || '');
        formData.append('logo', $('webapp_logo')?.value || '');
        formData.append('icon', $('webapp_icon')?.value || '');
        formData.append('default_design', $('webapp_default_design')?.value || 'classic');
        formData.append('maintenance_text', $('webapp_maintenance_text')?.value || '');
        formData.append('welcome_text', $('webapp_welcome_text')?.value || '');
        formData.append('accent_color', $('webapp_accent_color')?.value || '');
        formData.append('show_trial', $('webapp_show_trial')?.checked ? 'true' : 'false');
        formData.append('show_referrals', $('webapp_show_referrals')?.checked ? 'true' : 'false');
        formData.append('show_howto', $('webapp_show_howto')?.checked ? 'true' : 'false');
        formData.append('show_topup', $('webapp_show_topup')?.checked ? 'true' : 'false');
        formData.append('ab_design_b', $('webapp_ab_design_b')?.value || '');
        formData.append('ab_percent', $('webapp_ab_percent')?.value || '0');
        document.querySelectorAll('.wapp-tile__enable:checked').forEach((el) => {
            formData.append('webapp_design_enabled', el.value);
        });
        try {
            const resp = await fetch('/settings/webapp/save', { method: 'POST', body: formData });
            const data = await resp.json();
            toast(data.message || (data.ok ? 'Сохранено' : 'Ошибка'), !!data.ok);
            if (data.ok) refreshMeta();
        } catch (err) {
            console.error(err);
            toast('Ошибка подключения', false);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }
    }

    function init() {
        if (!$('tab-webapp')) return;
        bindWorkspaceNav();
        bindFilters();
        bindTiles();
        bindPreviewActions();
        bindAssetPreviews();
        bindEnableToggle();
        bindMiscActions();
        syncDefaultSelect();
        applyFilters();
        updateNginxPreview();
        refreshHealth();

        $('webapp-settings-form')?.addEventListener('submit', saveSettings);

        const selected = document.querySelector('.wapp-tile.is-default') || document.querySelector('.wapp-tile.is-enabled');
        if (selected) showPreview(selected.dataset.designId, selected.dataset.label, true);
    }

    window.reinitWebappPanel = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
