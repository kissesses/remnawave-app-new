/**
 * Hosts Studio — picker, editor tabs, search
 */
(function () {
    'use strict';

    const HOST_KEY = 'hst-selected-host';
    const TAB_PREFIX = 'hst-tab-';

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

    function filterTiles(query) {
        const q = (query || '').trim().toLowerCase();
        allTiles().forEach((tile) => {
            const name = (tile.dataset.hostName || '').toLowerCase();
            tile.classList.toggle('is-filter-hidden', q.length > 0 && !name.includes(q));
        });
    }

    function initSearch() {
        const input = $('hst-search-input');
        if (!input) return;
        input.addEventListener('input', () => filterTiles(input.value));
    }

    function resolveInitialHost() {
        const tiles = allTiles();
        if (!tiles.length) return null;

        try {
            const stored = localStorage.getItem(HOST_KEY);
            if (stored && document.querySelector(`.host-card[data-host-name="${CSS.escape(stored)}"]`)) {
                return stored;
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
                if (typeof window.toggleAddHostForm === 'function') {
                    window.toggleAddHostForm();
                }
            });
        }
    }

    function init() {
        if (!root()) return;
        initHostTabs();
        initTileClicks();
        initSearch();
        initAddDrawer();
        initSelection();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.HstPanel = { selectHost, setHostTab, filterTiles };
})();
