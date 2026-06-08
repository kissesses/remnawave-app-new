(function () {
    'use strict';

    const DESIGN = 'native';
    const K = () => window.WebAppThemeKit;

    const ICON_COLORS = {
        vpn: '#32ADE6',
        store: '#34C759',
        renew: '#FF9500',
        devices: '#FF9500',
        traffic: '#5AC8FA',
        balance: '#34C759',
        promo: '#AF52DE',
        history: '#5856D6',
        referral: '#32ADE6',
        support: '#5AC8FA',
        setup: '#007AFF',
        premium: '#AF52DE',
    };

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function cell(icon, color, label, value, action) {
        return `
            <button type="button" class="webapp-native-cell" data-native-action="${action}" aria-label="${label}">
                <span class="webapp-native-cell__icon" style="background:${color}">
                    <span class="material-icons-round" aria-hidden="true">${icon}</span>
                </span>
                <span class="webapp-native-cell__body">
                    <span class="webapp-native-cell__label">${label}</span>
                    ${value ? `<span class="webapp-native-cell__value">${value}</span>` : ''}
                    <span class="material-icons-round webapp-native-cell__chev" aria-hidden="true">chevron_right</span>
                </span>
            </button>`;
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-native-tabbar [data-page-id]').forEach((btn) => {
            const active = btn.dataset.pageId === id;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-current', active ? 'page' : 'false');
        });
    }

    function syncTabAvatar() {
        const btn = document.querySelector('#webapp-native-tabbar [data-page-id="profile-page"]');
        if (!btn) return;
        const avatar = btn.querySelector('.webapp-native-tabbar__avatar');
        const glyph = btn.querySelector('.webapp-native-tabbar__glyph');
        const img = document.getElementById('webapp-profile-avatar-img');
        const url = img?.src;
        const hasPhoto = url && !img.classList.contains('hidden');
        if (avatar && glyph) {
            if (hasPhoto) {
                avatar.src = url;
                avatar.hidden = false;
                glyph.hidden = true;
            } else {
                avatar.hidden = true;
                glyph.hidden = false;
            }
        }
    }

    function renderTabBar() {
        if (document.getElementById('webapp-native-tabbar')) return;
        const items = [
            { id: 'main-page', label: 'Сервис', icon: 'apps' },
            { id: 'setup-page', label: 'VPN', icon: 'vpn_key' },
            { id: 'support-page', label: 'Чаты', icon: 'forum', badge: true },
            { id: 'profile-page', label: 'Профиль', icon: 'person', avatar: true },
        ];
        const nav = document.createElement('nav');
        nav.id = 'webapp-native-tabbar';
        nav.className = 'webapp-native-tabbar';
        nav.setAttribute('aria-label', 'Навигация');
        nav.innerHTML = items.map((item) => `
            <button type="button" class="webapp-native-tabbar__btn" data-page-id="${item.id}" aria-label="${item.label}">
                <span class="webapp-native-tabbar__icon">
                    ${item.avatar ? '<img class="webapp-native-tabbar__avatar" alt="" hidden /><span class="material-icons-round webapp-native-tabbar__glyph">' + item.icon + '</span>' : '<span class="material-icons-round">' + item.icon + '</span>'}
                    ${item.badge ? '<span class="webapp-native-tabbar__badge" id="webapp-native-chat-badge" hidden>1</span>' : ''}
                </span>
                <span class="webapp-native-tabbar__label">${item.label}</span>
            </button>
        `).join('');
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(nav);

        let fab = document.getElementById('webapp-native-store-fab');
        if (!fab) {
            fab = document.createElement('button');
            fab.type = 'button';
            fab.id = 'webapp-native-store-fab';
            fab.className = 'webapp-native-store-fab';
            fab.setAttribute('aria-label', 'Тарифы');
            fab.innerHTML = '<span class="material-icons-round">storefront</span>';
            fab.addEventListener('click', () => {
                K().navigate('purchase-page');
                syncNav('purchase-page');
            });
            document.body.appendChild(fab);
        }

        document.body.classList.add('webapp-has-native-tabbar');
        syncTabAvatar();
    }

    async function renderHome() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-native-home');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-native-home';
            root.className = 'webapp-native-home';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-native-loading">Загрузка…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const cfg = data.cfg;
        const active = !!(key && key.days_left > 0);
        const brand = K().getBrand();

        K().applyAccent('--wa-n-accent', cfg?.branding?.accent_color || '#2AABEE');

        const statusLabel = active ? 'Подписка активна' : 'Подписка неактивна';
        const statusSub = active
            ? `до ${K().formatExpireDate(key.expire_date_str)} · ${key.remaining_str || key.days_left + ' дн.'}`
            : 'Оформите тариф для доступа к VPN';

        root.innerHTML = `
            <header class="webapp-native-topbar">
                <button type="button" class="webapp-native-topbar__btn" data-native-action="menu" aria-label="Меню">
                    <span class="material-icons-round">menu</span>
                </button>
                <div class="webapp-native-topbar__title">${K().getUsername()}</div>
                <button type="button" class="webapp-native-topbar__btn" data-native-action="profile" aria-label="Профиль">Изм.</button>
            </header>

            <div class="webapp-native-status ${active ? 'is-active' : 'is-inactive'}" role="status">
                <span class="webapp-native-status__label">${statusLabel}</span>
                <span class="webapp-native-status__sub">${statusSub}</span>
                ${key?.host_name ? `<span class="webapp-native-status__sub">${key.host_name}</span>` : ''}
            </div>

            <section class="webapp-native-group" aria-label="VPN">
                ${cell('vpn_key', ICON_COLORS.vpn, 'Подключить VPN', active ? 'Активно' : 'Неактивно', 'setup')}
                ${cell('public', ICON_COLORS.store, 'Серверы и тарифы', '', 'purchase')}
                ${cell('autorenew', ICON_COLORS.renew, 'Продлить подписку', active ? K().formatExpireDate(key.expire_date_str) : '—', 'renew')}
            </section>

            <section class="webapp-native-group" aria-label="Аккаунт">
                ${cell('devices', ICON_COLORS.devices, 'Устройства', key?.hwid_info || '—', 'devices')}
                ${cell('swap_vert', ICON_COLORS.traffic, 'Трафик', key?.traffic_info || '—', 'traffic')}
                ${cell('account_balance_wallet', ICON_COLORS.balance, 'Баланс', K().formatMoney(balance), 'topup')}
            </section>

            <section class="webapp-native-group" aria-label="Дополнительно">
                ${cell('redeem', ICON_COLORS.promo, 'Промокод', '', 'promo')}
                ${cell('receipt_long', ICON_COLORS.history, 'История платежей', '', 'history')}
                ${cell('group_add', ICON_COLORS.referral, 'Реферальная программа', String(data.status?.referral_count ?? cfg?.referrals?.count ?? 0), 'referral')}
                ${cell('headset_mic', ICON_COLORS.support, 'Поддержка', '', 'support')}
            </section>

            ${cfg?.trial?.available ? `
            <section class="webapp-native-group" aria-label="Пробный период">
                ${cell('card_giftcard', ICON_COLORS.premium, 'Пробный период', 'Доступен', 'trial')}
            </section>` : ''}

            <p style="text-align:center;color:var(--wa-n-label);font-size:0.75rem;margin:8px 0 0">${brand.title}</p>`;

        root.querySelectorAll('[data-native-action]').forEach((btn) => {
            btn.addEventListener('click', () => handleAction(btn.dataset.nativeAction, key));
        });
    }

    function handleAction(action, key) {
        if (action === 'traffic') return;
        if (action === 'setup') K().navigate('setup-page');
        else if (action === 'purchase') K().navigate('purchase-page');
        else if (action === 'renew') K().navigate('renew-page');
        else if (action === 'support') K().navigate('support-page');
        else if (action === 'profile') K().navigate('profile-page');
        else if (action === 'menu') location.reload();
        else if (action === 'topup') window.WebAppCabinet?.openTopUp?.();
        else if (action === 'promo') window.openPromoModal?.();
        else if (action === 'history') window.WebAppCabinet?.openPaymentHistory?.();
        else if (action === 'referral') window.WebAppCabinet?.openReferral?.();
        else if (action === 'trial') window.WebAppCabinet?.activateTrial?.();
        else if (action === 'devices' && key && typeof openActionModal === 'function') {
            openActionModal('devices', key.key_id, key.host_name || '');
        }
        syncNav(K().pageIdFromHash());
    }

    function destroy() {
        document.getElementById('webapp-native-home')?.remove();
        document.getElementById('webapp-native-tabbar')?.remove();
        document.getElementById('webapp-native-store-fab')?.remove();
        document.body.classList.remove('webapp-has-native-tabbar');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderTabBar();
        renderHome();
        syncNav(K().pageIdFromHash());
        syncTabAvatar();
    }

    window.WebAppNative = { init, destroy, syncNav, refresh: renderHome, isActive, syncTabAvatar };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
