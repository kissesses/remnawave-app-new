(function () {
    'use strict';

    function getUserId() {
        if (typeof window.getWebappUserId === 'function') return window.getWebappUserId();
        const rendered = Number(window.RENDERED_USER_ID) || 0;
        if (rendered) return rendered;
        return Number(window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0;
    }

    function getUsername() {
        const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (u?.username) return '@' + u.username;
        if (u?.first_name) return u.first_name;
        return 'Пользователь';
    }

    function getUserInitial() {
        const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
        const name = u?.first_name || u?.username || 'U';
        return name.charAt(0).toUpperCase();
    }

    function getBrand() {
        const h1 = document.querySelector('#main-page header h1, #profile-page header h1');
        const img = document.querySelector('#main-page header img, #profile-page header img');
        return {
            title: (h1 && h1.textContent.trim()) || 'VPN',
            logo: img && !img.hidden ? img.src : '',
        };
    }

    function formatMoney(n) {
        return (Number(n) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';
    }

    function formatExpireDate(str) {
        if (!str) return '—';
        const parts = str.split('.');
        if (parts.length === 3) {
            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const y = parts[2];
            if (months[m]) return `${d} ${months[m]} ${y} г.`;
        }
        return str;
    }

    function daysLabel(n) {
        const d = Number(n) || 0;
        if (d % 10 === 1 && d % 100 !== 11) return `${d} день`;
        if (d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20)) return `${d} дня`;
        return `${d} дней`;
    }

    function notify(msg, type) {
        if (typeof window.showNotification === 'function') window.showNotification(msg, type);
        else window.Telegram?.WebApp?.showAlert?.(msg);
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

    function pageIdFromHash() {
        const hash = (window.location.hash || '').replace('#', '');
        const map = { pro: 'profile-page', bay: 'purchase-page', rebay: 'renew-page', setup: 'setup-page', support: 'support-page' };
        return map[hash] || 'main-page';
    }

    function navigate(pageId) {
        const hash = pageHashForId(pageId);
        if (hash) {
            window.location.hash = hash;
            return;
        }
        window.location.hash = '';
        const el = document.getElementById(pageId);
        if (el && typeof window.showPage === 'function') window.showPage(el);
    }

    async function fetchData() {
        const userId = getUserId();
        if (!userId) return { status: null, cfg: null };
        try {
            const cfgPromise = typeof window.__webappFetchCabinetConfig === 'function'
                ? window.__webappFetchCabinetConfig()
                : fetch('/api/cabinet/config?user_id=' + userId).then((r) => r.json()).then((d) => (d.ok ? d : null));
            const [statusRes, cfg] = await Promise.all([
                fetch('/api/user-status?user_id=' + userId),
                cfgPromise,
            ]);
            const status = await statusRes.json();
            return { status: status.ok ? status : null, cfg };
        } catch (e) {
            console.error('theme-kit fetch', e);
            return { status: null, cfg: null };
        }
    }

    function applyAccent(cssVar, color) {
        if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) {
            document.documentElement.style.setProperty(cssVar, color);
        }
    }

    window.WebAppThemeKit = {
        getUserId,
        getUsername,
        getUserInitial,
        getBrand,
        formatMoney,
        formatExpireDate,
        daysLabel,
        notify,
        navigate,
        fetchData,
        pageHashForId,
        pageIdFromHash,
        applyAccent,
    };
})();
