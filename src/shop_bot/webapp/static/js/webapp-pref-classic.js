(function () {
    'use strict';

    const DESIGN = 'pref-classic';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-ledger-nav [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
        const drawer = document.getElementById('webapp-ledger-drawer');
        if (drawer) drawer.classList.remove('is-open');
    }

    function renderNav() {
        if (document.getElementById('webapp-ledger-nav')) return;
        const items = [
            { id: 'main-page', label: 'Обзор', icon: 'receipt_long' },
            { id: 'purchase-page', label: 'Тарифы', icon: 'sell' },
            { id: 'setup-page', label: 'Установка', icon: 'download' },
            { id: 'profile-page', label: 'Профиль', icon: 'badge' },
            { id: 'support-page', label: 'Поддержка', icon: 'support_agent' },
        ];
        const nav = document.createElement('nav');
        nav.id = 'webapp-ledger-nav';
        nav.className = 'webapp-ledger-nav';
        nav.innerHTML = items.map((item) => `
            <button type="button" class="webapp-ledger-nav__item" data-page-id="${item.id}">
                <span class="material-icons-round">${item.icon}</span>
                <span>${item.label}</span>
            </button>
        `).join('');
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });

        const drawer = document.createElement('div');
        drawer.id = 'webapp-ledger-drawer';
        drawer.className = 'webapp-ledger-drawer';
        drawer.innerHTML = `
            <button type="button" class="webapp-ledger-drawer__handle" id="webapp-ledger-drawer-toggle" aria-expanded="false">
                <span class="webapp-ledger-drawer__bar"></span>
                <span>Меню кабинета</span>
            </button>
            <div class="webapp-ledger-drawer__panel"></div>
        `;
        drawer.querySelector('.webapp-ledger-drawer__panel').appendChild(nav);
        drawer.querySelector('#webapp-ledger-drawer-toggle').addEventListener('click', () => {
            drawer.classList.toggle('is-open');
        });
        document.body.appendChild(drawer);
    }

    async function renderDashboard() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-ledger-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-ledger-root';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-ledger-loading">Загрузка выписки…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const brand = K().getBrand();
        K().applyAccent('--wa-ledger-accent', data.cfg?.branding?.accent_color);

        const active = key && key.days_left > 0;
        root.innerHTML = `
            <header class="webapp-ledger-head">
                <div class="webapp-ledger-head__meta">
                    <span class="webapp-ledger-head__tag">ВЫПИСКА</span>
                    <span class="webapp-ledger-head__date">${new Date().toLocaleDateString('ru-RU')}</span>
                </div>
                <h1 class="webapp-ledger-head__title">${brand.title}</h1>
                <p class="webapp-ledger-head__user">${K().getUsername()}</p>
            </header>
            <div class="webapp-ledger-timeline">
                <div class="webapp-ledger-timeline__line"></div>
                <article class="webapp-ledger-entry">
                    <div class="webapp-ledger-entry__dot"></div>
                    <div class="webapp-ledger-entry__body">
                        <div class="webapp-ledger-entry__row">
                            <span>Баланс счёта</span>
                            <strong>${K().formatMoney(balance)}</strong>
                        </div>
                        ${data.cfg?.modules?.topup !== false ? `
                        <button type="button" class="webapp-ledger-link" data-ledger-action="topup">Пополнить →</button>` : ''}
                    </div>
                </article>
                <article class="webapp-ledger-entry ${active ? 'is-active' : ''}">
                    <div class="webapp-ledger-entry__dot"></div>
                    <div class="webapp-ledger-entry__body webapp-ledger-invoice">
                        <div class="webapp-ledger-invoice__head">
                            <span>Подписка VPN</span>
                            <span class="webapp-ledger-invoice__no">#${key?.key_id || '—'}</span>
                        </div>
                        ${key ? `
                        <div class="webapp-ledger-invoice__grid">
                            <div><small>Тариф</small><strong>${(key.host_name || key.name || 'Premium').toUpperCase()}</strong></div>
                            <div><small>Статус</small><strong>${active ? 'Активна' : 'Истекла'}</strong></div>
                            <div><small>До</small><strong>${K().formatExpireDate(key.expire_date_str)}</strong></div>
                            <div><small>Осталось</small><strong>${active ? K().daysLabel(key.days_left) : '—'}</strong></div>
                        </div>
                        ` : `<p class="webapp-ledger-muted">Нет активной подписки — оформите тариф.</p>`}
                        <div class="webapp-ledger-invoice__actions">
                            ${key?.sub_url && active ? `<button type="button" class="webapp-ledger-btn" data-ledger-action="connect">Подключить</button>` : ''}
                            <button type="button" class="webapp-ledger-btn webapp-ledger-btn--ghost" data-ledger-action="tariffs">${key ? 'Сменить тариф' : 'Выбрать тариф'}</button>
                        </div>
                    </div>
                </article>
                <article class="webapp-ledger-entry">
                    <div class="webapp-ledger-entry__dot"></div>
                    <div class="webapp-ledger-entry__body">
                        <p class="webapp-ledger-muted">Быстрые операции</p>
                        <div class="webapp-ledger-chips">
                            <button type="button" class="webapp-ledger-chip" data-ledger-action="promo">Промокод</button>
                            <button type="button" class="webapp-ledger-chip" data-ledger-action="history">Платежи</button>
                            <button type="button" class="webapp-ledger-chip" data-ledger-action="referral">Рефералы</button>
                        </div>
                    </div>
                </article>
            </div>`;

        root.querySelectorAll('[data-ledger-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.ledgerAction;
                if (a === 'topup') window.WebAppCabinet?.openTopUp?.();
                else if (a === 'connect') K().navigate('setup-page');
                else if (a === 'tariffs') K().navigate('purchase-page');
                else if (a === 'promo') window.openPromoModal?.();
                else if (a === 'history') window.WebAppCabinet?.openPaymentHistory?.();
                else if (a === 'referral') window.WebAppCabinet?.openReferral?.();
            });
        });
    }

    function destroy() {
        document.getElementById('webapp-ledger-root')?.remove();
        document.getElementById('webapp-ledger-drawer')?.remove();
        document.body.classList.remove('webapp-has-ledger');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        document.body.classList.add('webapp-has-ledger');
        renderNav();
        renderDashboard();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppPrefClassic = { init, destroy, syncNav, refresh: renderDashboard, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
