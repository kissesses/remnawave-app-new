(function () {
    'use strict';

    var THEME_CSS = {
        ios: '/static/css/webapp-ios.css',
        desktop: '/static/css/webapp-desktop.css',
        stealth: '/static/css/webapp-stealth.css',
        'stealth-glass': '/static/css/webapp-stealth-glass.css',
        'glass-hub': '/static/css/webapp-glass-hub.css',
        nova: '/static/css/webapp-nova.css',
    };

    var THEME_JS = {
        'glass-hub': '/static/js/webapp-glass-hub.js',
        nova: '/static/js/webapp-nova.js',
    };

    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        if (tg) {
            tg.ready();
            if (typeof tg.expand === 'function') tg.expand();
        }
    } catch (e) { /* ignore */ }

    function activeDesign() {
        return document.documentElement.dataset.webappDesign || 'classic';
    }

    function ensureStylesheet(href) {
        if (!href || document.querySelector('link[rel="stylesheet"][href="' + href + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function ensureScript(src) {
        if (!src) return Promise.resolve();
        if (document.querySelector('script[src="' + src + '"]')) return Promise.resolve();
        return new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = src;
            s.defer = true;
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    function syncThemeAssets() {
        var design = activeDesign();
        var serverDefault = ((window.WEBAPP_DESIGN_CONFIG || {}).default) || 'classic';
        var href = THEME_CSS[design];
        if (href && design !== serverDefault) ensureStylesheet(href);
        var js = THEME_JS[design];
        var serverJs = THEME_JS[serverDefault];
        if (js && js !== serverJs) ensureScript(js);
    }

    window.__webappFetchCabinetConfig = function () {
        if (window.__webappCabinetConfigPromise) return window.__webappCabinetConfigPromise;
        var userId = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id) || window.RENDERED_USER_ID;
        if (!userId) return Promise.resolve(null);
        window.__webappCabinetConfigPromise = fetch('/api/cabinet/config?user_id=' + userId, { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (d) { return d && d.ok ? d : null; })
            .catch(function () { return null; });
        return window.__webappCabinetConfigPromise;
    };

    window.__webappLoadQrLib = function () {
        if (window.QRCode) return Promise.resolve();
        if (window.__webappQrPromise) return window.__webappQrPromise;
        window.__webappQrPromise = new Promise(function (resolve) {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
        });
        return window.__webappQrPromise;
    };

    window.__webappHideBootLoader = function () {
        var el = document.getElementById('webapp-boot-loader');
        if (el) el.classList.add('is-hidden');
    };

    syncThemeAssets();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            window.requestAnimationFrame(function () {
                window.__webappHideBootLoader();
            });
        });
    } else {
        window.__webappHideBootLoader();
    }
})();
