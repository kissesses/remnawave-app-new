/**
 * Hosts Studio — channel tabs, picker/editor, search & filters
 */
(function () {
    'use strict';

    const HOST_KEY = 'hst-selected-host';
    const TAB_PREFIX = 'hst-tab-';
    const STUDIO_TAB_KEY = 'hst-studio-tab';

    function $(id) {
        return document.getElementById(id);
    }

    function root() {
        return $('tab-hosts');
    }

    function allTiles() {
        return document.querySelectorAll('#hosts-grid-container .host-card');
    }

    function allPanes() {
        return document.querySelectorAll('.hst-host-pane');
    }

    function selectHost(name, opts) {
        const options = opts || {};
        if (!name) return;

        allTiles().forEach((tile) => {
            tile.classList.toggle('is-selected', tile.dataset.hostName === name);
        });

        allPanes().forEach((pane) => {
            const match = pane.id === 'host-content-' + name;
            pane.hidden = !match;
        });

        const empty = $('hst-editor-empty');
        if (empty) empty.hidden = true;

        try {
            localStorage.setItem(HOST_KEY, name);
        } catch (_) { /* ignore */ }

        if (!options.skipTabRestore) {
            restoreHostTab(name);
        }
    }

    function setHostTab(hostName, tabId) {
        const pane = $('host-content-' + hostName);
        if (!pane) return;

        pane.querySelectorAll('.hst-host-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.hstTab === tabId);
        });
        pane.querySelectorAll('.hst-host-section').forEach((sec) => {
            sec.hidden = sec.dataset.hstSection !== tabId;
        });

        try {
            localStorage.setItem(TAB_PREFIX + hostName, tabId);
        } catch (_) { /* ignore */ }
    }

    function restoreHostTab(hostName) {
        let tabId = 'connection';
        try {
            const stored = localStorage.getItem(TAB_PREFIX + hostName);
            const pane = $('host-content-' + hostName);
            if (stored && pane && pane.querySelector(`.hst-host-section[data-hst-section="${stored}"]`)) {
                tabId = stored;
            }
        } catch (_) { /* ignore */ }
        setHostTab(hostName, tabId);
    }

    function initHostTabs() {
        document.querySelectorAll('.hst-host-pane').forEach((pane) => {
            const hostName = pane.id.replace('host-content-', '');
            pane.querySelectorAll('.hst-host-tab').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setHostTab(hostName, btn.dataset.hstTab || 'connection');
                });
            });
        });
    }

    function initTileClicks() {
        allTiles().forEach((tile) => {
            tile.addEventListener('click', (e) => {
                if (e.target.closest('.drag-handle, form, button, a, input, label')) return;
                selectHost(tile.dataset.hostName || '');
            });
        });
    }

    let activeFilter = 'all';
    let searchQuery = '';

    function applyTileFilters() {
        const q = searchQuery.trim().toLowerCase();
        allTiles().forEach((tile) => {
            const name = (tile.dataset.hostName || '').toLowerCase();
            const visible = tile.dataset.hstVisible === '1';
            let show = true;
            if (q.length > 0 && !name.includes(q)) show = false;
            if (activeFilter === 'visible' && !visible) show = false;
            if (activeFilter === 'hidden' && visible) show = false;
            tile.classList.toggle('is-filter-hidden', !show);
        });
    }

    function filterTiles(query) {
        searchQuery = query || '';
        applyTileFilters();
    }

    function setVisibilityFilter(filterId) {
        activeFilter = filterId || 'all';
        const rootEl = root();
        if (rootEl) {
            rootEl.querySelectorAll('.hst-filter').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.hstFilter === activeFilter);
            });
        }
        applyTileFilters();
    }

    function initSearch() {
        const input = $('hst-search-input');
        if (!input) return;
        input.addEventListener('input', () => filterTiles(input.value));
    }

    function initFilters() {
        const rootEl = root();
        if (!rootEl) return;
        rootEl.querySelectorAll('.hst-filter').forEach((btn) => {
            btn.addEventListener('click', () => setVisibilityFilter(btn.dataset.hstFilter || 'all'));
        });
    }

    function resolveInitialHost() {
        const tiles = Array.from(allTiles()).filter((t) => !t.classList.contains('is-filter-hidden'));
        if (!tiles.length) return null;

        try {
            const stored = localStorage.getItem(HOST_KEY);
            if (stored) {
                const match = document.querySelector(`.host-card[data-host-name="${CSS.escape(stored)}"]:not(.is-filter-hidden)`);
                if (match) return stored;
            }
        } catch (_) { /* ignore */ }

        return tiles[0].dataset.hostName || null;
    }

    function initSelection() {
        const name = resolveInitialHost();
        if (name) {
            selectHost(name);
        } else {
            const empty = $('hst-editor-empty');
            if (empty) empty.hidden = false;
        }
    }

    function initAddDrawer() {
        const btn = $('hst-add-host-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                setStudioTab('panels');
                if (typeof window.toggleAddHostForm === 'function') {
                    window.toggleAddHostForm();
                }
            });
        }
    }

    function initSshDrawer() {
        const toggle = $('hst-add-ssh-toggle');
        const form = $('hst-add-ssh-form');
        const icon = $('hst-add-ssh-icon');
        const emptyBtn = $('hst-add-ssh-empty');

        function openSshForm() {
            if (!form) return;
            form.classList.remove('hidden');
            if (icon) icon.classList.add('is-open');
        }

        if (toggle && form) {
            toggle.addEventListener('click', () => {
                form.classList.toggle('hidden');
                if (icon) icon.classList.toggle('is-open', !form.classList.contains('hidden'));
            });
        }
        if (emptyBtn) {
            emptyBtn.addEventListener('click', () => {
                setStudioTab('ssh');
                openSshForm();
            });
        }
    }

    function setStudioTab(tabId) {
        const rootEl = root();
        if (!rootEl) return;

        rootEl.querySelectorAll('.hst-channel-tab').forEach((btn) => {
            const active = btn.dataset.hstTab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        rootEl.querySelectorAll('.hst-pane').forEach((pane) => {
            pane.hidden = pane.dataset.hstPane !== tabId;
        });

        const desc = $('hst-hub-desc');
        if (desc) {
            const labels = {
                overview: 'Сводка по панелям, тарифам и SSH',
                panels: 'Панели Remnawave · тарифы · SSH · устройства',
                ssh: 'SSH-цели для speedtest и мониторинга',
                guide: 'Справка по настройке хостов',
            };
            desc.textContent = labels[tabId] || labels.panels;
        }

        try {
            localStorage.setItem(STUDIO_TAB_KEY, tabId);
        } catch (_) { /* ignore */ }

        if (tabId === 'ssh' && typeof window.loadAllSpeedtestData === 'function') {
            window.loadAllSpeedtestData();
        }
    }

    function initStudioTabs() {
        const rootEl = root();
        if (!rootEl) return;

        rootEl.querySelectorAll('.hst-channel-tab').forEach((btn) => {
            btn.addEventListener('click', () => setStudioTab(btn.dataset.hstTab || 'panels'));
        });

        rootEl.querySelectorAll('[data-hst-goto]').forEach((el) => {
            el.addEventListener('click', () => setStudioTab(el.dataset.hstGoto || 'panels'));
        });

        let initial = rootEl.dataset.hstDefaultTab || 'panels';
        try {
            const stored = localStorage.getItem(STUDIO_TAB_KEY);
            if (stored && rootEl.querySelector(`.hst-pane[data-hst-pane="${stored}"]`)) {
                initial = stored;
            }
        } catch (_) { /* ignore */ }
        setStudioTab(initial);
    }

    function init() {
        if (!root()) return;
        initStudioTabs();
        initHostTabs();
        initTileClicks();
        initSearch();
        initFilters();
        initAddDrawer();
        initSshDrawer();
        initSelection();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.HstPanel = { selectHost, setHostTab, filterTiles, setStudioTab };
    window.reinitHostsPanel = init;
})();
