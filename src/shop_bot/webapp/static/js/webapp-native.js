(function () {
    'use strict';

    const DESIGN = 'native';
    const K = () => window.WebAppThemeKit;
    const THEME_KEY = 'webapp-native-appearance';
    const PTR_THRESHOLD = 72;

    const PAGE_TITLES = {
        'main-page': 'Сервис',
        'setup-page': 'VPN',
        'purchase-page': 'Тарифы',
        'renew-page': 'Продление',
        'profile-page': 'Профиль',
        'support-page': 'Чаты',
    };

    const SEARCH_ITEMS = [
        { q: 'vpn подключить установка', label: 'Подключить VPN', icon: 'vpn_key', color: '#32ADE6', page: 'setup-page' },
        { q: 'тарифы серверы купить локация', label: 'Серверы и тарифы', icon: 'public', color: '#34C759', page: 'purchase-page' },
        { q: 'продлить подписка', label: 'Продлить подписку', icon: 'autorenew', color: '#FF9500', page: 'renew-page' },
        { q: 'устройства hwid', label: 'Устройства', icon: 'devices', color: '#FF9500', action: 'devices' },
        { q: 'баланс пополнить', label: 'Баланс', icon: 'account_balance_wallet', color: '#34C759', action: 'topup' },
        { q: 'промокод', label: 'Промокод', icon: 'redeem', color: '#AF52DE', action: 'promo' },
        { q: 'платежи история', label: 'История платежей', icon: 'receipt_long', color: '#5856D6', action: 'history' },
        { q: 'реферал', label: 'Реферальная программа', icon: 'group_add', color: '#32ADE6', action: 'referral' },
        { q: 'поддержка чат', label: 'Поддержка', icon: 'headset_mic', color: '#5AC8FA', page: 'support-page' },
        { q: 'профиль', label: 'Профиль', icon: 'person', color: '#8E8E93', page: 'profile-page' },
        { q: 'пробный trial', label: 'Пробный период', icon: 'card_giftcard', color: '#AF52DE', action: 'trial' },
    ];

    const ICON_COLORS = {
        vpn: '#32ADE6', store: '#34C759', renew: '#FF9500', devices: '#FF9500',
        traffic: '#5AC8FA', balance: '#34C759', promo: '#AF52DE', history: '#5856D6',
        referral: '#32ADE6', support: '#5AC8FA', setup: '#007AFF', premium: '#AF52DE',
    };

    let lastKey = null;
    let lastCfg = null;
    let ptrStartY = 0;
    let ptrPulling = false;
    let badgeTimer = null;
    let profileRenderGen = 0;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function haptic(type) {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type || 'light'); } catch (_) { /* ignore */ }
    }

    function applyAppearance(mode) {
        const light = mode === 'light';
        document.documentElement.classList.toggle('webapp-native-light', light);
        try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (_) { /* ignore */ }
        const meta = document.getElementById('dynamic-theme-color') || document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = light ? '#F2F2F7' : '#000000';
    }

    function loadAppearance() {
        let mode = 'dark';
        try { mode = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) { /* ignore */ }
        applyAppearance(mode);
    }

    function cell(icon, color, label, value, action, opts) {
        const info = opts && opts.info;
        const tag = info ? 'div' : 'button';
        const attrs = info
            ? 'class="webapp-native-cell webapp-native-cell--info" aria-label="' + label + '"'
            : 'type="button" class="webapp-native-cell" data-native-action="' + action + '" aria-label="' + label + '"';
        return `
            <${tag} ${attrs}>
                <span class="webapp-native-cell__icon" style="background:${color}">
                    <span class="material-icons-round" aria-hidden="true">${icon}</span>
                </span>
                <span class="webapp-native-cell__body">
                    <span class="webapp-native-cell__label">${label}</span>
                    ${value ? `<span class="webapp-native-cell__value">${value}</span>` : ''}
                    ${info ? '' : '<span class="material-icons-round webapp-native-cell__chev" aria-hidden="true">chevron_right</span>'}
                </span>
            </${tag}>`;
    }

    function sectionLabel(text) {
        return `<p class="webapp-native-section-label">${text}</p>`;
    }

    function syncBadges(data) {
        const key = data?.status?.keys?.[0] || null;
        const cfg = data?.cfg;
        const active = !!(key && key.days_left > 0);
        const warnRenew = active && key && key.days_left > 0 && key.days_left < 7;
        const trial = !!cfg?.trial?.available;

        const statusBtn = document.querySelector('.webapp-native-status');
        if (statusBtn) {
            statusBtn.classList.toggle('has-badge', warnRenew || trial || !active);
        }

        const mainTab = document.querySelector('#webapp-native-tabbar [data-page-id="main-page"] .webapp-native-tabbar__icon');
        if (mainTab && !mainTab.querySelector('.webapp-native-tabbar__badge')) {
            const dot = document.createElement('span');
            dot.className = 'webapp-native-tabbar__badge';
            dot.id = 'webapp-native-main-badge';
            dot.hidden = true;
            mainTab.appendChild(dot);
        }
        const mainBadge = document.getElementById('webapp-native-main-badge');
        if (mainBadge) {
            const show = warnRenew || trial || !active;
            mainBadge.hidden = !show;
            mainBadge.textContent = warnRenew ? '!' : '';
            mainBadge.classList.toggle('is-dot', show && !warnRenew);
        }
    }

    function pruneLegacyChrome() {
        document.getElementById('webapp-cabinet-quick')?.remove();
        document.getElementById('webapp-profile-extra-actions')?.remove();
        document.getElementById('webapp-trial-banner')?.remove();
        document.getElementById('webapp-native-profile')?.remove();
    }

    async function fetchSupportBadge() {
        const userId = K().getUserId();
        if (!userId) return;
        try {
            const res = await fetch('/api/support/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
            });
            const data = await res.json();
            const badge = document.getElementById('webapp-native-chat-badge');
            if (!badge) return;
            if (data.ok && data.has_ticket && data.status === 'open') {
                const msgs = data.messages || [];
                const last = msgs[msgs.length - 1];
                const unread = !last || last.sender !== 'user';
                badge.hidden = !unread;
                badge.textContent = unread ? '1' : '';
            } else {
                badge.hidden = true;
            }
        } catch (_) { /* ignore */ }
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-native-tabbar [data-page-id]').forEach((btn) => {
            const active = btn.dataset.pageId === id;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-current', active ? 'page' : 'false');
        });
        const fab = document.getElementById('webapp-native-search-fab');
        if (fab) fab.classList.toggle('is-active', id === 'purchase-page' || id === 'renew-page');
        onPageChange(id);
    }

    function renderSubNav() {
        if (document.getElementById('webapp-native-subnav')) return;
        const nav = document.createElement('header');
        nav.id = 'webapp-native-subnav';
        nav.className = 'webapp-native-subnav';
        nav.hidden = true;
        nav.innerHTML = `
            <button type="button" class="webapp-native-subnav__back" data-native-back aria-label="Назад">
                <span class="material-icons-round">arrow_back_ios_new</span>
            </button>
            <h1 class="webapp-native-subnav__title" id="webapp-native-subnav-title">Страница</h1>
            <button type="button" class="webapp-native-subnav__action" data-native-sub-menu aria-label="Меню">
                <span class="material-icons-round">more_horiz</span>
            </button>`;
        nav.querySelector('[data-native-back]')?.addEventListener('click', () => {
            haptic('light');
            K().navigate('main-page');
            syncNav('main-page');
        });
        nav.querySelector('[data-native-sub-menu]')?.addEventListener('click', () => openActionSheet());
        document.body.appendChild(nav);
    }

    function onPageChange(pageId) {
        const id = pageId || K().pageIdFromHash();
        const subnav = document.getElementById('webapp-native-subnav');
        const title = document.getElementById('webapp-native-subnav-title');
        if (subnav) {
            const isMain = id === 'main-page';
            subnav.hidden = isMain;
            document.documentElement.classList.toggle('webapp-native-has-subnav', !isMain);
            if (title) title.textContent = PAGE_TITLES[id] || 'Кабинет';
        }
        document.querySelectorAll('[id$="-page"]').forEach((el) => {
            el.classList.toggle('webapp-native-subpage', el.id !== 'main-page' && el.id === id);
        });
        if (id === 'setup-page') window.WebAppCabinet?.reload?.().then(() => {
            const cfg = lastCfg;
            if (cfg && typeof window.WebAppCabinet?.init === 'function') {
                /* setup tabs rendered on cabinet init */
            }
        });
        if (id === 'profile-page') renderProfilePage();
        if (id === 'main-page') renderHome();
    }

    function closeActionSheet() {
        document.getElementById('webapp-native-sheet')?.remove();
        document.getElementById('webapp-native-sheet-backdrop')?.remove();
    }

    function closeSearch() {
        document.getElementById('webapp-native-search')?.remove();
        document.getElementById('webapp-native-search-backdrop')?.remove();
    }

    function openSearch() {
        closeSearch();
        haptic('light');
        const backdrop = document.createElement('div');
        backdrop.id = 'webapp-native-search-backdrop';
        backdrop.className = 'webapp-native-search-backdrop';
        const panel = document.createElement('div');
        panel.id = 'webapp-native-search';
        panel.className = 'webapp-native-search';
        panel.innerHTML = `
            <div class="webapp-native-search__bar">
                <span class="material-icons-round">search</span>
                <input type="search" id="webapp-native-search-input" placeholder="Поиск разделов" autocomplete="off" />
                <button type="button" data-search-close aria-label="Закрыть"><span class="material-icons-round">close</span></button>
            </div>
            <div class="webapp-native-search__results" id="webapp-native-search-results"></div>`;
        const renderResults = (q) => {
            const list = document.getElementById('webapp-native-search-results');
            if (!list) return;
            const query = (q || '').trim().toLowerCase();
            const items = query
                ? SEARCH_ITEMS.filter((it) => it.q.includes(query) || it.label.toLowerCase().includes(query))
                : SEARCH_ITEMS;
            list.innerHTML = items.map((it) => `
                <button type="button" class="webapp-native-search__item" data-search-page="${it.page || ''}" data-search-action="${it.action || ''}">
                    <span class="webapp-native-cell__icon" style="background:${it.color}"><span class="material-icons-round">${it.icon}</span></span>
                    <span>${it.label}</span>
                </button>`).join('') || '<p class="webapp-native-search__empty">Ничего не найдено</p>';
        };
        panel.addEventListener('click', (e) => {
            if (e.target.closest('[data-search-close]')) { closeSearch(); return; }
            const btn = e.target.closest('[data-search-page], [data-search-action]');
            if (!btn) return;
            closeSearch();
            const page = btn.dataset.searchPage;
            const action = btn.dataset.searchAction;
            if (page) { K().navigate(page); syncNav(page); }
            else if (action) handleAction(action, lastKey);
        });
        backdrop.addEventListener('click', closeSearch);
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        requestAnimationFrame(() => {
            panel.classList.add('is-open');
            const input = document.getElementById('webapp-native-search-input');
            input?.focus();
            renderResults('');
            input?.addEventListener('input', () => renderResults(input.value));
        });
    }

    function openActionSheet() {
        closeActionSheet();
        haptic('light');
        const isLight = document.documentElement.classList.contains('webapp-native-light');
        const backdrop = document.createElement('div');
        backdrop.id = 'webapp-native-sheet-backdrop';
        backdrop.className = 'webapp-native-sheet-backdrop';
        const sheet = document.createElement('div');
        sheet.id = 'webapp-native-sheet';
        sheet.className = 'webapp-native-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.innerHTML = `
            <div class="webapp-native-sheet__handle" aria-hidden="true"></div>
            <button type="button" class="webapp-native-sheet__item" data-sheet-action="appearance">
                <span class="material-icons-round">${isLight ? 'dark_mode' : 'light_mode'}</span>${isLight ? 'Тёмная тема' : 'Светлая тема'}
            </button>
            <button type="button" class="webapp-native-sheet__item" data-sheet-action="refresh">
                <span class="material-icons-round">refresh</span>Обновить
            </button>
            <button type="button" class="webapp-native-sheet__item" data-sheet-action="theme">
                <span class="material-icons-round">palette</span>Оформление кабинета
            </button>
            <button type="button" class="webapp-native-sheet__item" data-sheet-action="support">
                <span class="material-icons-round">headset_mic</span>Поддержка
            </button>
            <button type="button" class="webapp-native-sheet__item webapp-native-sheet__item--danger" data-sheet-action="logout">
                <span class="material-icons-round">logout</span>Выйти
            </button>
            <button type="button" class="webapp-native-sheet__cancel" data-sheet-action="close">Отмена</button>`;
        sheet.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-sheet-action]');
            if (!btn) return;
            const action = btn.dataset.sheetAction;
            if (action === 'close') { closeActionSheet(); return; }
            if (action === 'appearance') {
                applyAppearance(isLight ? 'dark' : 'light');
                closeActionSheet();
                return;
            }
            closeActionSheet();
            if (action === 'refresh') renderHome();
            else if (action === 'theme') document.getElementById('webapp-theme-fab')?.click();
            else if (action === 'support') { K().navigate('support-page'); syncNav('support-page'); }
            else if (action === 'logout') {
                document.getElementById('logout-btn')?.click();
                document.getElementById('logout-btn-menu')?.click();
            }
        });
        backdrop.addEventListener('click', closeActionSheet);
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        requestAnimationFrame(() => sheet.classList.add('is-open'));
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
            if (hasPhoto) { avatar.src = url; avatar.hidden = false; glyph.hidden = true; }
            else { avatar.hidden = true; glyph.hidden = false; }
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
            </button>`).join('');
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            haptic('light');
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
        });
        document.body.appendChild(nav);

        if (!document.getElementById('webapp-native-search-fab')) {
            const fab = document.createElement('button');
            fab.type = 'button';
            fab.id = 'webapp-native-search-fab';
            fab.className = 'webapp-native-search-fab';
            fab.setAttribute('aria-label', 'Поиск');
            fab.innerHTML = '<span class="material-icons-round">search</span>';
            fab.addEventListener('click', openSearch);
            document.body.appendChild(fab);
        }

        document.body.classList.add('webapp-has-native-tabbar');
        syncTabAvatar();
    }

    function setupPullRefresh() {
        const main = document.getElementById('main-page');
        if (!main || main.dataset.nativePtr === '1') return;
        main.dataset.nativePtr = '1';
        let ptr = document.getElementById('webapp-native-ptr');
        if (!ptr) {
            ptr = document.createElement('div');
            ptr.id = 'webapp-native-ptr';
            ptr.className = 'webapp-native-ptr';
            ptr.innerHTML = '<span class="material-icons-round">arrow_downward</span><span>Обновить</span>';
            main.prepend(ptr);
        }
        main.addEventListener('touchstart', (e) => {
            if (K().pageIdFromHash() !== 'main-page' || main.scrollTop > 4) return;
            ptrStartY = e.touches[0].clientY;
            ptrPulling = true;
        }, { passive: true });
        main.addEventListener('touchmove', (e) => {
            if (!ptrPulling) return;
            const dy = Math.max(0, e.touches[0].clientY - ptrStartY);
            if (dy > 8) ptr.classList.add('is-pulling');
            ptr.style.setProperty('--ptr-offset', Math.min(dy, 96) + 'px');
        }, { passive: true });
        const endPtr = () => {
            if (!ptrPulling) return;
            const offset = parseInt(ptr.style.getPropertyValue('--ptr-offset') || '0', 10);
            ptr.classList.remove('is-pulling');
            ptr.style.setProperty('--ptr-offset', '0');
            ptrPulling = false;
            if (offset >= PTR_THRESHOLD) {
                ptr.classList.add('is-refreshing');
                renderHome().finally(() => ptr.classList.remove('is-refreshing'));
            }
        };
        main.addEventListener('touchend', endPtr);
        main.addEventListener('touchcancel', endPtr);
    }

    function hookShowPage() {
        if (window.__webappNativeShowPageHooked || !window.showPage) return;
        const orig = window.showPage;
        window.showPage = function (page) {
            const prev = document.querySelector('.webapp-page-active');
            if (isActive() && prev && page && prev !== page) {
                prev.classList.add('webapp-native-leave');
                page.classList.add('webapp-native-enter');
                setTimeout(() => {
                    prev.classList.remove('webapp-native-leave');
                    page.classList.remove('webapp-native-enter');
                }, 280);
            }
            orig(page);
        };
        window.__webappNativeShowPageHooked = true;
    }

    function setupVisibilityRefresh() {
        if (window.__webappNativeVisHooked) return;
        document.addEventListener('visibilitychange', () => {
            if (!isActive() || document.hidden) return;
            renderHome();
            fetchSupportBadge();
        });
        window.__webappNativeVisHooked = true;
    }

    function syncProfileAvatar(slot) {
        if (!slot) return;
        const img = document.getElementById('webapp-profile-avatar-img');
        const url = img?.src;
        const hasPhoto = url && img && !img.classList.contains('hidden');
        if (hasPhoto) {
            slot.innerHTML = `<img src="${url}" alt="" class="webapp-native-profile__avatar-img" />`;
        } else {
            slot.innerHTML = `<span class="webapp-native-profile__avatar-fallback">${K().getUserInitial()}</span>`;
        }
    }

    async function renderProfilePage() {
        if (!isActive()) return;
        const main = document.querySelector('#profile-page main');
        if (!main) return;
        const gen = ++profileRenderGen;
        document.getElementById('webapp-native-profile')?.remove();

        const data = await K().fetchData();
        if (gen !== profileRenderGen) return;

        const balance = data.status?.balance ?? 0;
        const keys = data.status?.keys || [];
        const cfg = data.cfg;
        lastKey = keys[0] || null;
        lastCfg = cfg;
        const refCount = data.status?.referral_count ?? cfg?.referrals?.count ?? 0;
        const username = K().getUsername();

        const block = document.createElement('div');
        block.id = 'webapp-native-profile';
        block.className = 'webapp-native-profile';
        block.innerHTML = `
            <div class="webapp-native-profile__hero">
                <span class="webapp-native-profile__avatar" id="webapp-native-profile-avatar-slot"></span>
                <div class="webapp-native-profile__meta">
                    <span class="webapp-native-profile__name">${username}</span>
                    <span class="webapp-native-profile__sub">${keys.length ? keys.length + ' ключ(ей)' : 'Нет активных ключей'}</span>
                </div>
            </div>
            ${sectionLabel('Аккаунт')}
            <section class="webapp-native-group">
                ${cell('account_balance_wallet', ICON_COLORS.balance, 'Баланс', K().formatMoney(balance), 'topup')}
                ${cell('redeem', ICON_COLORS.promo, 'Промокод', '', 'promo')}
                ${cell('receipt_long', ICON_COLORS.history, 'История платежей', '', 'history')}
                ${cell('group_add', ICON_COLORS.referral, 'Реферальная программа', String(refCount), 'referral')}
            </section>
            ${keys.length ? `${sectionLabel('Ключи')}
            <section class="webapp-native-group webapp-native-profile-keys">
                ${keys.map((k) => cell('vpn_key', ICON_COLORS.vpn, k.host_name || 'VPN', k.days_left > 0 ? (k.remaining_str || k.days_left + ' дн.') : 'Неактивен', 'setup')).join('')}
            </section>` : ''}
            ${sectionLabel('Сервис')}
            <section class="webapp-native-group">
                ${cell('headset_mic', ICON_COLORS.support, 'Поддержка', '', 'support')}
                ${cell('palette', '#8E8E93', 'Оформление кабинета', '', 'theme')}
            </section>`;

        block.querySelectorAll('[data-native-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.nativeAction;
                if (action === 'theme') document.getElementById('webapp-theme-fab')?.click();
                else handleAction(action, lastKey);
            });
        });
        main.prepend(block);
        syncProfileAvatar(document.getElementById('webapp-native-profile-avatar-slot'));
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
            const ptr = document.getElementById('webapp-native-ptr');
            if (ptr) ptr.after(root);
            else main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-native-loading">Загрузка…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const cfg = data.cfg;
        lastKey = key;
        lastCfg = cfg;
        const active = !!(key && key.days_left > 0);
        const brand = K().getBrand();

        K().applyAccent('--wa-n-accent', cfg?.branding?.accent_color || '#2AABEE');
        syncBadges(data);
        fetchSupportBadge();

        const warnRenew = active && key && key.days_left > 0 && key.days_left < 7;
        const statusLabel = active ? (warnRenew ? 'Скоро истечёт' : 'Подписка активна') : 'Подписка неактивна';
        const statusSub = active
            ? `до ${K().formatExpireDate(key.expire_date_str)} · ${key.remaining_str || key.days_left + ' дн.'}`
            : 'Оформите тариф для доступа к VPN';
        const statusAction = !active ? 'purchase' : (warnRenew ? 'renew' : 'setup');

        root.innerHTML = `
            <header class="webapp-native-topbar">
                <button type="button" class="webapp-native-topbar__btn" data-native-action="menu" aria-label="Меню">
                    <span class="material-icons-round">menu</span>
                </button>
                <div class="webapp-native-topbar__title">${K().getUsername()}</div>
                <button type="button" class="webapp-native-topbar__btn" data-native-action="profile" aria-label="Профиль">Изм.</button>
            </header>
            <button type="button" class="webapp-native-status ${active ? (warnRenew ? 'is-warn' : 'is-active') : 'is-inactive'}${warnRenew || cfg?.trial?.available || !active ? ' has-badge' : ''}"
                data-native-action="${statusAction}" aria-label="Статус подписки">
                <span class="webapp-native-status__label">${statusLabel}</span>
                <span class="webapp-native-status__sub">${statusSub}</span>
                ${key?.host_name ? `<span class="webapp-native-status__sub">${key.host_name}</span>` : ''}
                <span class="material-icons-round webapp-native-status__chev" aria-hidden="true">chevron_right</span>
            </button>
            ${sectionLabel('VPN')}
            <section class="webapp-native-group" aria-label="VPN">
                ${cell('vpn_key', ICON_COLORS.vpn, 'Подключить VPN', active ? 'Активно' : 'Неактивно', 'setup')}
                ${cell('public', ICON_COLORS.store, 'Серверы и тарифы', '', 'purchase')}
                ${cell('autorenew', ICON_COLORS.renew, 'Продлить подписку', active ? K().formatExpireDate(key.expire_date_str) : '—', 'renew')}
            </section>
            ${sectionLabel('Аккаунт')}
            <section class="webapp-native-group" aria-label="Аккаунт">
                ${cell('devices', ICON_COLORS.devices, 'Устройства', key?.hwid_info || '—', 'devices')}
                ${cell('swap_vert', ICON_COLORS.traffic, 'Трафик', key?.traffic_info || '—', 'traffic', { info: true })}
                ${cell('account_balance_wallet', ICON_COLORS.balance, 'Баланс', K().formatMoney(balance), 'topup')}
            </section>
            ${sectionLabel('Дополнительно')}
            <section class="webapp-native-group" aria-label="Дополнительно">
                ${cell('redeem', ICON_COLORS.promo, 'Промокод', '', 'promo')}
                ${cell('receipt_long', ICON_COLORS.history, 'История платежей', '', 'history')}
                ${cell('group_add', ICON_COLORS.referral, 'Реферальная программа', String(data.status?.referral_count ?? cfg?.referrals?.count ?? 0), 'referral')}
                ${cell('headset_mic', ICON_COLORS.support, 'Поддержка', '', 'support')}
            </section>
            ${cfg?.trial?.available ? `${sectionLabel('Предложения')}
            <section class="webapp-native-group" aria-label="Пробный период">
                ${cell('card_giftcard', ICON_COLORS.premium, 'Пробный период', 'Доступен', 'trial')}
            </section>` : ''}
            <p class="webapp-native-footer-brand">${brand.title}</p>`;

        root.querySelectorAll('[data-native-action]').forEach((btn) => {
            btn.addEventListener('click', () => handleAction(btn.dataset.nativeAction, key));
        });
    }

    function handleAction(action, key) {
        haptic('light');
        if (action === 'menu') { openActionSheet(); return; }
        if (action === 'traffic' || action === 'profile-keys') return;
        if (action === 'setup') K().navigate('setup-page');
        else if (action === 'purchase') K().navigate('purchase-page');
        else if (action === 'renew') K().navigate('renew-page');
        else if (action === 'support') K().navigate('support-page');
        else if (action === 'profile') K().navigate('profile-page');
        else if (action === 'topup') window.WebAppCabinet?.openTopUp?.();
        else if (action === 'promo') window.openPromoModal?.();
        else if (action === 'history') window.WebAppCabinet?.openHistory?.();
        else if (action === 'referral') window.WebAppCabinet?.openReferral?.();
        else if (action === 'trial') window.WebAppCabinet?.activateTrial?.();
        else if (action === 'devices' && key && typeof openActionModal === 'function') {
            openActionModal('devices', key.key_id, key.host_name || '');
        }
        syncNav(K().pageIdFromHash());
    }

    function destroy() {
        closeActionSheet();
        closeSearch();
        if (badgeTimer) clearInterval(badgeTimer);
        document.getElementById('webapp-native-home')?.remove();
        document.getElementById('webapp-native-ptr')?.remove();
        document.getElementById('webapp-native-profile')?.remove();
        document.getElementById('webapp-native-subnav')?.remove();
        document.getElementById('webapp-native-tabbar')?.remove();
        document.getElementById('webapp-native-search-fab')?.remove();
        document.body.classList.remove('webapp-has-native-tabbar');
        document.documentElement.classList.remove('webapp-native-has-subnav', 'webapp-native-light');
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        pruneLegacyChrome();
        loadAppearance();
        hookShowPage();
        setupVisibilityRefresh();
        setupPullRefresh();
        renderSubNav();
        renderTabBar();
        renderHome();
        syncNav(K().pageIdFromHash());
        syncTabAvatar();
        fetchSupportBadge();
        badgeTimer = setInterval(fetchSupportBadge, 45000);
        if (K().pageIdFromHash() === 'profile-page') renderProfilePage();
    }

    window.WebAppNative = { init, destroy, syncNav, onPageChange, refresh: renderHome, isActive, syncTabAvatar };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
