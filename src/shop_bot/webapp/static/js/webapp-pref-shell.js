(function () {
    'use strict';

    window.WebAppPrefDesigns = ['pref-classic', 'pref-macos', 'pref-macos-v2', 'pref-glass-stealth'];

    function getUserId() {
        return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.RENDERED_USER_ID;
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

    function isActive() {
        return window.WebAppPrefDesigns && window.WebAppPrefDesigns.includes(document.documentElement.dataset.webappDesign);
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

    function navigate(pageId) {
        const hashMap = {
            'main-page': '',
            'purchase-page': 'bay',
            'renew-page': 'rebay',
            'profile-page': 'pro',
            'setup-page': 'setup',
            'support-page': 'support',
        };
        const hash = hashMap[pageId];
        if (hash) window.location.hash = hash;
        else {
            window.location.hash = '';
            const el = document.getElementById(pageId);
            if (el && typeof window.showPage === 'function') window.showPage(el);
        }
        syncNav(pageId);
    }

    function renderSubscriptionCard(key) {
        if (!key) {
            return `
                <article class="webapp-pf-card">
                    <div class="webapp-pf-card__head">
                        <div class="webapp-pf-card__icon"><span class="material-icons-round">inventory_2</span></div>
                        <h3 class="webapp-pf-card__title">Подписка</h3>
                    </div>
                    <div class="webapp-pf-empty">
                        <p>Нет активной подписки</p>
                        <button type="button" class="webapp-pf-btn webapp-pf-btn--primary" data-pf-action="tariffs">Выбрать тариф</button>
                    </div>
                </article>`;
        }

        const active = key.days_left > 0;
        const statusBadge = active
            ? '<span class="webapp-pf-badge webapp-pf-badge--active"><span class="webapp-pf-badge__dot"></span> Активна</span>'
            : '<span class="webapp-pf-badge webapp-pf-badge--muted">Истекла</span>';
        const daysBadge = active && key.days_left != null
            ? `<span class="webapp-pf-badge webapp-pf-badge--muted">${daysLabel(key.days_left)}</span>`
            : '';
        const planName = (key.host_name || key.name || 'Premium').toUpperCase();

        return `
            <article class="webapp-pf-card">
                <div class="webapp-pf-card__head">
                    <div class="webapp-pf-card__icon"><span class="material-icons-round">inventory_2</span></div>
                    <h3 class="webapp-pf-card__title">Подписка</h3>
                </div>
                <div class="webapp-pf-badges">${statusBadge}${daysBadge}</div>
                <div class="webapp-pf-rows">
                    <div class="webapp-pf-row">
                        <span class="webapp-pf-row__label">Тариф</span>
                        <span class="webapp-pf-row__value">${planName}</span>
                    </div>
                    <div class="webapp-pf-row">
                        <span class="webapp-pf-row__label">До</span>
                        <span class="webapp-pf-row__value">${formatExpireDate(key.expire_date_str)}</span>
                    </div>
                    <div class="webapp-pf-row">
                        <span class="webapp-pf-row__label">Трафик</span>
                        <span class="webapp-pf-row__value">${key.traffic_info?.includes('∞') || key.traffic_info?.endsWith('/ ∞') ? 'Безлимит' : (key.traffic_info || '—')}</span>
                    </div>
                </div>
            </article>`;
    }

    function renderBalanceCard(balance, cfg) {
        if (cfg?.modules?.topup === false) return '';
        return `
            <article class="webapp-pf-card webapp-pf-card--balance">
                <div class="webapp-pf-card__head">
                    <div class="webapp-pf-card__icon"><span class="material-icons-round">account_balance_wallet</span></div>
                    <h3 class="webapp-pf-card__title">Баланс</h3>
                </div>
                <div class="webapp-pf-balance-amount">${formatMoney(balance)}</div>
                <button type="button" class="webapp-pf-btn webapp-pf-btn--primary webapp-pf-btn--block" data-pf-action="topup">
                    <span class="material-icons-round">add_circle</span> Пополнить
                </button>
            </article>`;
    }

    function renderReferralCard(cfg, status) {
        if (cfg?.modules?.referrals === false) return '';
        const enabled = cfg?.referrals?.enabled;
        if (!enabled) {
            return `
                <article class="webapp-pf-card">
                    <div class="webapp-pf-card__head">
                        <div class="webapp-pf-card__icon"><span class="material-icons-round">group</span></div>
                        <h3 class="webapp-pf-card__title">Рефералы</h3>
                    </div>
                    <p class="webapp-pf-muted">Реферальная программа отключена.</p>
                </article>`;
        }

        const link = status?.referral_link || cfg.referrals?.link || '';
        const count = status?.referral_count ?? cfg.referrals?.count ?? 0;

        return `
            <article class="webapp-pf-card" id="webapp-pf-ref-card">
                <div class="webapp-pf-card__head">
                    <div class="webapp-pf-card__icon"><span class="material-icons-round">group</span></div>
                    <h3 class="webapp-pf-card__title">Рефералы</h3>
                </div>
                <p class="webapp-pf-muted">Приглашайте друзей и получайте бонусы на баланс.</p>
                <div class="webapp-pf-ref-input">
                    <code title="${link}">${link || '—'}</code>
                    <button type="button" class="webapp-pf-ref-copy" data-pf-copy-ref aria-label="Копировать">
                        <span class="material-icons-round">content_copy</span>
                    </button>
                </div>
                <button type="button" class="webapp-pf-link-btn" data-pf-action="referral-stats">
                    Статистика (${count}) →
                </button>
            </article>`;
    }

    function renderQuickActions(cfg) {
        const items = [
            { action: 'tariffs', icon: 'shopping_cart', label: 'Тарифы' },
            { action: 'topup', icon: 'add_circle', label: 'Пополнить', hidden: cfg?.modules?.topup === false },
            { action: 'connect', icon: 'wifi', label: 'Подключить' },
            { action: 'support', icon: 'headset_mic', label: 'Поддержка' },
        ].filter((item) => !item.hidden);

        return `
            <div class="webapp-pf-quick">
                ${items.map((item) => `
                    <button type="button" class="webapp-pf-quick__btn" data-pf-action="${item.action}">
                        <span class="webapp-pf-quick__icon"><span class="material-icons-round">${item.icon}</span></span>
                        <span class="webapp-pf-quick__label">${item.label}</span>
                    </button>
                `).join('')}
            </div>`;
    }

    function renderHero(key, status, cfg) {
        const name = getUsername();
        const overrides = cfg?.content_overrides || {};
        const welcomeTpl = (cfg?.branding?.welcome_text || overrides.hero_title || '').trim();
        const heroTitle = welcomeTpl
            ? welcomeTpl.replace('{name}', name).replace('{user}', name)
            : `Привет, ${name}`;
        const hasKey = key && key.days_left > 0;
        const subText = (overrides.hero_sub || '').trim() || (hasKey
            ? 'Подписка активна — подключайтесь и пользуйтесь VPN.'
            : 'Оформите подписку или активируйте пробный период.');

        return `
            <section class="webapp-pf-hero">
                <h1 class="webapp-pf-hero__title">${heroTitle}</h1>
                <p class="webapp-pf-hero__sub">${subText}</p>
                ${hasKey && key.sub_url ? `
                    <button type="button" class="webapp-pf-btn webapp-pf-btn--primary" data-pf-action="connect">
                        <span class="material-icons-round">wifi</span> Подключиться
                    </button>
                ` : status?.trial_available && cfg?.modules?.trial !== false ? `
                    <button type="button" class="webapp-pf-btn webapp-pf-btn--primary" data-pf-action="trial">
                        <span class="material-icons-round">card_giftcard</span> Пробный период
                    </button>
                ` : `
                    <button type="button" class="webapp-pf-btn webapp-pf-btn--primary" data-pf-action="tariffs">
                        <span class="material-icons-round">shopping_cart</span> Выбрать тариф
                    </button>
                `}
            </section>`;
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
            return {
                status: status.ok ? status : null,
                cfg: cfg,
            };
        } catch (e) {
            console.error('pref fetch', e);
            return { status: null, cfg: null };
        }
    }

    function bindDashboardActions(root, data) {
        const link = data.status?.referral_link || data.cfg?.referrals?.link || '';
        root.querySelector('[data-pf-copy-ref]')?.addEventListener('click', () => {
            if (!link) return;
            navigator.clipboard?.writeText(link).then(() => notify('Ссылка скопирована', 'success'));
        });

        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pf-action]');
            if (!btn) return;
            const action = btn.dataset.nvAction;
            if (action === 'topup') window.WebAppCabinet?.openTopUp?.();
            else if (action === 'tariffs') navigate('purchase-page');
            else if (action === 'connect') navigate('setup-page');
            else if (action === 'support') navigate('support-page');
            else if (action === 'trial') window.WebAppCabinet?.activateTrial?.();
            else if (action === 'referral-stats') window.WebAppCabinet?.openReferral?.();
        });
    }

    function updateHeaderBalance(balance) {
        const el = document.querySelector('[data-pf-balance-amount]');
        if (el) el.textContent = formatMoney(balance);
    }

    async function renderDashboard() {
        if (!isActive()) return;
        if (window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-pf-dashboard');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-pf-dashboard';
            main.prepend(root);
        }

        root.innerHTML = '<div class="webapp-pf-loading">Загрузка…</div>';

        const data = await fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? data.cfg?.balance ?? 0;
        const accent = data.cfg?.branding?.accent_color;
        if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) {
            document.documentElement.style.setProperty('--wa-pf-accent', accent);
            document.documentElement.style.setProperty('--wa-accent', accent);
        }

        updateHeaderBalance(balance);

        root.innerHTML = `
            ${renderHero(key, data.status, data.cfg)}
            ${renderQuickActions(data.cfg)}
            <div class="webapp-pf-cards">
                ${renderSubscriptionCard(key)}
                ${renderBalanceCard(balance, data.cfg)}
                ${renderReferralCard(data.cfg, data.status)}
            </div>`;

        bindDashboardActions(root, data);
    }

    function renderHeader() {
        if (document.getElementById('webapp-pf-header')) return;

        const brand = (document.querySelector('#main-page header h1')?.textContent || 'VPN').trim();
        const logoSrc = document.querySelector('#main-page header img')?.src || '';

        const header = document.createElement('header');
        header.id = 'webapp-pf-header';
        header.className = 'webapp-pf-header';
        header.innerHTML = `
            <div class="webapp-pf-header__inner">
                <div class="webapp-pf-header__brand">
                    ${logoSrc ? `<img src="${logoSrc}" alt="" />` : '<span class="material-icons-round">shield</span>'}
                    <span>${brand}</span>
                </div>
                <div class="webapp-pf-header__actions">
                    <button type="button" class="webapp-pf-header__balance" data-pf-action="topup">
                        <span class="material-icons-round">account_balance_wallet</span>
                        <span data-pf-balance-amount>0 ₽</span>
                    </button>
                    <button type="button" class="webapp-pf-header__avatar" id="webapp-pf-profile-btn" title="Профиль">
                        ${getUserInitial()}
                    </button>
                </div>
            </div>`;

        header.addEventListener('click', (e) => {
            const topup = e.target.closest('[data-pf-action="topup"]');
            if (topup) {
                window.WebAppCabinet?.openTopUp?.();
                return;
            }
            if (e.target.closest('#webapp-pf-profile-btn')) navigate('profile-page');
        });

        document.body.prepend(header);
    }

    function renderTabBar() {
        if (document.getElementById('webapp-pf-tabbar')) return;

        const items = [
            { id: 'main-page', label: 'Главная', icon: 'home' },
            { id: 'purchase-page', label: 'Тарифы', icon: 'inventory_2' },
            { id: 'setup-page', label: 'Установка', icon: 'download' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Поддержка', icon: 'headset_mic' },
        ];

        const nav = document.createElement('nav');
        nav.id = 'webapp-pf-tabbar';
        nav.className = 'webapp-pf-tabbar';
        nav.setAttribute('aria-label', 'Навигация');
        nav.innerHTML = `
            <div class="webapp-pf-tabbar__inner">
                ${items.map((item) => `
                    <button type="button" class="webapp-pf-tabbar__btn" data-page-id="${item.id}">
                        <span class="material-icons-round">${item.icon}</span>
                        <span class="webapp-pf-tabbar__label">${item.label}</span>
                    </button>
                `).join('')}
            </div>`;

        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigate(btn.dataset.pageId);
        });

        document.body.appendChild(nav);
        document.body.classList.add('webapp-has-pf-tabbar');
    }

    function getCurrentPageId() {
        const hash = (window.location.hash || '').replace('#', '');
        const map = { pro: 'profile-page', bay: 'purchase-page', rebay: 'renew-page', setup: 'setup-page', support: 'support-page' };
        return map[hash] || 'main-page';
    }

    function syncNav(pageId) {
        const id = pageId || getCurrentPageId();
        document.querySelectorAll('#webapp-pf-tabbar [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
    }

    function destroy() {
        document.getElementById('webapp-pf-header')?.remove();
        document.getElementById('webapp-pf-tabbar')?.remove();
        document.getElementById('webapp-pf-dashboard')?.remove();
        document.body.classList.remove('webapp-has-pf-tabbar');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderHeader();
        renderTabBar();
        renderDashboard();
        syncNav(getCurrentPageId());
    }

    window.WebAppPref = {
        init,
        destroy,
        refresh: renderDashboard,
        syncNav,
        isActive,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isActive()) init();
        });
    } else if (isActive()) {
        init();
    }
})();
