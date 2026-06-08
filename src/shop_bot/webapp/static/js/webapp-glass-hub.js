(function () {
    'use strict';

    function getUserId() {
        return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.RENDERED_USER_ID;
    }

    function getUsername() {
        const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (u?.username) return '@' + u.username;
        if (u?.first_name) return u.first_name;
        return '@user';
    }

    function isActive() {
        return document.documentElement.dataset.webappDesign === 'glass-hub';
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
        if (typeof window.WebappTheme !== 'undefined') {
            const hashMap = {
                'main-page': '',
                'purchase-page': 'bay',
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
        }
    }

    function renderSubscriptionCard(key) {
        if (!key) {
            return `
                <article class="webapp-gh-card webapp-gh-card--sub">
                    <div class="webapp-gh-card__head">
                        <div class="webapp-gh-card__icon"><span class="material-icons-round">inventory_2</span></div>
                        <h3 class="webapp-gh-card__title">Моя подписка</h3>
                    </div>
                    <div class="webapp-gh-empty">
                        <p>Нет активной подписки</p>
                        <button type="button" class="webapp-gh-btn webapp-gh-btn--primary" data-gh-action="tariffs">Выбрать тариф</button>
                    </div>
                </article>`;
        }

        const active = key.days_left > 0;
        const statusBadge = active
            ? '<span class="webapp-gh-badge webapp-gh-badge--active"><span class="webapp-gh-badge__dot"></span> Активна</span>'
            : '<span class="webapp-gh-badge webapp-gh-badge--muted">Истекла</span>';
        const daysBadge = active && key.days_left != null
            ? `<span class="webapp-gh-badge webapp-gh-badge--muted">${daysLabel(key.days_left)}</span>`
            : '';
        const hwid = key.hwid_info ? `<span class="webapp-gh-badge webapp-gh-badge--outline">${key.hwid_info.replace(' уст.', '')}</span>` : '';
        const planName = (key.host_name || key.name || 'PREMIUM').toUpperCase();

        return `
            <article class="webapp-gh-card webapp-gh-card--sub">
                <div class="webapp-gh-card__head">
                    <div class="webapp-gh-card__icon"><span class="material-icons-round">inventory_2</span></div>
                    <h3 class="webapp-gh-card__title">Моя подписка</h3>
                </div>
                <div class="webapp-gh-badges">${statusBadge}${daysBadge}${hwid}</div>
                <div class="webapp-gh-rows">
                    <div class="webapp-gh-row">
                        <div class="webapp-gh-row__icon"><span class="material-icons-round">sell</span></div>
                        <div>
                            <div class="webapp-gh-row__label">Тариф</div>
                            <div class="webapp-gh-row__value">${planName}</div>
                        </div>
                    </div>
                    <div class="webapp-gh-row">
                        <div class="webapp-gh-row__icon"><span class="material-icons-round">event</span></div>
                        <div>
                            <div class="webapp-gh-row__label">Действует до</div>
                            <div class="webapp-gh-row__value">${formatExpireDate(key.expire_date_str)}</div>
                        </div>
                    </div>
                    <div class="webapp-gh-row">
                        <div class="webapp-gh-row__icon"><span class="material-icons-round">wifi</span></div>
                        <div>
                            <div class="webapp-gh-row__label">Трафик</div>
                            <div class="webapp-gh-row__value">${key.traffic_info?.includes('∞') || key.traffic_info?.endsWith('/ ∞') ? 'Безлимит' : (key.traffic_info || '—')}</div>
                        </div>
                    </div>
                </div>
            </article>`;
    }

    function renderBalanceCard(balance, cfg) {
        if (cfg?.modules?.topup === false) return '';
        return `
            <article class="webapp-gh-card webapp-gh-card--balance">
                <div class="webapp-gh-card__head">
                    <div class="webapp-gh-card__icon"><span class="material-icons-round">account_balance_wallet</span></div>
                    <h3 class="webapp-gh-card__title">Баланс</h3>
                </div>
                <div>
                    <div class="webapp-gh-balance-amount">${formatMoney(balance)}</div>
                    <p class="webapp-gh-balance-sub">На счету для продления тарифов</p>
                </div>
                <div class="webapp-gh-card__foot">
                    <button type="button" class="webapp-gh-btn webapp-gh-btn--primary" data-gh-action="topup">
                        <span class="material-icons-round">add_circle</span>
                        Пополнить баланс
                    </button>
                </div>
            </article>`;
    }

    function renderReferralCard(cfg, status) {
        if (cfg?.modules?.referrals === false) return '';
        const enabled = cfg?.referrals?.enabled;
        if (!enabled) {
            return `
                <article class="webapp-gh-card webapp-gh-card--ref">
                    <div class="webapp-gh-card__head">
                        <div class="webapp-gh-card__icon"><span class="material-icons-round">group</span></div>
                        <h3 class="webapp-gh-card__title">Рефералы</h3>
                    </div>
                    <p class="webapp-gh-ref-desc">Реферальная программа отключена администратором.</p>
                </article>`;
        }

        const link = status?.referral_link || cfg.referrals?.link || '';
        const count = status?.referral_count ?? cfg.referrals?.count ?? 0;

        return `
            <article class="webapp-gh-card webapp-gh-card--ref" id="webapp-gh-ref-card">
                <div class="webapp-gh-card__head">
                    <div class="webapp-gh-card__icon"><span class="material-icons-round">group</span></div>
                    <h3 class="webapp-gh-card__title">Рефералы</h3>
                </div>
                <p class="webapp-gh-ref-desc">Делитесь ссылкой и получайте бонус на баланс за каждого приглашённого друга!</p>
                <div class="webapp-gh-ref-field">
                    <label>Сайт</label>
                    <div class="webapp-gh-ref-input">
                        <code title="${link}">${link}</code>
                        <button type="button" class="webapp-gh-ref-copy" data-gh-copy-ref aria-label="Копировать">
                            <span class="material-icons-round" style="font-size:16px">content_copy</span>
                        </button>
                    </div>
                </div>
                <button type="button" class="webapp-gh-link-btn" data-gh-action="referral-stats">
                    Подробная статистика (${count}) →
                </button>
            </article>`;
    }

    function renderHero(key, status, cfg) {
        const name = getUsername();
        const overrides = cfg?.content_overrides || {};
        const welcomeTpl = (cfg?.branding?.welcome_text || overrides.hero_title || '').trim();
        const heroTitle = welcomeTpl
            ? welcomeTpl.replace('{name}', name).replace('{user}', name)
            : `Добро пожаловать, ${name}`;
        const hasKey = key && key.days_left > 0;
        const subText = (overrides.hero_sub || '').trim() || (hasKey
            ? 'Ваша подписка активна. Подключитесь к VPN и наслаждайтесь свободным интернетом.'
            : 'Оформите подписку или активируйте пробный период, чтобы начать пользоваться VPN.');

        let primaryBtn;
        if (hasKey && key.sub_url) {
            primaryBtn = `<button type="button" class="webapp-gh-btn webapp-gh-btn--primary" data-gh-action="connect">
                <span class="material-icons-round">wifi</span> Подключиться к VPN
            </button>`;
        } else if (status?.trial_available && cfg?.modules?.trial !== false) {
            primaryBtn = `<button type="button" class="webapp-gh-btn webapp-gh-btn--primary" data-gh-action="trial">
                <span class="material-icons-round">card_giftcard</span> Пробный период
            </button>`;
        } else {
            primaryBtn = `<button type="button" class="webapp-gh-btn webapp-gh-btn--primary" data-gh-action="tariffs">
                <span class="material-icons-round">shopping_cart</span> Выбрать тариф
            </button>`;
        }

        const topupBtn = cfg?.modules?.topup === false ? '' : `
                        <button type="button" class="webapp-gh-btn webapp-gh-btn--secondary" data-gh-action="topup">
                            <span class="material-icons-round">add_circle</span> Пополнить баланс
                        </button>`;

        return `
            <section class="webapp-gh-hero">
                <div class="webapp-gh-hero__glow" aria-hidden="true"></div>
                <div class="webapp-gh-hero__body">
                    <div>
                        <h1 class="webapp-gh-hero__title">${heroTitle}</h1>
                        <p class="webapp-gh-hero__sub">${subText}</p>
                    </div>
                    <div class="webapp-gh-hero__actions">
                        ${primaryBtn}
                        ${topupBtn}
                    </div>
                </div>
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
            console.error('glass-hub fetch', e);
            return { status: null, cfg: null };
        }
    }

    function bindDashboardActions(root, data) {
        const link = data.status?.referral_link || data.cfg?.referrals?.link || '';
        root.querySelector('[data-gh-copy-ref]')?.addEventListener('click', () => {
            if (!link) return;
            navigator.clipboard?.writeText(link).then(() => notify('Ссылка скопирована', 'success'));
        });

        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-gh-action]');
            if (!btn) return;
            const action = btn.dataset.ghAction;
            if (action === 'topup') window.WebAppCabinet?.openTopUp?.();
            else if (action === 'tariffs') navigate('purchase-page');
            else if (action === 'connect') navigate('setup-page');
            else if (action === 'trial') window.WebAppCabinet?.activateTrial?.();
            else if (action === 'referral-stats') window.WebAppCabinet?.openReferral?.();
        });
    }

    function updateTopBarBalance(balance) {
        const btn = document.getElementById('webapp-gh-topbar-balance');
        if (!btn) return;
        const amountEl = btn.querySelector('[data-gh-balance-amount]');
        if (amountEl) amountEl.textContent = formatMoney(balance);
    }

    async function renderDashboard() {
        if (!isActive()) return;
        if (window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-glass-hub-dashboard');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-glass-hub-dashboard';
            main.prepend(root);
        }

        root.innerHTML = '<div class="webapp-gh-loading" style="padding:2rem;text-align:center;opacity:.5">Загрузка…</div>';

        const data = await fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? data.cfg?.balance ?? 0;
        const accent = data.cfg?.branding?.accent_color;
        if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) {
            document.documentElement.style.setProperty('--gh-accent', accent);
            document.documentElement.style.setProperty('--wa-accent', accent);
        }

        updateTopBarBalance(balance);

        root.innerHTML = `
            <div class="webapp-gh-bento">
                <div class="webapp-gh-bento__hero">${renderHero(key, data.status, data.cfg)}</div>
                ${renderSubscriptionCard(key)}
                ${renderBalanceCard(balance, data.cfg)}
                ${renderReferralCard(data.cfg, data.status)}
            </div>`;

        bindDashboardActions(root, data);
    }

    function destroyDashboard() {
        document.getElementById('webapp-glass-hub-dashboard')?.remove();
    }

    function renderTopNav() {
        if (document.getElementById('webapp-glass-hub-topnav')) return;

        const brand = (document.querySelector('#main-page header h1')?.textContent || 'VPN').trim();
        const logoSrc = document.querySelector('#main-page header img')?.src || '';

        const nav = document.createElement('header');
        nav.id = 'webapp-glass-hub-topnav';
        nav.className = 'webapp-glass-hub-topnav';
        nav.innerHTML = `
            <div class="webapp-glass-hub-topnav__inner">
                <div class="webapp-glass-hub-topnav__brand">
                    ${logoSrc ? `<img src="${logoSrc}" alt="" />` : '<span class="material-icons-round" style="font-size:22px;color:#60a5fa">shield</span>'}
                    <span>${brand}</span>
                </div>
                <nav class="webapp-glass-hub-topnav__pills" aria-label="Разделы">
                    <button type="button" class="webapp-glass-hub-topnav__pill is-active" data-page-id="main-page">
                        <span class="material-icons-round">home</span> Главная
                    </button>
                    <button type="button" class="webapp-glass-hub-topnav__pill" data-page-id="purchase-page">
                        <span class="material-icons-round">inventory_2</span> Тарифы
                    </button>
                    <button type="button" class="webapp-glass-hub-topnav__pill" data-gh-nav="referrals">
                        <span class="material-icons-round">group</span> Рефералы
                    </button>
                    <button type="button" class="webapp-glass-hub-topnav__pill" data-page-id="profile-page">
                        <span class="material-icons-round">person</span> Профиль
                    </button>
                </nav>
                <div class="webapp-glass-hub-topnav__actions">
                    <button type="button" class="webapp-glass-hub-topnav__icon-btn" id="webapp-gh-theme-btn" title="Оформление">
                        <span class="material-icons-round">palette</span>
                    </button>
                    <button type="button" class="webapp-glass-hub-topnav__icon-btn" id="webapp-gh-refresh-btn" title="Обновить">
                        <span class="material-icons-round">refresh</span>
                    </button>
                    <span class="webapp-glass-hub-topnav__user">${getUsername()}</span>
                    <button type="button" class="webapp-glass-hub-topnav__balance" id="webapp-gh-topbar-balance" data-gh-topup>
                        <span class="material-icons-round">account_balance_wallet</span>
                        <span data-gh-balance-amount>0 ₽</span>
                    </button>
                    <button type="button" class="webapp-glass-hub-topnav__icon-btn" id="webapp-gh-logout-btn" title="Выйти">
                        <span class="material-icons-round">logout</span>
                    </button>
                </div>
            </div>`;

        nav.addEventListener('click', (e) => {
            const refBtn = e.target.closest('[data-gh-nav="referrals"]');
            if (refBtn) {
                navigate('main-page');
                setTimeout(() => {
                    document.getElementById('webapp-gh-ref-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
                return;
            }
            const pageBtn = e.target.closest('[data-page-id]');
            if (pageBtn) navigate(pageBtn.dataset.pageId);
        });

        document.body.prepend(nav);

        document.getElementById('webapp-gh-theme-btn')?.addEventListener('click', () => {
            document.getElementById('webapp-theme-fab')?.click();
        });
        document.getElementById('webapp-gh-refresh-btn')?.addEventListener('click', () => location.reload());
        document.getElementById('webapp-gh-logout-btn')?.addEventListener('click', () => {
            document.getElementById('logout-btn-menu')?.click();
            document.getElementById('logout-btn')?.click();
        });
        document.querySelector('[data-gh-topup]')?.addEventListener('click', () => {
            window.WebAppCabinet?.openTopUp?.();
        });
    }

    function removeTopNav() {
        document.getElementById('webapp-glass-hub-topnav')?.remove();
    }

    function syncNav(pageId) {
        document.querySelectorAll('#webapp-glass-hub-topnav [data-page-id]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === pageId);
        });
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderTopNav();
        renderDashboard();
    }

    function destroy() {
        removeTopNav();
        destroyDashboard();
    }

    window.WebAppGlassHub = {
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
