(function () {
    'use strict';

    const STORAGE_KEY = 'webapp-design-theme';
    const DESIGN = 'aurum';

    function isCabinetPage() {
        return !!document.getElementById('main-page');
    }

    function getServerConfig() {
        return window.WEBAPP_DESIGN_CONFIG || {};
    }

    function isPickerEnabled() {
        const cfg = getServerConfig();
        return cfg.pickerEnabled === true;
    }

    function getStoredDesign() {
        return DESIGN;
    }

    function getCurrentPageId() {
        const hash = (window.location.hash || '').replace('#', '');
        const map = { pro: 'profile-page', bay: 'purchase-page', rebay: 'renew-page', setup: 'setup-page', support: 'support-page' };
        return map[hash] || 'main-page';
    }

    function pageHashForId(pageId) {
        const map = {
            'main-page': '',
            'purchase-page': 'bay',
            'renew-page': 'rebay',
            'setup-page': 'setup',
            'profile-page': 'pro',
            'support-page': 'support',
        };
        return map[pageId] || '';
    }

    function navigateToPage(pageId) {
        if (!isCabinetPage()) return;
        const hash = pageHashForId(pageId);
        if (hash) {
            window.location.hash = hash;
            return;
        }
        window.location.hash = '';
        const el = document.getElementById(pageId);
        if (el && typeof window.showPage === 'function') {
            window.showPage(el);
        }
    }

    async function applyDesign(design, persist) {
        if (persist !== false) localStorage.setItem(STORAGE_KEY, DESIGN);
        if (persist !== false) {
            fetch('/api/cabinet/design-pick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ design_id: DESIGN }),
            }).catch(function () {});
        }
        document.documentElement.dataset.webappDesign = DESIGN;
        document.body.classList.add('webapp-design-aurum');
        const meta = document.getElementById('dynamic-theme-color') || document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = '#0c0c0e';
        if (typeof window.__webappEnsureThemeAssets === 'function') {
            await window.__webappEnsureThemeAssets(DESIGN);
        }
        renderChrome();
        syncNav(getCurrentPageId());
    }

    function removeChrome() {
        window.WebAppAurum?.destroy?.();
        document.body.classList.remove('webapp-has-tabbar', 'webapp-has-sidebar', 'webapp-has-stealth-tabbar');
    }

    function renderChrome() {
        removeChrome();
        if (!isCabinetPage()) return;
        window.WebAppAurum?.init?.();
    }

    function syncNav(pageId) {
        const id = pageId || getCurrentPageId();
        document.querySelectorAll('#webapp-aurum-tabbar [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
        window.WebAppAurum?.syncNav?.(id);
    }

    async function applyProfileAvatar() {
        const wrap = document.getElementById('webapp-profile-avatar-wrap');
        const img = document.getElementById('webapp-profile-avatar-img');
        const fallback = document.getElementById('webapp-profile-avatar-fallback');
        if (!wrap || !img || !fallback) return;

        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        let url = tgUser?.photo_url || '';

        if (!url) {
            const userId = (typeof window.getWebappUserId === 'function')
                ? window.getWebappUserId()
                : (tgUser?.id || window.RENDERED_USER_ID);
            if (userId) {
                try {
                    const resp = await fetch(`/api/user/avatar?user_id=${userId}`);
                    const data = await resp.json();
                    if (data.ok && data.url) url = data.url;
                } catch (_) { /* ignore */ }
            }
        }

        const syncAurum = () => window.WebAppAurum?.syncTabAvatar?.();

        if (!url) {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
            wrap.classList.remove('has-photo');
            syncAurum();
            return;
        }

        img.onload = () => {
            img.classList.remove('hidden');
            fallback.classList.add('hidden');
            wrap.classList.add('has-photo');
            syncAurum();
        };
        img.onerror = () => {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
            wrap.classList.remove('has-photo');
            syncAurum();
        };
        img.src = url;
    }

    async function init() {
        if (!isCabinetPage()) return;
        await applyDesign(DESIGN, false);
        document.getElementById('webapp-theme-fab')?.remove();
        document.getElementById('webapp-theme-sheet')?.remove();
        window.addEventListener('hashchange', () => syncNav(getCurrentPageId()));
        window.addEventListener('resize', async () => {
            if (typeof window.__webappEnsureThemeAssets === 'function') {
                await window.__webappEnsureThemeAssets(DESIGN);
            }
            renderChrome();
        });
    }

    window.WebappTheme = {
        init,
        applyDesign,
        getDesign: getStoredDesign,
        onPageChange(pageId) {
            syncNav(pageId);
            if (pageId === 'profile-page') applyProfileAvatar();
            if (pageId === 'main-page') window.WebAppAurum?.refresh?.();
        },
        applyProfileAvatar,
        isMobile: () => true,
    };

    if (!isCabinetPage()) return;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    setTimeout(applyProfileAvatar, 100);
})();
