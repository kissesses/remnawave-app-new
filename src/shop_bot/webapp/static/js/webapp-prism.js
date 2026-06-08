(function () {
    'use strict';

    const DESIGN = 'classic';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-prism-tabbar [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
    }

    function renderTabBar() {
        if (document.getElementById('webapp-prism-tabbar')) return;
        const items = [
            { id: 'main-page', label: 'Главная', icon: 'home' },
            { id: 'purchase-page', label: 'Тарифы', icon: 'shopping_bag' },
            { id: 'setup-page', label: 'VPN', icon: 'vpn_key' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Чат', icon: 'forum' },
        ];
        const nav = document.createElement('nav');
        nav.id = 'webapp-prism-tabbar';
        nav.className = 'webapp-prism-tabbar';
        nav.setAttribute('aria-label', 'Навигация');
        nav.innerHTML = `
            <div class="webapp-prism-tabbar__glass">
                ${items.map((item) => `
                    <button type="button" class="webapp-prism-tabbar__btn" data-page-id="${item.id}">
                        <span class="material-icons-round">${item.icon}</span>
                        <span>${item.label}</span>
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
        document.body.classList.add('webapp-has-prism-tabbar');
    }

    async function renderHome() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-prism-home');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-prism-home';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-prism-loading">Загрузка…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const cfg = data.cfg;
        const active = key && key.days_left > 0;
        const brand = K().getBrand();
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
        const accent = cfg?.branding?.accent_color || '#10b981';
        K().applyAccent('--wa-prism-accent', accent);

        const traffic = key?.traffic_info?.includes('∞') ? '∞' : (key?.traffic_info || '—');

        root.innerHTML = `
            <header class="webapp-prism-hero">
                <div class="webapp-prism-hero__row">
                    <div>
                        <span class="webapp-prism-hero__eyebrow">${greet}</span>
                        <h1 class="webapp-prism-hero__name">${K().getUsername()}</h1>
                    </div>
                    <button type="button" class="webapp-prism-avatar" data-prism-action="profile">${K().getUserInitial()}</button>
                </div>
            </header>

            <article class="webapp-prism-card webapp-prism-card--accent">
                <span class="webapp-prism-card__label">${brand.title}</span>
                <span class="webapp-prism-card__value">${active ? 'Подписка активна' : 'Нет подписки'}</span>
                <span class="webapp-prism-card__sub">${active ? `До ${K().formatExpireDate(key.expire_date_str)}` : 'Оформите тариф для доступа к VPN'}</span>
            </article>

            <div class="webapp-prism-stats">
                <article class="webapp-prism-stat">
                    <span class="material-icons-round webapp-prism-stat__icon">account_balance_wallet</span>
                    <span class="webapp-prism-stat__val">${K().formatMoney(balance)}</span>
                    <span class="webapp-prism-stat__lbl">Баланс</span>
                </article>
                <article class="webapp-prism-stat">
                    <span class="material-icons-round webapp-prism-stat__icon">schedule</span>
                    <span class="webapp-prism-stat__val">${active ? key.days_left : '—'}</span>
                    <span class="webapp-prism-stat__lbl">Дней VPN</span>
                </article>
                <article class="webapp-prism-stat">
                    <span class="material-icons-round webapp-prism-stat__icon">swap_vert</span>
                    <span class="webapp-prism-stat__val">${traffic}</span>
                    <span class="webapp-prism-stat__lbl">Трафик</span>
                </article>
                <article class="webapp-prism-stat">
                    <span class="material-icons-round webapp-prism-stat__icon">vpn_key</span>
                    <span class="webapp-prism-stat__val">#${key?.key_id || '—'}</span>
                    <span class="webapp-prism-stat__lbl">Ключ</span>
                </article>
            </div>

            <section>
                <h2 class="webapp-prism-section__title">Действия</h2>
                <div class="webapp-prism-actions">
                    <button type="button" class="webapp-prism-action" data-prism-action="tariffs">
                        <span class="material-icons-round">shopping_bag</span><span>${key ? 'Продлить' : 'Купить'}</span>
                    </button>
                    <button type="button" class="webapp-prism-action" data-prism-action="connect">
                        <span class="material-icons-round">vpn_key</span><span>Подключить</span>
                    </button>
                    <button type="button" class="webapp-prism-action" data-prism-action="topup">
                        <span class="material-icons-round">add_card</span><span>Пополнить</span>
                    </button>
                    <button type="button" class="webapp-prism-action" data-prism-action="promo">
                        <span class="material-icons-round">redeem</span><span>Промо</span>
                    </button>
                </div>
            </section>

            <section>
                <h2 class="webapp-prism-section__title">Меню</h2>
                <div class="webapp-prism-list">
                    <button type="button" class="webapp-prism-list__row" data-prism-action="profile">
                        <span class="material-icons-round">manage_accounts</span><span>Профиль</span><span class="material-icons-round">chevron_right</span>
                    </button>
                    <button type="button" class="webapp-prism-list__row" data-prism-action="setup">
                        <span class="material-icons-round">download</span><span>Установка</span><span class="material-icons-round">chevron_right</span>
                    </button>
                    <button type="button" class="webapp-prism-list__row" data-prism-action="support">
                        <span class="material-icons-round">headset_mic</span><span>Поддержка</span><span class="material-icons-round">chevron_right</span>
                    </button>
                </div>
            </section>`;

        root.querySelectorAll('[data-prism-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.prismAction;
                if (a === 'profile') K().navigate('profile-page');
                else if (a === 'support') K().navigate('support-page');
                else if (a === 'setup' || a === 'connect') K().navigate('setup-page');
                else if (a === 'tariffs') K().navigate('purchase-page');
                else if (a === 'topup') window.WebAppCabinet?.openTopUp?.();
                else if (a === 'promo') window.openPromoModal?.();
            });
        });
    }

    function destroy() {
        document.getElementById('webapp-prism-home')?.remove();
        document.getElementById('webapp-prism-tabbar')?.remove();
        document.body.classList.remove('webapp-has-prism-tabbar');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderTabBar();
        renderHome();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppPrism = { init, destroy, syncNav, refresh: renderHome, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
