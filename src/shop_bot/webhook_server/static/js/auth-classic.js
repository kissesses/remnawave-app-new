(function () {
    'use strict';

    function isClassicAuth() {
        return (document.documentElement.dataset.design || 'classic') === 'classic';
    }

    function refresh() {
        document.body.classList.toggle('auth-classic-layout', isClassicAuth());
    }

    function init() {
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.AuthClassic = { refresh };
})();
