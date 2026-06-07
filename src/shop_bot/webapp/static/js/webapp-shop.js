(function () {
    'use strict';

    var purchaseLoaded = false;
    var renewLoaded = false;
    var purchaseLoading = false;
    var renewLoading = false;

    function userId() {
        return window.RENDERED_USER_ID || (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id) || 0;
    }

    async function loadPurchaseCatalog(force) {
        if (purchaseLoaded && !force) return;
        if (purchaseLoading) return;
        if (!document.querySelector('[data-lazy-shop="purchase"]')) return;
        purchaseLoading = true;
        try {
            var uid = userId();
            if (!uid) return;
            var resp = await fetch('/api/shop/purchase-catalog?user_id=' + uid, { credentials: 'include' });
            var data = await resp.json();
            if (!data.ok) return;
            var servers = document.querySelector('[data-lazy-shop="servers"]');
            var plans = document.getElementById('purchase-plans-root');
            if (servers) servers.innerHTML = data.servers_html || '';
            if (plans) plans.innerHTML = data.plans_html || '';
            purchaseLoaded = true;
            if (typeof window.initPurchaseCatalog === 'function') window.initPurchaseCatalog();
        } catch (e) {
            console.error('purchase catalog', e);
        } finally {
            purchaseLoading = false;
        }
    }

    async function loadRenewCatalog(force) {
        if (renewLoaded && !force) return;
        if (renewLoading) return;
        if (!document.querySelector('[data-lazy-shop="renew"]')) return;
        renewLoading = true;
        try {
            var uid = userId();
            if (!uid) return;
            var resp = await fetch('/api/shop/renew-catalog?user_id=' + uid, { credentials: 'include' });
            var data = await resp.json();
            if (!data.ok) return;
            var root = document.getElementById('renew-plans-root');
            if (root) root.innerHTML = data.plans_html || '';
            renewLoaded = true;
            var renewInfoBlock = document.getElementById('renew-info-block');
            var renewInitialDesc = document.getElementById('renew-desc-content-0');
            if (renewInfoBlock && renewInitialDesc) {
                renewInfoBlock.innerHTML = renewInitialDesc.innerHTML;
            }
            if (typeof window.updateRenewInfoToggle === 'function') window.updateRenewInfoToggle();
            var firstKey = document.querySelector('.dropdown-option[data-index="0"]');
            if (firstKey && typeof window.selectRenewKey === 'function') {
                window.selectRenewKey(firstKey, true);
            }
        } catch (e) {
            console.error('renew catalog', e);
        } finally {
            renewLoading = false;
        }
    }

    function hookShowPage() {
        if (typeof window.showPage !== 'function' || window.showPage.__shopHooked) return;
        var original = window.showPage;
        window.showPage = function (page) {
            original(page);
            var id = page && page.id;
            if (id === 'purchase-page') loadPurchaseCatalog(false);
            if (id === 'renew-page') loadRenewCatalog(false);
        };
        window.showPage.__shopHooked = true;
    }

    hookShowPage();

    function boot() {
        var hash = (window.location.hash || '').replace('#', '');
        if (hash === 'bay') loadPurchaseCatalog(false);
        if (hash === 'rebay') loadRenewCatalog(false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.WebAppShop = {
        loadPurchaseCatalog: loadPurchaseCatalog,
        loadRenewCatalog: loadRenewCatalog,
    };
})();
