(function () {
    'use strict';

    const DESIGN = 'pref-macos';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-aqua-dock [data-page-id]').forEach((btn, i, all) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
            btn.style.setProperty('--dock-scale', btn.dataset.pageId === id ? '1.35' : '1');
        });
    }

    function renderChrome() {
        if (document.getElementById('webapp-aqua-menubar')) return;
        const brand = K().getBrand();

        const menubar = document.createElement('header');
        menubar.id = 'webapp-aqua-menubar';
        menubar.className = 'webapp-aqua-menubar';
        menubar.innerHTML = `
            <div class="webapp-aqua-menubar__lights">
                <span></span><span></span><span></span>
            </div>
            <div class="webapp-aqua-menubar__title">${brand.title}</div>
            <div class="webapp-aqua-menubar__balance" id="webapp-aqua-balance">—</div>
        `;
        document.body.prepend(menubar);

        const items = [
            { id: 'main-page', label: 'Finder', icon: 'folder' },
            { id: 'purchase-page', label: 'Store', icon: 'storefront' },
            { id: 'setup-page', label: 'Setup', icon: 'download' },
            { id: 'support-page', label: 'Help', icon: 'help' },
            { id: 'profile-page', label: 'You', icon: 'person' },
        ];

        const dock = document.createElement('nav');
        dock.id = 'webapp-aqua-dock';
        dock.className = 'webapp-aqua-dock';
        dock.setAttribute('aria-label', 'Dock');
        dock.innerHTML = `<div class="webapp-aqua-dock__tray">${items.map((item) => `
            <button type="button" class="webapp-aqua-dock__icon" data-page-id="${item.id}" title="${item.label}">
                <span class="material-icons-round">${item.icon}</span>
            </button>
        `).join('')}<div class="webapp-aqua-dock__divider"></div>
        <button type="button" class="webapp-aqua-dock__icon webapp-aqua-dock__icon--trash" data-dock-action="reload" title="Reload">
            <span class="material-icons-round">refresh</span>
        </button></div>`;

        dock.addEventListener('click', (e) => {
            const reload = e.target.closest('[data-dock-action="reload"]');
            if (reload) { location.reload(); return; }
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(dock);
    }

    async function renderWindow() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-aqua-window');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-aqua-window';
            root.className = 'webapp-aqua-window';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-aqua-window__loading">Opening Subscription.app…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        K().applyAccent('--wa-aqua-accent', data.cfg?.branding?.accent_color || '#0a84ff');

        const balEl = document.getElementById('webapp-aqua-balance');
        if (balEl) balEl.textContent = K().formatMoney(balance);

        const active = key && key.days_left > 0;
        root.innerHTML = `
            <div class="webapp-aqua-window__titlebar">
                <span class="webapp-aqua-window__titlebar-lights"><span></span><span></span><span></span></span>
                <span class="webapp-aqua-window__title">Subscription.app</span>
            </div>
            <div class="webapp-aqua-window__toolbar">
                <button type="button" data-aqua-action="connect"><span class="material-icons-round">wifi</span></button>
                <button type="button" data-aqua-action="tariffs"><span class="material-icons-round">shopping_bag</span></button>
                <button type="button" data-aqua-action="topup"><span class="material-icons-round">account_balance_wallet</span></button>
            </div>
            <div class="webapp-aqua-window__content">
                <table class="webapp-aqua-table">
                    <tbody>
                        <tr><td>Account</td><td>${K().getUsername()}</td></tr>
                        <tr><td>Plan</td><td>${key ? (key.host_name || key.name || 'Premium') : '—'}</td></tr>
                        <tr><td>Status</td><td><span class="webapp-aqua-pill ${active ? 'is-on' : ''}">${active ? 'Active' : 'Inactive'}</span></td></tr>
                        <tr><td>Renews</td><td>${key ? K().formatExpireDate(key.expire_date_str) : '—'}</td></tr>
                        <tr><td>Remaining</td><td>${active ? K().daysLabel(key.days_left) : '—'}</td></tr>
                        <tr><td>Balance</td><td>${K().formatMoney(balance)}</td></tr>
                    </tbody>
                </table>
                ${!key ? `<button type="button" class="webapp-aqua-cta" data-aqua-action="tariffs">Get Subscription in Store</button>` : ''}
            </div>`;

        root.querySelectorAll('[data-aqua-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.aquaAction;
                if (a === 'topup') window.WebAppCabinet?.openTopUp?.();
                else if (a === 'connect') K().navigate('setup-page');
                else if (a === 'tariffs') K().navigate('purchase-page');
            });
        });
    }

    function destroy() {
        document.getElementById('webapp-aqua-window')?.remove();
        document.getElementById('webapp-aqua-menubar')?.remove();
        document.getElementById('webapp-aqua-dock')?.remove();
        document.body.classList.remove('webapp-has-aqua');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        document.body.classList.add('webapp-has-aqua');
        renderChrome();
        renderWindow();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppPrefMacos = { init, destroy, syncNav, refresh: renderWindow, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
