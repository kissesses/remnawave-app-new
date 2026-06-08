(function () {
    'use strict';

    var THEME_CSS = {
        classic: '/static/css/webapp-prism.css',
        ios: '/static/css/webapp-ios.css',
        desktop: '/static/css/webapp-desktop.css',
        stealth: '/static/css/webapp-stealth.css',
        'stealth-glass': '/static/css/webapp-stealth-glass.css',
        'glass-hub': '/static/css/webapp-glass-hub.css',
        nova: '/static/css/webapp-nova.css',
        'pref-classic': '/static/css/webapp-pref-classic.css',
        'pref-macos': '/static/css/webapp-pref-macos.css',
        'pref-macos-v2': '/static/css/webapp-pref-macos-v2.css',
        'pref-glass-stealth': '/static/css/webapp-pref-glass-stealth.css',
        aurum: '/static/css/webapp-aurum.css',
    };

    var THEME_JS = {
        classic: '/static/js/webapp-prism.js',
        'glass-hub': '/static/js/webapp-glass-hub.js',
        nova: '/static/js/webapp-nova.js',
        'pref-classic': '/static/js/webapp-pref-classic.js',
        'pref-macos': '/static/js/webapp-pref-macos.js',
        'pref-macos-v2': '/static/js/webapp-pref-macos-v2.js',
        'pref-glass-stealth': '/static/js/webapp-pref-glass-stealth.js',
        aurum: '/static/js/webapp-aurum.js',
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
        if (!href) return Promise.resolve();
        var existing = document.querySelector('link[rel="stylesheet"][href="' + href + '"]');
        if (existing) return Promise.resolve();
        return new Promise(function (resolve) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = resolve;
            document.head.appendChild(link);
        });
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

    function ensureThemeAssets(design) {
        var href = THEME_CSS[design];
        var js = THEME_JS[design];
        return Promise.all([
            ensureStylesheet(href),
            ensureScript(js),
        ]);
    }

    function syncThemeAssets() {
        var design = activeDesign();
        ensureThemeAssets(design);
    }

    window.__webappEnsureThemeAssets = ensureThemeAssets;

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
