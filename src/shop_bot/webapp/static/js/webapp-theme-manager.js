(function () {
    'use strict';

    const STORAGE_KEY = 'webapp-design-theme';
    const DESIGNS = {
        classic: { id: 'classic', label: 'Классический', desc: 'Текущий дизайн без изменений', icon: 'palette' },
        ios: { id: 'ios', label: 'Mobile', desc: 'Мобильный стиль с нижней панелью', icon: 'auto_awesome' },
        desktop: { id: 'desktop', label: 'Desktop', desc: 'Широкий макет для компьютера', icon: 'desktop_windows' },
        stealth: { id: 'stealth', label: 'Stealth', desc: 'Неоновая мини-аппа с сеткой и 3 вкладками', icon: 'shield' },
        'stealth-glass': { id: 'stealth-glass', label: 'Glass', desc: 'Стеклянная классика с верхним меню', icon: 'blur_on' },
        'glass-hub': { id: 'glass-hub', label: 'Hub', desc: 'Дашборд: подписка, баланс и рефералы', icon: 'dashboard' },
        nova: { id: 'nova', label: 'Nova', desc: 'Премиум-кабинет с нижней навигацией', icon: 'auto_awesome' },
        'pref-classic': { id: 'pref-classic', label: 'Classic Premium', desc: 'Сдержанный тёмный кабинет для мобильных', icon: 'palette' },
        'pref-macos': { id: 'pref-macos', label: 'macOS', desc: 'Apple-style: frosted glass и синий акцент', icon: 'laptop_mac' },
        'pref-macos-v2': { id: 'pref-macos-v2', label: 'macOS v2', desc: 'Компактный workspace с сегмент-навигацией', icon: 'dashboard' },
        'pref-glass-stealth': { id: 'pref-glass-stealth', label: 'Glass Stealth', desc: 'Матовое стекло без неоновых теней', icon: 'blur_on' },
    };

    const PREF_DESIGNS = ['pref-classic', 'pref-macos', 'pref-macos-v2', 'pref-glass-stealth'];

    function isPrefDesign(design) {
        return PREF_DESIGNS.includes(design);
    }

    let sheetOpen = false;

    function isMobileViewport() {
        if (window.matchMedia('(max-width: 768px)').matches) return true;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }

    function getServerConfig() {
        return window.WEBAPP_DESIGN_CONFIG || {};
    }

    function getEnabledDesigns() {
        const cfg = getServerConfig();
        if (Array.isArray(cfg.enabled) && cfg.enabled.length) {
            return cfg.enabled.filter((id) => DESIGNS[id]);
        }
        return null;
    }

    function isPickerEnabled() {
        const cfg = getServerConfig();
        return cfg.pickerEnabled !== false;
    }

    function normalizeDesign(value) {
        if (value === 'ios' || value === 'desktop' || value === 'stealth' || value === 'stealth-glass' || value === 'glass-hub' || value === 'nova') return value;
        if (isPrefDesign(value)) return value;
        return 'classic';
    }

    function allowedDesigns() {
        const enabled = getEnabledDesigns();
        let list;
        if (isMobileViewport()) {
            list = ['classic', 'ios', 'stealth', 'stealth-glass', 'glass-hub', 'nova', ...PREF_DESIGNS];
        } else {
            list = ['classic', 'ios', 'desktop', 'stealth', 'stealth-glass', 'glass-hub', 'nova', ...PREF_DESIGNS];
        }
        if (enabled) list = list.filter((id) => enabled.includes(id));
        return list.length ? list : ['classic'];
    }

    function getStoredDesign() {
        const cfg = getServerConfig();
        const fallback = normalizeDesign(cfg.default || 'classic');
        let design = normalizeDesign(localStorage.getItem(STORAGE_KEY) || fallback);
        if (!allowedDesigns().includes(design)) {
            design = allowedDesigns().includes(fallback) ? fallback : allowedDesigns()[0];
        }
        return design;
    }

    function getBrandTitle() {
        const h1 = document.querySelector('#main-page header h1, #profile-page header h1');
        return (h1 && h1.textContent.trim()) || 'Lamux VPN';
    }

    function getBrandLogoSrc() {
        const img = document.querySelector('#main-page header img, #profile-page header img');
        return img && !img.hidden ? img.src : '';
    }

    function applyDesign(design, persist) {
        const value = normalizeDesign(design);
        const allowed = allowedDesigns();
        const finalDesign = allowed.includes(value) ? value : 'classic';
        if (persist !== false) localStorage.setItem(STORAGE_KEY, finalDesign);
        if (persist !== false) {
            fetch('/api/cabinet/design-pick', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ design_id: finalDesign }),
            }).catch(function () {});
        }
        document.documentElement.dataset.webappDesign = finalDesign;
        document.body.classList.toggle('webapp-design-ios', finalDesign === 'ios');
        document.body.classList.toggle('webapp-design-desktop', finalDesign === 'desktop');
        document.body.classList.toggle('webapp-design-stealth', finalDesign === 'stealth');
        document.body.classList.toggle('webapp-design-stealth-glass', finalDesign === 'stealth-glass');
        document.body.classList.toggle('webapp-design-glass-hub', finalDesign === 'glass-hub');
        document.body.classList.toggle('webapp-design-nova', finalDesign === 'nova');
        document.body.classList.toggle('webapp-design-classic', finalDesign === 'classic');
        PREF_DESIGNS.forEach((id) => {
            document.body.classList.toggle('webapp-design-' + id, finalDesign === id);
        });
        document.body.classList.toggle('webapp-design-pref', isPrefDesign(finalDesign));
        updateMetaThemeColor(finalDesign);
        renderChrome(finalDesign);
        syncPickerState(finalDesign);
        syncNav(getCurrentPageId());
    }

    function updateMetaThemeColor(design) {
        const meta = document.getElementById('dynamic-theme-color') || document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        if (design === 'ios') meta.content = '#000000';
        else if (design === 'desktop') meta.content = '#090909';
        else if (design === 'stealth') meta.content = '#020202';
        else if (design === 'stealth-glass') meta.content = '#0b0f19';
        else if (design === 'glass-hub') meta.content = '#0b0e14';
        else if (design === 'nova') meta.content = '#0f1117';
        else if (design === 'pref-classic') meta.content = '#0d0d0f';
        else if (design === 'pref-macos') meta.content = '#000000';
        else if (design === 'pref-macos-v2') meta.content = '#121214';
        else if (design === 'pref-glass-stealth') meta.content = '#09090b';
        else meta.content = '#0a0a0a';
    }

    function getCurrentPageId() {
        const hash = (window.location.hash || '').replace('#', '');
        const map = { pro: 'profile-page', bay: 'purchase-page', rebay: 'renew-page', setup: 'setup-page', support: 'support-page' };
        return map[hash] || 'main-page';
    }

    function pageHashForId(pageId) {
        const map = {
            'main-page': '',
            'purchase-page': 'bay',
            'renew-page': 'rebay',
            'setup-page': 'setup',
            'profile-page': 'pro',
            'support-page': 'support',
        };
        return map[pageId] || '';
    }

    function isCabinetPage() {
        return !!document.getElementById('main-page');
    }

    function navigateToPage(pageId) {
        if (!isCabinetPage()) return;
        const hash = pageHashForId(pageId);
        if (hash) {
            window.location.hash = hash;
            return;
        }
        window.location.hash = '';
        const el = document.getElementById(pageId);
        if (el && typeof window.showPage === 'function') {
            window.showPage(el);
        }
    }

    function getPurchaseLabel() {
        const btn = document.getElementById('purchase-btn');
        if (!btn) return 'Купить ключ';
        const spans = btn.querySelectorAll('span:not(.material-icons-round)');
        for (const span of spans) {
            const text = span.textContent?.trim();
            if (text) return text;
        }
        return 'Купить ключ';
    }

    function unwrapDesktopHomeGrid() {
        const grid = document.getElementById('webapp-desktop-home-grid');
        if (!grid) return;
        const main = document.getElementById('main-page');
        if (!main) return;
        while (grid.firstChild) {
            main.insertBefore(grid.firstChild, grid);
        }
        grid.remove();
        document.getElementById('webapp-desktop-page-intro')?.remove();
    }

    function removeChrome() {
        document.getElementById('webapp-ios-tabbar')?.remove();
        document.getElementById('webapp-desktop-sidebar')?.remove();
        document.getElementById('webapp-desktop-quick-actions')?.remove();
        document.getElementById('webapp-stealth-bg')?.remove();
        document.getElementById('webapp-stealth-header')?.remove();
        document.getElementById('webapp-stealth-tabbar')?.remove();
        document.getElementById('webapp-stealth-glass-topnav')?.remove();
        window.WebAppGlassHub?.destroy?.();
        window.WebAppNova?.destroy?.();
        window.WebAppPref?.destroy?.();
        unwrapDesktopHomeGrid();
        document.body.classList.remove('webapp-has-tabbar', 'webapp-has-sidebar', 'webapp-has-stealth-tabbar');
    }

    function renderStealthNetworkBg() {
        if (document.getElementById('webapp-stealth-bg')) return;
        const wrap = document.createElement('div');
        wrap.id = 'webapp-stealth-bg';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.innerHTML = `
            <div id="webapp-stealth-bg__base"></div>
            <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <defs>
                    <pattern id="webapp-stealth-mesh" width="160" height="160" patternUnits="userSpaceOnUse">
                        <g stroke="#ff2357" stroke-opacity="0.18" stroke-width="0.6" fill="none">
                            <line x1="0" y1="0" x2="160" y2="80" />
                            <line x1="0" y1="0" x2="80" y2="160" />
                            <line x1="160" y1="0" x2="0" y2="80" />
                            <line x1="160" y1="0" x2="160" y2="160" />
                            <line x1="80" y1="0" x2="160" y2="80" />
                            <line x1="0" y1="160" x2="80" y2="80" />
                            <line x1="80" y1="160" x2="160" y2="80" />
                            <line x1="160" y1="160" x2="80" y2="80" />
                            <line x1="0" y1="80" x2="80" y2="80" />
                            <line x1="80" y1="0" x2="80" y2="80" />
                        </g>
                        <g fill="#ff2357" fill-opacity="0.45">
                            <circle cx="0" cy="0" r="1.2" />
                            <circle cx="80" cy="80" r="1.6" />
                            <circle cx="160" cy="0" r="1.2" />
                            <circle cx="0" cy="160" r="1.2" />
                            <circle cx="160" cy="160" r="1.2" />
                        </g>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#webapp-stealth-mesh)" />
            </svg>
            <div id="webapp-stealth-bg__blob1"></div>
            <div id="webapp-stealth-bg__blob2"></div>
            <div id="webapp-stealth-bg__blob3"></div>
        `;
        document.body.prepend(wrap);
    }

    function renderStealthHeader() {
        if (document.getElementById('webapp-stealth-header')) return;
        const brand = getBrandTitle().toUpperCase();
        const header = document.createElement('header');
        header.id = 'webapp-stealth-header';
        header.className = 'webapp-stealth-header';
        header.innerHTML = `<h1 class="webapp-stealth-header__title">${brand}</h1>`;
        document.body.appendChild(header);
    }

    function renderStealthTabBar() {
        if (document.getElementById('webapp-stealth-tabbar')) return;
        const items = [
            { id: 'main-page', label: 'ГЛАВНАЯ', icon: 'shield' },
            { id: 'support-page', label: 'ПОДДЕРЖКА', icon: 'help_outline' },
            { id: 'profile-page', label: 'ПРОФИЛЬ', icon: 'person' },
        ];
        const nav = document.createElement('nav');
        nav.id = 'webapp-stealth-tabbar';
        nav.className = 'webapp-stealth-tabbar';
        nav.setAttribute('aria-label', 'Навигация');
        nav.innerHTML = `
            <div class="webapp-stealth-tabbar__inner">
                ${items.map((item) => `
                    <button type="button" class="webapp-stealth-tabbar__btn" data-page-id="${item.id}" aria-label="${item.label}">
                        <span class="material-icons-round">${item.icon}</span>
                        <span class="webapp-stealth-tabbar__label">${item.label}</span>
                    </button>
                `).join('')}
            </div>
        `;
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigateToPage(btn.dataset.pageId);
        });
        document.body.appendChild(nav);
        document.body.classList.add('webapp-has-stealth-tabbar');
    }

    function renderStealthGlassTopNav() {
        if (document.getElementById('webapp-stealth-glass-topnav')) return;
        const items = [
            { id: 'main-page', label: 'Главная', icon: 'dashboard' },
            { id: 'purchase-page', label: 'Купить', icon: 'shopping_cart' },
            { id: 'renew-page', label: 'Продлить', icon: 'autorenew' },
            { id: 'setup-page', label: 'Установка', icon: 'download' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Поддержка', icon: 'headset_mic' },
        ];
        const brand = getBrandTitle();
        const logoSrc = getBrandLogoSrc();
        const brandIcon = logoSrc
            ? `<img src="${logoSrc}" alt="" />`
            : '<span class="material-icons-round" style="font-size:18px;opacity:.85">shield</span>';
        const nav = document.createElement('nav');
        nav.id = 'webapp-stealth-glass-topnav';
        nav.className = 'webapp-stealth-glass-topnav';
        nav.setAttribute('aria-label', 'Навигация Glass');
        nav.innerHTML = `
            <div class="webapp-stealth-glass-topnav__row">
                <div class="webapp-stealth-glass-topnav__brand">${brandIcon}<span>${brand}</span></div>
                <div class="webapp-stealth-glass-topnav__scroll">
                    <div class="webapp-stealth-glass-topnav__nav">
                        ${items.map((item) => `
                            <button type="button" class="webapp-stealth-glass-topnav__btn" data-page-id="${item.id}">
                                <span class="material-icons-round">${item.icon}</span>
                                <span>${item.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigateToPage(btn.dataset.pageId);
        });
        document.body.prepend(nav);
    }

    function renderChrome(design) {
        removeChrome();
        if (!isCabinetPage()) return;
        if (design === 'ios') renderIosTabBar();
        if (design === 'desktop') {
            renderDesktopSidebar();
            renderDesktopQuickActions();
        }
        if (design === 'stealth') {
            renderStealthNetworkBg();
            renderStealthHeader();
            renderStealthTabBar();
        }
        if (design === 'stealth-glass') renderStealthGlassTopNav();
        if (design === 'glass-hub') window.WebAppGlassHub?.init?.();
        if (design === 'nova') window.WebAppNova?.init?.();
        if (isPrefDesign(design)) window.WebAppPref?.init?.();
    }

    function renderIosTabBar() {
        if (document.getElementById('webapp-ios-tabbar')) return;
        const items = [
            { id: 'main-page', label: 'Главная', icon: 'home' },
            { id: 'purchase-page', label: 'Купить', icon: 'shopping_bag' },
            { id: 'setup-page', label: 'Установка', icon: 'download' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Чат', icon: 'forum' },
        ];
        const bar = document.createElement('nav');
        bar.id = 'webapp-ios-tabbar';
        bar.className = 'webapp-ios-tabbar';
        bar.setAttribute('aria-label', 'Навигация');
        bar.innerHTML = items.map((item) => `
            <button type="button" class="webapp-ios-tabbar__btn" data-page-id="${item.id}" aria-label="${item.label}">
                <span class="webapp-ios-tabbar__icon-wrap">
                    ${item.id === 'profile-page' ? '<img class="webapp-ios-tabbar__avatar" alt="" hidden />' : ''}
                    <span class="material-icons-round webapp-ios-tabbar__glyph">${item.icon}</span>
                </span>
                <span class="webapp-ios-tabbar__label">${item.label}</span>
            </button>
        `).join('');
        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigateToPage(btn.dataset.pageId);
        });
        document.body.appendChild(bar);
        document.body.classList.add('webapp-has-tabbar');
        syncIosTabAvatar();
    }

    function syncIosTabAvatar() {
        const btn = document.querySelector('#webapp-ios-tabbar [data-page-id="profile-page"]');
        if (!btn) return;
        const avatar = btn.querySelector('.webapp-ios-tabbar__avatar');
        const glyph = btn.querySelector('.webapp-ios-tabbar__glyph');
        const profileImg = document.getElementById('webapp-profile-avatar-img');
        const url = profileImg?.src;
        const hasPhoto = url && !profileImg.classList.contains('hidden');
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

    function renderDesktopSidebar() {
        if (document.getElementById('webapp-desktop-sidebar')) return;
        const items = [
            { id: 'main-page', label: 'Главная', icon: 'home' },
            { id: 'purchase-page', label: 'Купить ключ', icon: 'shopping_cart' },
            { id: 'renew-page', label: 'Продлить', icon: 'autorenew' },
            { id: 'setup-page', label: 'Установка', icon: 'download' },
            { id: 'profile-page', label: 'Профиль', icon: 'person' },
            { id: 'support-page', label: 'Поддержка', icon: 'headset_mic' },
        ];
        const brand = getBrandTitle();
        const logoSrc = getBrandLogoSrc();
        const brandIcon = logoSrc
            ? `<img src="${logoSrc}" alt="" />`
            : '<span class="webapp-desktop-sidebar__brand-icon"><span class="material-icons-round">shield</span></span>';
        const aside = document.createElement('aside');
        aside.id = 'webapp-desktop-sidebar';
        aside.className = 'webapp-desktop-sidebar';
        aside.innerHTML = `
            <div class="webapp-desktop-sidebar__brand">
                ${brandIcon}
                <span>${brand}</span>
            </div>
            <nav class="webapp-desktop-sidebar__nav">
                ${items.map((item) => `
                    <button type="button" class="webapp-desktop-sidebar__btn" data-page-id="${item.id}">
                        <span class="material-icons-round">${item.icon}</span>
                        <span>${item.label}</span>
                    </button>
                `).join('')}
            </nav>
            <div class="webapp-desktop-sidebar__footer">
                <button type="button" class="webapp-desktop-sidebar__footer-btn" data-desktop-action="refresh">
                    <span class="material-icons-round">refresh</span>
                    <span>Обновить</span>
                </button>
                <button type="button" class="webapp-desktop-sidebar__footer-btn webapp-desktop-sidebar__footer-btn--danger" data-desktop-action="logout">
                    <span class="material-icons-round">logout</span>
                    <span>Выйти</span>
                </button>
            </div>
        `;
        aside.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-desktop-action]');
            if (actionBtn) {
                if (actionBtn.dataset.desktopAction === 'refresh') location.reload();
                if (actionBtn.dataset.desktopAction === 'logout') {
                    document.getElementById('logout-btn')?.click();
                    document.getElementById('logout-btn-menu')?.click();
                }
                return;
            }
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigateToPage(btn.dataset.pageId);
        });
        document.body.prepend(aside);
        document.body.classList.add('webapp-has-sidebar');
    }

    function renderDesktopQuickActions() {
        const main = document.getElementById('main-page');
        if (!main || document.getElementById('webapp-desktop-quick-actions')) return;

        const purchaseLabel = getPurchaseLabel();
        const items = [
            { page: 'purchase-page', icon: 'shopping_cart', label: purchaseLabel, sub: 'Новая подписка', accent: true },
            { page: 'renew-page', icon: 'autorenew', label: 'Продлить', sub: 'Продление ключа' },
            { page: 'setup-page', icon: 'download', label: 'Установка', sub: 'Настройка клиента' },
        ];

        const wrap = document.createElement('div');
        wrap.id = 'webapp-desktop-quick-actions';
        wrap.className = 'webapp-desktop-quick-actions';
        wrap.innerHTML = items.map((item) => `
            <button type="button" class="webapp-desktop-quick-actions__btn${item.accent ? ' is-accent' : ''}" data-page-id="${item.page}">
                <span class="webapp-desktop-quick-actions__icon" aria-hidden="true">
                    <span class="material-icons-round">${item.icon}</span>
                </span>
                <span class="webapp-desktop-quick-actions__text">
                    <strong>${item.label}</strong>
                    <small>${item.sub}</small>
                </span>
                <span class="webapp-desktop-quick-actions__arrow material-icons-round" aria-hidden="true">chevron_right</span>
            </button>
        `).join('');

        wrap.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            navigateToPage(btn.dataset.pageId);
        });

        const keyBlock = document.getElementById('key-info-section-container');
        if (keyBlock) keyBlock.after(wrap);
        else main.querySelector('header')?.after(wrap);

        renderDesktopHomeGrid();
    }

    function renderDesktopHomeGrid() {
        const main = document.getElementById('main-page');
        const keyBlock = document.getElementById('key-info-section-container');
        const actions = document.getElementById('webapp-desktop-quick-actions');
        if (!main || !keyBlock || !actions || document.getElementById('webapp-desktop-home-grid')) return;

        if (!document.getElementById('webapp-desktop-page-intro')) {
            const intro = document.createElement('div');
            intro.id = 'webapp-desktop-page-intro';
            intro.className = 'webapp-desktop-page-intro';
            intro.innerHTML = `
                <h2 class="webapp-desktop-page-intro__title">Главная</h2>
                <p class="webapp-desktop-page-intro__sub">Подписка, ключи и быстрые действия</p>
            `;
            keyBlock.before(intro);
        }

        const grid = document.createElement('div');
        grid.id = 'webapp-desktop-home-grid';
        grid.className = 'webapp-desktop-home-grid';
        keyBlock.before(grid);
        grid.appendChild(keyBlock);
        grid.appendChild(actions);
    }

    function syncNav(pageId) {
        const id = pageId || getCurrentPageId();
        document.querySelectorAll(
            '#webapp-ios-tabbar [data-page-id], #webapp-desktop-sidebar [data-page-id], #webapp-stealth-tabbar [data-page-id], #webapp-stealth-glass-topnav [data-page-id], #webapp-glass-hub-topnav [data-page-id], #webapp-nova-tabbar [data-page-id], #webapp-pf-tabbar [data-page-id]'
        ).forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.pageId === id);
        });
        window.WebAppGlassHub?.syncNav?.(id);
        window.WebAppNova?.syncNav?.(id);
        window.WebAppPref?.syncNav?.(id);
    }

    function buildPickerOptions() {
        const allowed = allowedDesigns();
        return allowed.map((id) => DESIGNS[id]).filter(Boolean);
    }

    function renderPickerSheet() {
        let sheet = document.getElementById('webapp-theme-sheet');
        if (sheet) return sheet;

        sheet = document.createElement('div');
        sheet.id = 'webapp-theme-sheet';
        sheet.className = 'webapp-theme-sheet';
        sheet.hidden = true;
        sheet.innerHTML = `
            <div class="webapp-theme-sheet__backdrop" data-close-theme-sheet></div>
            <div class="webapp-theme-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="webapp-theme-sheet-title">
                <div class="webapp-theme-sheet__handle"></div>
                <h2 id="webapp-theme-sheet-title" class="webapp-theme-sheet__title">Оформление</h2>
                <p class="webapp-theme-sheet__subtitle">Выберите макет личного кабинета</p>
                <div class="webapp-theme-sheet__options" id="webapp-theme-options"></div>
                <button type="button" class="webapp-theme-sheet__close" data-close-theme-sheet>Готово</button>
            </div>
        `;
        document.body.appendChild(sheet);

        sheet.addEventListener('click', (e) => {
            if (e.target.closest('[data-close-theme-sheet]')) closeSheet();
            const opt = e.target.closest('[data-webapp-design-option]');
            if (opt) {
                applyDesign(opt.dataset.webappDesignOption, true);
            }
        });

        return sheet;
    }

    function renderFab() {
        if (!isPickerEnabled()) return;
        if (document.getElementById('webapp-theme-fab')) return;
        const fab = document.createElement('button');
        fab.type = 'button';
        fab.id = 'webapp-theme-fab';
        fab.className = 'webapp-theme-fab';
        fab.title = 'Оформление';
        fab.setAttribute('aria-label', 'Выбрать оформление');
        fab.innerHTML = '<span class="material-icons-round">palette</span>';
        fab.addEventListener('click', openSheet);
        document.body.appendChild(fab);
    }

    function refreshPickerOptions() {
        const container = document.getElementById('webapp-theme-options');
        if (!container) return;
        const current = getStoredDesign();
        container.innerHTML = buildPickerOptions().map((opt) => `
            <button type="button" class="webapp-theme-option ${opt.id === current ? 'is-active' : ''}" data-webapp-design-option="${opt.id}">
                <span class="webapp-theme-option__icon"><span class="material-icons-round">${opt.icon}</span></span>
                <span class="webapp-theme-option__text">
                    <strong>${opt.label}</strong>
                    <small>${opt.desc}</small>
                </span>
                <span class="webapp-theme-option__check material-icons-round">check_circle</span>
            </button>
        `).join('');
    }

    function syncPickerState(design) {
        document.querySelectorAll('[data-webapp-design-option]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.webappDesignOption === design);
        });
    }

    function openSheet() {
        renderPickerSheet();
        refreshPickerOptions();
        const sheet = document.getElementById('webapp-theme-sheet');
        sheet.hidden = false;
        requestAnimationFrame(() => sheet.classList.add('is-open'));
        sheetOpen = true;
    }

    function closeSheet() {
        const sheet = document.getElementById('webapp-theme-sheet');
        if (!sheet) return;
        sheet.classList.remove('is-open');
        sheetOpen = false;
        setTimeout(() => { if (!sheetOpen) sheet.hidden = true; }, 260);
    }

    function init() {
        applyDesign(getStoredDesign(), false);
        if (isPickerEnabled()) {
            renderFab();
            renderPickerSheet();
        } else {
            document.getElementById('webapp-theme-fab')?.remove();
            document.getElementById('webapp-theme-sheet')?.remove();
        }

        window.addEventListener('hashchange', () => syncNav(getCurrentPageId()));
        window.addEventListener('resize', () => {
            const design = getStoredDesign();
            if (!allowedDesigns().includes(design)) applyDesign('classic', true);
            else renderChrome(design);
            refreshPickerOptions();
        });
    }

    window.WebappTheme = {
        init,
        applyDesign,
        getDesign: getStoredDesign,
        onPageChange(pageId) {
            syncNav(pageId);
            if (pageId === 'profile-page') applyProfileAvatar();
        },
        applyProfileAvatar,
        isMobile: isMobileViewport,
    };

    async function applyProfileAvatar() {
        const wrap = document.getElementById('webapp-profile-avatar-wrap');
        const img = document.getElementById('webapp-profile-avatar-img');
        const fallback = document.getElementById('webapp-profile-avatar-fallback');
        if (!wrap || !img || !fallback) return;

        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        let url = tgUser?.photo_url || '';

        if (!url) {
            const userId = tgUser?.id || window.RENDERED_USER_ID;
            if (userId) {
                try {
                    const resp = await fetch(`/api/user/avatar?user_id=${userId}`);
                    const data = await resp.json();
                    if (data.ok && data.url) url = data.url;
                } catch (_) { /* ignore */ }
            }
        }

        if (!url) {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
            wrap.classList.remove('has-photo');
            syncIosTabAvatar();
            return;
        }

        img.onload = () => {
            img.classList.remove('hidden');
            fallback.classList.add('hidden');
            wrap.classList.add('has-photo');
            syncIosTabAvatar();
        };
        img.onerror = () => {
            img.classList.add('hidden');
            fallback.classList.remove('hidden');
            wrap.classList.remove('has-photo');
            syncIosTabAvatar();
        };
        img.src = url;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (isCabinetPage()) {
        setTimeout(applyProfileAvatar, 100);
    }
})();
