(function () {
    'use strict';

    const DESIGN = 'pref-macos-v2';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-stage-rail [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
    }

    function renderRail() {
        if (document.getElementById('webapp-stage-rail')) return;
        const items = [
            { id: 'main-page', icon: 'space_dashboard' },
            { id: 'purchase-page', icon: 'payments' },
            { id: 'setup-page', icon: 'install_mobile' },
            { id: 'support-page', icon: 'chat' },
            { id: 'profile-page', icon: 'account_circle' },
        ];
        const rail = document.createElement('aside');
        rail.id = 'webapp-stage-rail';
        rail.className = 'webapp-stage-rail';
        rail.innerHTML = items.map((item) => `
            <button type="button" class="webapp-stage-rail__btn" data-page-id="${item.id}" title="${item.id}">
                <span class="material-icons-round">${item.icon}</span>
            </button>
        `).join('');
        rail.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(rail);
    }

    function renderSearchBar(balance) {
        if (document.getElementById('webapp-stage-search')) return;
        const bar = document.createElement('div');
        bar.id = 'webapp-stage-search';
        bar.className = 'webapp-stage-search';
        bar.innerHTML = `
            <span class="material-icons-round">search</span>
            <span class="webapp-stage-search__text">Баланс: <strong id="webapp-stage-balance">${K().formatMoney(balance)}</strong></span>
            <button type="button" class="webapp-stage-search__action" data-stage-action="topup">+</button>
        `;
        bar.querySelector('[data-stage-action="topup"]')?.addEventListener('click', () => {
            window.WebAppCabinet?.openTopUp?.();
        });
        document.getElementById('main-page')?.prepend(bar);
    }

    async function renderDeck() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        K().applyAccent('--wa-stage-accent', data.cfg?.branding?.accent_color || '#0a84ff');

        renderSearchBar(balance);
        const bal = document.getElementById('webapp-stage-balance');
        if (bal) bal.textContent = K().formatMoney(balance);

        let deck = document.getElementById('webapp-stage-deck');
        if (!deck) {
            deck = document.createElement('div');
            deck.id = 'webapp-stage-deck';
            deck.className = 'webapp-stage-deck';
            main.appendChild(deck);
        }

        const active = key && key.days_left > 0;
        deck.innerHTML = `
            <section class="webapp-stage-panel webapp-stage-panel--hero">
                <p class="webapp-stage-eyebrow">Workspace</p>
                <h2>${K().getUsername()}</h2>
                <p class="webapp-stage-sub">${active ? 'Подписка активна' : 'Нужен тариф'}</p>
            </section>
            <section class="webapp-stage-panel webapp-stage-panel--stat">
                <span class="webapp-stage-stat__label">Тариф</span>
                <span class="webapp-stage-stat__value">${key ? (key.host_name || 'Premium') : '—'}</span>
            </section>
            <section class="webapp-stage-panel webapp-stage-panel--stat">
                <span class="webapp-stage-stat__label">Осталось</span>
                <span class="webapp-stage-stat__value">${active ? K().daysLabel(key.days_left) : '0 дней'}</span>
            </section>
            <section class="webapp-stage-panel webapp-stage-panel--stat">
                <span class="webapp-stage-stat__label">До</span>
                <span class="webapp-stage-stat__value">${key ? K().formatExpireDate(key.expire_date_str) : '—'}</span>
            </section>
            <section class="webapp-stage-panel webapp-stage-panel--cta">
                <button type="button" data-stage-action="tariffs">Тарифы</button>
                <button type="button" data-stage-action="connect">VPN</button>
                <button type="button" data-stage-action="promo">Промо</button>
            </section>`;

        deck.querySelectorAll('[data-stage-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.stageAction;
                if (a === 'tariffs') K().navigate('purchase-page');
                else if (a === 'connect') K().navigate('setup-page');
                else if (a === 'promo') window.openPromoModal?.();
            });
        });
    }

    function destroy() {
        document.getElementById('webapp-stage-deck')?.remove();
        document.getElementById('webapp-stage-search')?.remove();
        document.getElementById('webapp-stage-rail')?.remove();
        document.body.classList.remove('webapp-has-stage');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        document.body.classList.add('webapp-has-stage');
        renderRail();
        renderDeck();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppPrefMacosV2 = { init, destroy, syncNav, refresh: renderDeck, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
