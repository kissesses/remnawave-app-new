(function () {
    'use strict';

    const DESIGN = 'aurum';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function accountTier(key, balance) {
        if (key && key.days_left > 90) return { label: 'Platinum', level: 'IV', icon: 'diamond' };
        if (key && key.days_left > 0) return { label: 'Premium', level: 'III', icon: 'workspace_premium' };
        if (balance > 500) return { label: 'Gold', level: 'II', icon: 'military_tech' };
        return { label: 'Standard', level: 'I', icon: 'shield' };
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-aurum-tabbar [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
    }

    function renderTabBar() {
        if (document.getElementById('webapp-aurum-tabbar')) return;
        const items = [
            { id: 'main-page', label: 'Главная', icon: 'home' },
            { id: 'purchase-page', label: 'Тарифы', icon: 'credit_card' },
            { id: 'setup-page', label: 'VPN', icon: 'vpn_key' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Чат', icon: 'forum' },
        ];
        const nav = document.createElement('nav');
        nav.id = 'webapp-aurum-tabbar';
        nav.className = 'webapp-aurum-tabbar';
        nav.setAttribute('aria-label', 'Навигация');
        nav.innerHTML = `
            <div class="webapp-aurum-tabbar__glass">
                ${items.map((item) => `
                    <button type="button" class="webapp-aurum-tabbar__btn" data-page-id="${item.id}">
                        <span class="webapp-aurum-tabbar__icon"><span class="material-icons-round">${item.icon}</span></span>
                        <span class="webapp-aurum-tabbar__label">${item.label}</span>
                    </button>
                `).join('')}
            </div>`;
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(nav);
        document.body.classList.add('webapp-has-aurum-tabbar');
    }

    function renderActivity(key, balance, cfg) {
        const items = [];
        const now = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        if (key && key.days_left > 0) {
            items.push({ icon: 'verified', title: 'Подписка активна', sub: `До ${K().formatExpireDate(key.expire_date_str)}`, time: now });
        }
        if (balance > 0) {
            items.push({ icon: 'account_balance_wallet', title: 'Баланс счёта', sub: K().formatMoney(balance), time: now });
        }
        if (cfg?.trial?.available) {
            items.push({ icon: 'card_giftcard', title: 'Пробный период', sub: 'Доступен для активации', time: 'Новое' });
        }
        if (!items.length) {
            items.push({ icon: 'info', title: 'Добро пожаловать', sub: 'Оформите подписку для доступа к VPN', time: now });
        }
        return items.slice(0, 4).map((it) => `
            <li class="webapp-aurum-activity__item">
                <span class="webapp-aurum-activity__icon"><span class="material-icons-round">${it.icon}</span></span>
                <div class="webapp-aurum-activity__text">
                    <strong>${it.title}</strong>
                    <span>${it.sub}</span>
                </div>
                <time class="webapp-aurum-activity__time">${it.time}</time>
            </li>
        `).join('');
    }

    async function renderHome() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-aurum-home');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-aurum-home';
            root.className = 'webapp-aurum-home';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-aurum-loading">Загрузка…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const cfg = data.cfg;
        const tier = accountTier(key, balance);
        const active = key && key.days_left > 0;
        const brand = K().getBrand();
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

        K().applyAccent('--wa-aurum-gold', cfg?.branding?.accent_color || '#c9a962');

        const traffic = key?.traffic_info?.includes('∞') ? '∞' : (key?.traffic_info || '—');
        const refCount = data.status?.referral_count ?? cfg?.referrals?.count ?? 0;

        root.innerHTML = `
            <header class="webapp-aurum-hero">
                <div class="webapp-aurum-hero__mesh" aria-hidden="true"></div>
                <div class="webapp-aurum-hero__row">
                    <div class="webapp-aurum-hero__greet">
                        <span class="webapp-aurum-hero__eyebrow">${greet}</span>
                        <h1 class="webapp-aurum-hero__name">${K().getUsername()}</h1>
                    </div>
                    <button type="button" class="webapp-aurum-avatar" data-aurum-action="profile" aria-label="Профиль">
                        <span class="webapp-aurum-avatar__ring"></span>
                        <span class="webapp-aurum-avatar__letter">${K().getUserInitial()}</span>
                    </button>
                </div>
            </header>

            <article class="webapp-aurum-membership">
                <div class="webapp-aurum-membership__shine" aria-hidden="true"></div>
                <div class="webapp-aurum-membership__top">
                    <span class="webapp-aurum-membership__brand">${brand.title}</span>
                    <span class="webapp-aurum-membership__badge">
                        <span class="material-icons-round">${tier.icon}</span> ${tier.label}
                    </span>
                </div>
                <div class="webapp-aurum-membership__body">
                    <div>
                        <small>Уровень аккаунта</small>
                        <strong>${tier.level}</strong>
                    </div>
                    <div>
                        <small>Статус</small>
                        <strong>${active ? 'Premium' : 'Базовый'}</strong>
                    </div>
                </div>
            </article>

            <section class="webapp-aurum-section">
                <h2 class="webapp-aurum-section__title">Показатели</h2>
                <div class="webapp-aurum-stats">
                    <article class="webapp-aurum-stat">
                        <span class="material-icons-round">account_balance_wallet</span>
                        <span class="webapp-aurum-stat__value">${K().formatMoney(balance)}</span>
                        <span class="webapp-aurum-stat__label">Баланс</span>
                    </article>
                    <article class="webapp-aurum-stat">
                        <span class="material-icons-round">schedule</span>
                        <span class="webapp-aurum-stat__value">${active ? key.days_left : '—'}</span>
                        <span class="webapp-aurum-stat__label">Дней VPN</span>
                    </article>
                    <article class="webapp-aurum-stat">
                        <span class="material-icons-round">swap_vert</span>
                        <span class="webapp-aurum-stat__value">${traffic}</span>
                        <span class="webapp-aurum-stat__label">Трафик</span>
                    </article>
                    <article class="webapp-aurum-stat">
                        <span class="material-icons-round">group</span>
                        <span class="webapp-aurum-stat__value">${refCount}</span>
                        <span class="webapp-aurum-stat__label">Рефералы</span>
                    </article>
                </div>
            </section>

            <section class="webapp-aurum-section">
                <h2 class="webapp-aurum-section__title">Подписка</h2>
                <article class="webapp-aurum-pass ${active ? 'is-active' : ''}">
                    <div class="webapp-aurum-pass__chip"></div>
                    <div class="webapp-aurum-pass__row">
                        <span class="webapp-aurum-pass__plan">${key ? (key.host_name || key.name || 'Premium').toUpperCase() : 'NO PLAN'}</span>
                        <span class="webapp-aurum-pass__status">${active ? 'ACTIVE' : 'INACTIVE'}</span>
                    </div>
                    <div class="webapp-aurum-pass__meta">
                        <div><small>Действует до</small><strong>${key ? K().formatExpireDate(key.expire_date_str) : '—'}</strong></div>
                        <div><small>Ключ</small><strong>#${key?.key_id || '—'}</strong></div>
                    </div>
                    <div class="webapp-aurum-pass__actions">
                        ${active ? `<button type="button" class="webapp-aurum-btn webapp-aurum-btn--gold" data-aurum-action="connect">Подключить VPN</button>` : ''}
                        <button type="button" class="webapp-aurum-btn webapp-aurum-btn--ghost" data-aurum-action="tariffs">${key ? 'Продлить' : 'Выбрать тариф'}</button>
                    </div>
                </article>
            </section>

            <section class="webapp-aurum-section">
                <h2 class="webapp-aurum-section__title">Активность</h2>
                <ul class="webapp-aurum-activity">${renderActivity(key, balance, cfg)}</ul>
            </section>

            <section class="webapp-aurum-section">
                <h2 class="webapp-aurum-section__title">Быстрые действия</h2>
                <div class="webapp-aurum-quick">
                    <button type="button" class="webapp-aurum-quick__btn" data-aurum-action="topup"><span class="material-icons-round">add_card</span><span>Пополнить</span></button>
                    <button type="button" class="webapp-aurum-quick__btn" data-aurum-action="promo"><span class="material-icons-round">redeem</span><span>Промо</span></button>
                    <button type="button" class="webapp-aurum-quick__btn" data-aurum-action="history"><span class="material-icons-round">receipt_long</span><span>Платежи</span></button>
                    <button type="button" class="webapp-aurum-quick__btn" data-aurum-action="qr"><span class="material-icons-round">qr_code_2</span><span>QR</span></button>
                </div>
            </section>

            <section class="webapp-aurum-section">
                <h2 class="webapp-aurum-section__title">Аккаунт</h2>
                <div class="webapp-aurum-settings">
                    <button type="button" class="webapp-aurum-settings__row" data-aurum-action="profile">
                        <span class="material-icons-round">manage_accounts</span>
                        <span>Настройки профиля</span>
                        <span class="material-icons-round webapp-aurum-settings__chev">chevron_right</span>
                    </button>
                    <button type="button" class="webapp-aurum-settings__row" data-aurum-action="referral">
                        <span class="material-icons-round">group_add</span>
                        <span>Реферальная программа</span>
                        <span class="material-icons-round webapp-aurum-settings__chev">chevron_right</span>
                    </button>
                    <button type="button" class="webapp-aurum-settings__row" data-aurum-action="setup">
                        <span class="material-icons-round">settings</span>
                        <span>Установка и настройка</span>
                        <span class="material-icons-round webapp-aurum-settings__chev">chevron_right</span>
                    </button>
                </div>
            </section>

            <section class="webapp-aurum-section webapp-aurum-section--last">
                <button type="button" class="webapp-aurum-support" data-aurum-action="support">
                    <span class="webapp-aurum-support__icon"><span class="material-icons-round">headset_mic</span></span>
                    <span class="webapp-aurum-support__text">
                        <strong>Поддержка</strong>
                        <small>Обратная связь и помощь 24/7</small>
                    </span>
                    <span class="material-icons-round">arrow_forward</span>
                </button>
            </section>`;

        root.querySelectorAll('[data-aurum-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.aurumAction;
                if (a === 'profile') K().navigate('profile-page');
                else if (a === 'support') K().navigate('support-page');
                else if (a === 'setup') K().navigate('setup-page');
                else if (a === 'tariffs') K().navigate('purchase-page');
                else if (a === 'connect') K().navigate('setup-page');
                else if (a === 'topup') window.WebAppCabinet?.openTopUp?.();
                else if (a === 'promo') window.openPromoModal?.();
                else if (a === 'history') window.WebAppCabinet?.openPaymentHistory?.();
                else if (a === 'referral') window.WebAppCabinet?.openReferral?.();
                else if (a === 'qr') window.WebAppCabinet?.openQr?.();
            });
        });
    }

    function destroy() {
        document.getElementById('webapp-aurum-home')?.remove();
        document.getElementById('webapp-aurum-tabbar')?.remove();
        document.body.classList.remove('webapp-has-aurum-tabbar');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderTabBar();
        renderHome();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppAurum = { init, destroy, syncNav, refresh: renderHome, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
