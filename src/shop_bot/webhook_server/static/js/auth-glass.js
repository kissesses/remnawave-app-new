(function () {
    'use strict';

    function isGlassFamily() {
        const d = document.documentElement.dataset.design || '';
        return d === 'glass' || d === 'stealth-admin';
    }

    function refresh() {
        document.body.classList.toggle('auth-glass-layout', isGlassFamily());
    }

    function init() {
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.AuthGlass = { refresh };
})();
