(function () {
    'use strict';

    const cfg = window.STEALTH_PANEL || {};
    let previewDecoyId = null;

    function previewUrl(decoyId) {
        const tpl = cfg.previewUrlTemplate || '';
        return tpl.replace('__ID__', encodeURIComponent(decoyId));
    }

    function $(id) {
        return document.getElementById(id);
    }

    function setPreviewLoading(on) {
        const el = $('stl-preview-loading');
        if (el) el.hidden = !on;
    }

    function showPreview(decoyId, label, force) {
        if (!decoyId) return;
        if (!force && previewDecoyId === decoyId) return;

        previewDecoyId = decoyId;
        const empty = $('stl-preview-empty');
        const browser = $('stl-preview-browser');
        const iframe = $('stl-preview-iframe');
        const title = $('stl-preview-title');
        const reloadBtn = $('stl-preview-reload');
        const openLink = $('stl-preview-open');

        if (title && label) title.textContent = label;
        if (empty) empty.hidden = true;
        if (browser) browser.hidden = false;
        if (reloadBtn) reloadBtn.disabled = false;
        if (openLink) {
            openLink.href = previewUrl(decoyId);
            openLink.hidden = false;
        }

        if (!iframe) return;
        setPreviewLoading(true);
        iframe.onload = () => setPreviewLoading(false);
        iframe.onerror = () => setPreviewLoading(false);
        iframe.src = previewUrl(decoyId);
    }

    function syncSelectedTiles() {
        let selectedId = null;
        let selectedLabel = null;

        document.querySelectorAll('.stl-tile').forEach((tile) => {
            const input = tile.querySelector('.stl-tile__input');
            const on = Boolean(input && input.checked);
            tile.classList.toggle('is-selected', on);
            if (on) {
                selectedId = tile.dataset.decoyId;
                selectedLabel = tile.dataset.label || tile.querySelector('.stl-tile__label')?.textContent?.trim();
            }
        });

        if (selectedId) {
            showPreview(selectedId, selectedLabel, false);
        }
    }

    function cardVisible(tile, groupId, query) {
        if (groupId !== 'all' && tile.dataset.group !== groupId) return false;
        if (!query) return true;
        const label = (tile.dataset.label || '').toLowerCase();
        const id = (tile.dataset.decoyId || '').toLowerCase();
        return label.includes(query) || id.includes(query);
    }

    function applyFilters() {
        const active = document.querySelector('.stl-filter.is-active');
        const groupId = active ? active.dataset.group : 'all';
        const query = ($('stealth-decoy-search')?.value || '').trim().toLowerCase();

        document.querySelectorAll('.stl-tile').forEach((tile) => {
            tile.classList.toggle('is-hidden', !cardVisible(tile, groupId, query));
        });

        const n = document.querySelectorAll('.stl-tile:not(.is-hidden)').length;
        const counter = $('stealth-decoy-count');
        if (counter) counter.textContent = String(n);
    }

    function filterGroup(groupId) {
        document.querySelectorAll('.stl-filter').forEach((tab) => {
            tab.classList.toggle('is-active', tab.dataset.group === groupId);
        });
        applyFilters();
    }

    function bindFilters() {
        document.querySelectorAll('.stl-filter').forEach((tab) => {
            tab.addEventListener('click', () => filterGroup(tab.dataset.group || 'all'));
        });
        $('stealth-decoy-search')?.addEventListener('input', applyFilters);
    }

    function bindTiles() {
        document.querySelectorAll('.stl-tile').forEach((tile) => {
            const input = tile.querySelector('.stl-tile__input');
            if (!input) return;

            tile.addEventListener('click', (e) => {
                if (e.target.closest('a')) return;
                input.checked = true;
                input.dispatchEvent(new Event('change', { bubbles: true }));
                const label = tile.dataset.label || tile.querySelector('.stl-tile__label')?.textContent?.trim();
                showPreview(tile.dataset.decoyId, label, true);
                syncSelectedTiles();
            });
            input.addEventListener('change', syncSelectedTiles);
        });
    }

    function bindPreviewActions() {
        $('stl-preview-reload')?.addEventListener('click', () => {
            const selected = document.querySelector('.stl-tile.is-selected');
            if (!selected) return;
            previewDecoyId = null;
            showPreview(
                selected.dataset.decoyId,
                selected.dataset.label || selected.querySelector('.stl-tile__label')?.textContent?.trim(),
                true
            );
        });
    }

    function bindEnableToggle() {
        const toggle = $('stealth-login-enabled');
        const pill = $('stl-status-pill');
        if (!toggle || !pill) return;

        function sync() {
            pill.classList.toggle('stl-stat--on', toggle.checked);
            const text = pill.querySelector('.stl-stat__text');
            const icon = pill.querySelector('.material-symbols-outlined');
            if (text) text.textContent = toggle.checked ? 'Активен' : 'Выключен';
            if (icon) icon.textContent = toggle.checked ? 'shield' : 'shield_lock';
        }

        toggle.addEventListener('change', sync);
        sync();
    }

    function init() {
        if (!$('tab-stealth-login')) return;

        bindFilters();
        bindTiles();
        bindPreviewActions();
        bindEnableToggle();
        applyFilters();

        const selected = document.querySelector('.stl-tile.is-selected');
        if (selected) {
            showPreview(
                selected.dataset.decoyId,
                selected.dataset.label || selected.querySelector('.stl-tile__label')?.textContent?.trim(),
                true
            );
        }
    }

    document.addEventListener('DOMContentLoaded', init);
    window.initStealthPanel = init;
})();
