(function () {
    'use strict';

    function isEmbedContext() {
        return window.self !== window.top
            || document.body.classList.contains('workspace-embed');
    }

    function patchHref(url) {
        try {
            const u = new URL(url, window.location.origin);
            if (u.origin !== window.location.origin) return null;
            if (u.searchParams.get('embed') === '1') return null;
            u.searchParams.set('embed', '1');
            return u.pathname + u.search + u.hash;
        } catch {
            return null;
        }
    }

    function patchSubtree(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('a[href]').forEach((a) => {
            if (a.target === '_blank' || a.hasAttribute('download')) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            const next = patchHref(href);
            if (next) a.setAttribute('href', next);
        });
        root.querySelectorAll('form[action]').forEach((form) => {
            const action = form.getAttribute('action') || window.location.pathname;
            const next = patchHref(action);
            if (next) form.setAttribute('action', next);
        });
    }

    function init() {
        if (window.self !== window.top) {
            document.body.classList.add('workspace-embed');
            document.documentElement.classList.add('workspace-embed-root');
        }
        if (!isEmbedContext()) return;

        patchSubtree(document);

        document.addEventListener('click', (e) => {
            const a = e.target.closest('a[href]');
            if (!a || a.target === '_blank') return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#')) return;
            const next = patchHref(href);
            if (next) a.setAttribute('href', next);
        }, true);

        const observer = new MutationObserver(() => patchSubtree(document.body));
        observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('message', (e) => {
            if (e.origin !== window.location.origin || !e.data || e.data.type !== 'panel-theme-accent') return;
            const vars = e.data.vars;
            const targets = [document.documentElement, document.body];
            if (!vars) {
                const keys = ['--primary', '--primary-rgb', '--panel-accent', '--panel-accent-soft', '--accent', '--accent-rgb', '--sp-accent', '--sp-accent-soft'];
                targets.forEach((el) => keys.forEach((key) => el.style.removeProperty(key)));
                return;
            }
            targets.forEach((el) => {
                Object.entries(vars).forEach(([key, value]) => el.style.setProperty(key, value));
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
