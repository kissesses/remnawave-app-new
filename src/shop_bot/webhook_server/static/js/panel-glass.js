(function () {
    'use strict';

    function isGlassDesign() {
        return document.body.classList.contains('design-glass');
    }

    function proxyClick(fromId, toId) {
        document.getElementById(fromId)?.addEventListener('click', () => {
            document.getElementById(toId)?.click();
        });
    }

    function initGlassShell() {
        proxyClick('btn-restart-bot-glass', 'btn-restart-bot');
        proxyClick('about-info-btn-glass', 'about-info-btn');
        proxyClick('theme-toggle-btn-glass', 'theme-toggle-btn');

        const menuBtn = document.getElementById('panel-glass-menu-toggle');
        menuBtn?.addEventListener('click', () => {
            document.documentElement.classList.toggle('panel-glass-sidebar-open');
        });

        document.addEventListener('click', (e) => {
            if (!isGlassDesign()) return;
            const sidebar = document.getElementById('panel-glass-sidebar');
            const bar = document.getElementById('panel-glass-mobile-bar');
            if (!sidebar || !document.documentElement.classList.contains('panel-glass-sidebar-open')) return;
            if (sidebar.contains(e.target) || bar?.contains(e.target)) return;
            document.documentElement.classList.remove('panel-glass-sidebar-open');
        });

        syncMobileTitle();
    }

    function syncMobileTitle() {
        const src = document.getElementById('glass-brand-title') || document.getElementById('brand-title');
        const dst = document.getElementById('panel-glass-mobile-title');
        if (src && dst) dst.textContent = src.textContent.trim();
    }

    function init() {
        initGlassShell();
        document.addEventListener('brand-title-updated', syncMobileTitle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
