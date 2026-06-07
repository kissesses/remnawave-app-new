(function () {
    'use strict';

    const PANES = ['panel-system', 'panel-monitoring', 'panel-smtp', 'panel-backup'];

    function $(id) { return document.getElementById(id); }

    function showPane(id) {
        if (!PANES.includes(id)) id = 'panel-system';
        document.querySelectorAll('.pnl-workspace-nav .cnt-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pnlPane === id);
        });
        document.querySelectorAll('.pnl-pane').forEach((pane) => {
            const on = pane.dataset.pnlPane === id;
            if (on) pane.removeAttribute('hidden');
            else pane.setAttribute('hidden', '');
        });
        if (history.replaceState) {
            history.replaceState(null, '', '#' + id);
        }
    }

    function initWorkspace() {
        document.querySelectorAll('.pnl-workspace-nav .cnt-tab').forEach((btn) => {
            btn.addEventListener('click', () => showPane(btn.dataset.pnlPane || 'panel-system'));
        });
        const hash = (window.location.hash || '').replace('#', '');
        showPane(PANES.includes(hash) ? hash : 'panel-system');
    }

    function init() {
        if (!$('tab-panel')) return;
        initWorkspace();
    }

    window.reinitPanelPanel = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
