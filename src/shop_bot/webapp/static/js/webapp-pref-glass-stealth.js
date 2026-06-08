(function () {
    'use strict';

    const DESIGN = 'pref-glass-stealth';
    const K = () => window.WebAppThemeKit;

    const ORBIT = [
        { id: 'main-page', icon: 'home', angle: -90 },
        { id: 'purchase-page', icon: 'diamond', angle: -18 },
        { id: 'setup-page', icon: 'link', angle: 54 },
        { id: 'support-page', icon: 'forum', angle: 126 },
        { id: 'profile-page', icon: 'person', angle: 198 },
    ];

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-void-orbit [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
    }

    function renderOrbit() {
        if (document.getElementById('webapp-void-orbit')) return;
        const brand = K().getBrand();
        const R = 118;

        const hub = document.createElement('nav');
        hub.id = 'webapp-void-orbit';
        hub.className = 'webapp-void-orbit';
        hub.innerHTML = `
            <button type="button" class="webapp-void-orbit__core" data-page-id="main-page" aria-label="Home">
                ${brand.logo ? `<img src="${brand.logo}" alt="" />` : '<span class="material-icons-round">hub</span>'}
            </button>
            ${ORBIT.filter((o) => o.id !== 'main-page').map((item) => {
                const rad = (item.angle * Math.PI) / 180;
                const x = Math.cos(rad) * R;
                const y = Math.sin(rad) * R;
                return `<button type="button" class="webapp-void-orbit__node" data-page-id="${item.id}"
                    style="--ox:${x.toFixed(1)}px;--oy:${y.toFixed(1)}px" aria-label="${item.id}">
                    <span class="material-icons-round">${item.icon}</span>
                </button>`;
            }).join('')}
        `;
        hub.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(hub);
    }

    async function renderShards() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-void-shards');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-void-shards';
            root.className = 'webapp-void-shards';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-void-loading">Синхронизация…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const active = key && key.days_left > 0;

        root.innerHTML = `
            <article class="webapp-void-shard webapp-void-shard--a">
                <span class="webapp-void-shard__label">Подписка</span>
                <strong>${active ? 'ONLINE' : 'OFFLINE'}</strong>
                <p>${key ? (key.host_name || 'Premium') : 'Нет ключа'}</p>
            </article>
            <article class="webapp-void-shard webapp-void-shard--b">
                <span class="webapp-void-shard__label">Баланс</span>
                <strong>${K().formatMoney(balance)}</strong>
                <button type="button" data-void-action="topup">Пополнить</button>
            </article>
            <article class="webapp-void-shard webapp-void-shard--c">
                <span class="webapp-void-shard__label">Срок</span>
                <strong>${key ? K().formatExpireDate(key.expire_date_str) : '—'}</strong>
                <p>${active ? K().daysLabel(key.days_left) : 'Истекла'}</p>
            </article>`;

        root.querySelector('[data-void-action="topup"]')?.addEventListener('click', () => {
            window.WebAppCabinet?.openTopUp?.();
        });
    }

    function destroy() {
        document.getElementById('webapp-void-shards')?.remove();
        document.getElementById('webapp-void-orbit')?.remove();
        document.body.classList.remove('webapp-has-void');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        document.body.classList.add('webapp-has-void');
        renderOrbit();
        renderShards();
        syncNav(K().pageIdFromHash());
    }

    window.WebAppPrefGlassStealth = { init, destroy, syncNav, refresh: renderShards, isActive };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
