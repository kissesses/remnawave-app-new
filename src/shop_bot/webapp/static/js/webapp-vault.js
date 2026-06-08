(function () {
    'use strict';

    const DESIGN = 'vault';
    const K = () => window.WebAppThemeKit;

    function isActive() {
        return document.documentElement.dataset.webappDesign === DESIGN;
    }

    function accountTier(key, balance) {
        if (key && key.days_left > 90) return { label: 'Platinum', icon: 'diamond' };
        if (key && key.days_left > 0) return { label: 'Premium', icon: 'workspace_premium' };
        if (balance > 500) return { label: 'Gold', icon: 'military_tech' };
        return { label: 'Standard', icon: 'shield' };
    }

    function parseHwidSlots(hwidInfo) {
        if (!hwidInfo) return { used: 0, limit: 0, ok: true };
        const m = String(hwidInfo).match(/(\d+)\s*[/\\]\s*(\d+)/);
        if (!m) return { used: 0, limit: 0, ok: true };
        const used = parseInt(m[1], 10);
        const limit = parseInt(m[2], 10);
        return { used, limit, ok: limit === 0 || used < limit };
    }

    function isTrafficOk(trafficInfo) {
        if (!trafficInfo) return true;
        const t = String(trafficInfo).toLowerCase();
        if (t.includes('∞') || t.includes('безлим')) return true;
        if (t.includes('превыш') || t.includes('исчерп') || t.includes('законч')) return false;
        const m = t.match(/(\d+[\d.,]*)\s*[/\\]\s*(\d+[\d.,]*)/);
        if (!m) return true;
        const used = parseFloat(m[1].replace(',', '.'));
        const limit = parseFloat(m[2].replace(',', '.'));
        return !limit || used < limit;
    }

    function computeSecurityScore(key, balance, cfg) {
        let score = 0;
        if (key && key.days_left > 0) score += 40;
        if (isTrafficOk(key?.traffic_info)) score += 20;
        if (parseHwidSlots(key?.hwid_info).ok) score += 20;
        if (balance > 0) score += 10;
        if (cfg?.trial?.available) score += 10;
        return Math.min(100, score);
    }

    function hasNotifications(key, cfg) {
        return !!(cfg?.trial?.available || (key && key.days_left > 0 && key.days_left < 7));
    }

    function closeDrawer() {
        document.documentElement.classList.remove('webapp-vault-drawer-open');
        document.getElementById('webapp-vault-sidebar')?.setAttribute('aria-hidden', 'true');
    }

    function openDrawer() {
        document.documentElement.classList.add('webapp-vault-drawer-open');
        document.getElementById('webapp-vault-sidebar')?.setAttribute('aria-hidden', 'false');
        document.getElementById('webapp-vault-sidebar')?.querySelector('.webapp-vault-sidebar__btn')?.focus();
    }

    function syncNav(pageId) {
        const id = pageId || K().pageIdFromHash();
        document.querySelectorAll('#webapp-vault-sidebar [data-page-id]').forEach((btn) => {
            const active = btn.dataset.pageId === id;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-current', active ? 'page' : 'false');
        });
    }

    function renderSidebar() {
        if (document.getElementById('webapp-vault-sidebar')) return;
        const brand = K().getBrand();
        const logo = brand.logo
            ? `<img src="${brand.logo}" alt="" />`
            : '<span class="material-icons-round" style="font-size:20px;color:var(--wa-vault-cyan)">shield</span>';
        const items = [
            { id: 'main-page', label: 'Dashboard', icon: 'dashboard' },
            { id: 'setup-page', label: 'VPN Connections', icon: 'vpn_key' },
            { id: 'purchase-page', label: 'Server Locations', icon: 'public' },
            { id: 'renew-page', label: 'Subscription', icon: 'card_membership' },
            { id: 'profile-page', label: 'Profile & Billing', icon: 'person' },
            { id: 'support-page', label: 'Support', icon: 'headset_mic' },
        ];
        const aside = document.createElement('aside');
        aside.id = 'webapp-vault-sidebar';
        aside.className = 'webapp-vault-sidebar';
        aside.setAttribute('aria-label', 'Основная навигация');
        aside.setAttribute('aria-hidden', 'true');
        aside.innerHTML = `
            <div class="webapp-vault-sidebar__brand">${logo}<span>${brand.title}</span></div>
            <nav class="webapp-vault-sidebar__nav">
                ${items.map((item) => `
                    <button type="button" class="webapp-vault-sidebar__btn" data-page-id="${item.id}" aria-label="${item.label}">
                        <span class="material-icons-round" aria-hidden="true">${item.icon}</span>
                        <span>${item.label}</span>
                    </button>
                `).join('')}
            </nav>
            <div class="webapp-vault-sidebar__footer">
                <button type="button" data-vault-action="refresh" aria-label="Обновить">
                    <span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px">refresh</span>Обновить
                </button>
                <button type="button" data-vault-action="logout" aria-label="Выйти">
                    <span class="material-icons-round" style="font-size:16px;vertical-align:middle;margin-right:4px">logout</span>Выйти
                </button>
            </div>`;
        aside.addEventListener('click', (e) => {
            const action = e.target.closest('[data-vault-action]');
            if (action) {
                if (action.dataset.vaultAction === 'refresh') location.reload();
                if (action.dataset.vaultAction === 'logout') {
                    document.getElementById('logout-btn')?.click();
                    document.getElementById('logout-btn-menu')?.click();
                }
                return;
            }
            const btn = e.target.closest('[data-page-id]');
            if (!btn) return;
            K().navigate(btn.dataset.pageId);
            syncNav(btn.dataset.pageId);
            closeDrawer();
        });
        document.body.prepend(aside);

        let backdrop = document.getElementById('webapp-vault-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'webapp-vault-backdrop';
            backdrop.className = 'webapp-vault-backdrop';
            backdrop.addEventListener('click', closeDrawer);
            document.body.appendChild(backdrop);
        }
    }

    function syncHeaderAvatar() {
        const btn = document.getElementById('webapp-vault-avatar');
        if (!btn) return;
        const img = document.getElementById('webapp-profile-avatar-img');
        const url = img?.src;
        const hasPhoto = url && !img.classList.contains('hidden');
        if (hasPhoto) {
            btn.style.backgroundImage = `url(${url})`;
            btn.style.backgroundSize = 'cover';
            btn.textContent = '';
        } else {
            btn.style.backgroundImage = '';
            btn.textContent = K().getUserInitial();
        }
    }

    function renderHeader() {
        if (document.getElementById('webapp-vault-header')) return;
        const header = document.createElement('header');
        header.id = 'webapp-vault-header';
        header.className = 'webapp-vault-header';
        header.innerHTML = `
            <div class="webapp-vault-header__left">
                <button type="button" class="webapp-vault-header__menu" id="webapp-vault-menu-btn" aria-label="Открыть меню" aria-expanded="false">
                    <span class="material-icons-round">menu</span>
                </button>
                <div class="webapp-vault-header__greet">
                    <small>Security Dashboard</small>
                    <strong id="webapp-vault-header-name">${K().getUsername()}</strong>
                </div>
            </div>
            <div class="webapp-vault-header__right">
                <div class="webapp-vault-score" id="webapp-vault-score" aria-label="Security score">
                    <div class="webapp-vault-score__ring" style="--score:0"><span>0</span></div>
                    <span>Security</span>
                </div>
                <button type="button" class="webapp-vault-badge" id="webapp-vault-notify" aria-label="Уведомления" hidden>
                    <span class="material-icons-round">notifications</span>
                    <span class="webapp-vault-badge__dot" aria-hidden="true"></span>
                </button>
                <button type="button" class="webapp-vault-avatar" id="webapp-vault-avatar" aria-label="Меню аккаунта" aria-haspopup="true"></button>
            </div>`;
        document.body.appendChild(header);

        document.getElementById('webapp-vault-menu-btn')?.addEventListener('click', () => {
            const open = document.documentElement.classList.contains('webapp-vault-drawer-open');
            if (open) closeDrawer();
            else openDrawer();
            document.getElementById('webapp-vault-menu-btn')?.setAttribute('aria-expanded', open ? 'false' : 'true');
        });

        document.getElementById('webapp-vault-avatar')?.addEventListener('click', () => {
            const menu = document.getElementById('webapp-vault-user-menu');
            if (menu) {
                menu.remove();
                return;
            }
            const avatar = document.getElementById('webapp-vault-avatar');
            const rect = avatar.getBoundingClientRect();
            const el = document.createElement('div');
            el.id = 'webapp-vault-user-menu';
            el.setAttribute('role', 'menu');
            el.style.cssText = `position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;z-index:99999;min-width:180px;padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:#141a24;box-shadow:0 8px 32px rgba(0,0,0,0.4)`;
            el.innerHTML = `
                <button type="button" role="menuitem" data-vault-menu="profile" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;color:#f1f5f9;font-size:0.8125rem;cursor:pointer;border-radius:8px">
                    <span class="material-icons-round" style="font-size:18px">person</span>Профиль
                </button>
                <button type="button" role="menuitem" data-vault-menu="theme" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;color:#f1f5f9;font-size:0.8125rem;cursor:pointer;border-radius:8px">
                    <span class="material-icons-round" style="font-size:18px">palette</span>Оформление
                </button>
                <button type="button" role="menuitem" data-vault-menu="refresh" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;color:#f1f5f9;font-size:0.8125rem;cursor:pointer;border-radius:8px">
                    <span class="material-icons-round" style="font-size:18px">refresh</span>Обновить
                </button>
                <button type="button" role="menuitem" data-vault-menu="logout" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;color:#fca5a5;font-size:0.8125rem;cursor:pointer;border-radius:8px">
                    <span class="material-icons-round" style="font-size:18px">logout</span>Выйти
                </button>`;
            el.addEventListener('click', (ev) => {
                const item = ev.target.closest('[data-vault-menu]');
                if (!item) return;
                const action = item.dataset.vaultMenu;
                el.remove();
                if (action === 'profile') K().navigate('profile-page');
                else if (action === 'theme') document.getElementById('webapp-theme-fab')?.click();
                else if (action === 'refresh') location.reload();
                else if (action === 'logout') {
                    document.getElementById('logout-btn')?.click();
                    document.getElementById('logout-btn-menu')?.click();
                }
            });
            document.body.appendChild(el);
            const closeMenu = (ev) => {
                if (!el.contains(ev.target) && ev.target !== avatar) {
                    el.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        });

        document.getElementById('webapp-vault-notify')?.addEventListener('click', () => {
            K().navigate('renew-page');
        });

        syncHeaderAvatar();
    }

    async function loadDevicesPreview(keyId, hostName) {
        const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.RENDERED_USER_ID;
        const res = await fetch('/api/key/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, key_id: keyId, host_name: hostName }),
        });
        const data = await res.json();
        if (!data.ok || !data.devices?.length) {
            return '<p style="color:var(--wa-vault-muted);font-size:0.8125rem;margin:0">Нет активных устройств</p>';
        }
        return data.devices.slice(0, 3).map((d) => {
            const name = typeof d === 'string' ? d : (d.userAgent || d.hwid || 'Device');
            const id = typeof d === 'string' ? d : d.hwid;
            return `<div class="webapp-vault-device"><span>${name}</span><span style="opacity:0.6">${id}</span></div>`;
        }).join('');
    }

    async function renderHome() {
        if (!isActive() || window.STUDIO_PREVIEW) return;
        const main = document.getElementById('main-page');
        if (!main) return;

        let root = document.getElementById('webapp-vault-home');
        if (!root) {
            root = document.createElement('div');
            root.id = 'webapp-vault-home';
            root.className = 'webapp-vault-home';
            main.prepend(root);
        }
        root.innerHTML = '<div class="webapp-vault-loading">Загрузка…</div>';

        const data = await K().fetchData();
        const key = data.status?.keys?.[0] || null;
        const balance = data.status?.balance ?? 0;
        const cfg = data.cfg;
        const active = !!(key && key.days_left > 0);
        const tier = accountTier(key, balance);
        const score = computeSecurityScore(key, balance, cfg);
        const hwid = parseHwidSlots(key?.hwid_info);
        const refCount = data.status?.referral_count ?? cfg?.referrals?.count ?? 0;
        const traffic = key?.traffic_info || '—';
        const brand = K().getBrand();

        const scoreEl = document.getElementById('webapp-vault-score');
        if (scoreEl) {
            const ring = scoreEl.querySelector('.webapp-vault-score__ring');
            if (ring) {
                ring.style.setProperty('--score', score);
                ring.querySelector('span').textContent = score;
            }
            scoreEl.setAttribute('aria-label', `Security score: ${score} из 100`);
        }

        const notifyBtn = document.getElementById('webapp-vault-notify');
        if (notifyBtn) notifyBtn.hidden = !hasNotifications(key, cfg);

        const nameEl = document.getElementById('webapp-vault-header-name');
        if (nameEl) nameEl.textContent = K().getUsername();

        K().applyAccent('--wa-vault-accent', cfg?.branding?.accent_color || '#3b82f6');

        const deviceCount = hwid.used || (key?.hwid_info ? String(key.hwid_info).split('/')[0]?.trim() : '0');
        const remaining = key?.remaining_str || (key?.days_left ? K().daysLabel(key.days_left) : '—');

        root.innerHTML = `
            <section class="webapp-vault-hero" aria-labelledby="vault-hero-title">
                <div class="webapp-vault-hero__top">
                    <div>
                        <div class="webapp-vault-status ${active ? 'is-protected' : 'is-inactive'}" role="status">
                            <span class="webapp-vault-status__dot" aria-hidden="true"></span>
                            ${active ? 'Protected' : 'Inactive'}
                        </div>
                        <h1 class="webapp-vault-hero__title" id="vault-hero-title">${active ? 'Подписка активна' : 'Подписка неактивна'}</h1>
                        <p class="webapp-vault-hero__sub">${tier.label} · ${brand.title}</p>
                    </div>
                </div>
                <div class="webapp-vault-hero__meta">
                    <div><small>Сервер</small><strong>${key?.host_name || '—'}</strong></div>
                    <div><small>Действует до</small><strong>${key ? K().formatExpireDate(key.expire_date_str) : '—'}</strong></div>
                    <div><small>Осталось</small><strong>${remaining}</strong></div>
                </div>
                <div class="webapp-vault-hero__actions">
                    <button type="button" class="webapp-vault-btn webapp-vault-btn--primary" data-vault-action="connect">
                        <span class="material-icons-round" aria-hidden="true">vpn_key</span>Подключить VPN
                    </button>
                    <button type="button" class="webapp-vault-btn webapp-vault-btn--ghost" data-vault-action="${active ? 'renew' : 'purchase'}">
                        ${active ? 'Продлить' : 'Купить'}
                    </button>
                </div>
            </section>

            <section class="webapp-vault-section" aria-labelledby="vault-security-title">
                <h2 class="webapp-vault-section__title" id="vault-security-title">Security Overview</h2>
                <div class="webapp-vault-grid webapp-vault-grid--4">
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">shield</span></div>
                        <span class="webapp-vault-card__label">Protection</span>
                        <span class="webapp-vault-card__value">${active ? 'Active' : 'Expired'}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">card_membership</span></div>
                        <span class="webapp-vault-card__label">Subscription</span>
                        <span class="webapp-vault-card__value">${key ? K().formatExpireDate(key.expire_date_str) : '—'}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">devices</span></div>
                        <span class="webapp-vault-card__label">Device slots</span>
                        <span class="webapp-vault-card__value">${key?.hwid_info || '—'}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">swap_vert</span></div>
                        <span class="webapp-vault-card__label">Traffic</span>
                        <span class="webapp-vault-card__value">${traffic}</span>
                    </article>
                </div>
            </section>

            <section class="webapp-vault-section" aria-labelledby="vault-analytics-title">
                <h2 class="webapp-vault-section__title" id="vault-analytics-title">Connection Analytics</h2>
                <div class="webapp-vault-grid webapp-vault-grid--4">
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">data_usage</span></div>
                        <span class="webapp-vault-card__label">Data usage</span>
                        <span class="webapp-vault-card__value" style="font-family:ui-monospace,monospace;font-size:0.9375rem">${traffic}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">phonelink</span></div>
                        <span class="webapp-vault-card__label">Active devices</span>
                        <span class="webapp-vault-card__value">${deviceCount}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">schedule</span></div>
                        <span class="webapp-vault-card__label">Days remaining</span>
                        <span class="webapp-vault-card__value">${active ? key.days_left : '—'}</span>
                    </article>
                    <article class="webapp-vault-card">
                        <div class="webapp-vault-card__icon"><span class="material-icons-round">group</span></div>
                        <span class="webapp-vault-card__label">Referrals</span>
                        <span class="webapp-vault-card__value">${refCount}</span>
                    </article>
                </div>
            </section>

            <section class="webapp-vault-section" aria-labelledby="vault-servers-title">
                <h2 class="webapp-vault-section__title" id="vault-servers-title">Server Management</h2>
                <article class="webapp-vault-card">
                    <div class="webapp-vault-row">
                        <div>
                            <span class="webapp-vault-card__label">Current server</span>
                            <span class="webapp-vault-card__value" style="display:block;margin-top:4px">${key?.host_name || 'Не выбран'}</span>
                        </div>
                        <button type="button" class="webapp-vault-btn webapp-vault-btn--ghost" data-vault-action="purchase">Сменить локацию</button>
                    </div>
                    <div class="webapp-vault-row">
                        <div>
                            <span class="webapp-vault-card__label">Subscription</span>
                            <span class="webapp-vault-card__sub">${active ? `Активна · ${remaining}` : 'Требуется продление'}</span>
                        </div>
                        <button type="button" class="webapp-vault-btn webapp-vault-btn--primary" data-vault-action="renew">Продлить</button>
                    </div>
                </article>
            </section>

            <section class="webapp-vault-section" aria-labelledby="vault-devices-title">
                <h2 class="webapp-vault-section__title" id="vault-devices-title">Device Management</h2>
                <article class="webapp-vault-card">
                    <div class="webapp-vault-row" style="padding-top:0">
                        <div>
                            <span class="webapp-vault-card__label">Подключённые устройства</span>
                            <span class="webapp-vault-card__sub">${key?.hwid_info || '—'}</span>
                        </div>
                        <button type="button" class="webapp-vault-btn webapp-vault-btn--ghost" data-vault-action="devices-manage" ${key ? '' : 'disabled'}>Управление</button>
                    </div>
                    <div class="webapp-vault-devices" id="webapp-vault-devices-preview">
                        <div class="webapp-vault-loading" style="padding:1rem">Загрузка устройств…</div>
                    </div>
                </article>
            </section>

            <section class="webapp-vault-section">
                <div class="webapp-vault-grid webapp-vault-grid--2">
                    <article class="webapp-vault-card">
                        <h2 class="webapp-vault-section__title">Subscription</h2>
                        <span class="webapp-vault-card__value">${key?.host_name || 'Нет плана'}</span>
                        <span class="webapp-vault-card__sub">До ${key ? K().formatExpireDate(key.expire_date_str) : '—'}</span>
                        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                            <button type="button" class="webapp-vault-btn webapp-vault-btn--primary" data-vault-action="topup">Пополнить</button>
                            <button type="button" class="webapp-vault-btn webapp-vault-btn--ghost" data-vault-action="history">Платежи</button>
                        </div>
                    </article>
                    <article class="webapp-vault-card">
                        <h2 class="webapp-vault-section__title">Support</h2>
                        <div class="webapp-vault-support">
                            ${cfg?.howto?.enabled !== false ? `
                            <button type="button" class="webapp-vault-support__link" data-vault-action="howto">
                                <span class="material-icons-round">help_outline</span>Справка и инструкции
                            </button>` : ''}
                            <button type="button" class="webapp-vault-support__link" data-vault-action="support">
                                <span class="material-icons-round">forum</span>Live Chat
                            </button>
                            <button type="button" class="webapp-vault-support__link" data-vault-action="connect">
                                <span class="material-icons-round">download</span>Guides — установка VPN
                            </button>
                        </div>
                    </article>
                </div>
            </section>`;

        root.querySelectorAll('[data-vault-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const a = btn.dataset.vaultAction;
                if (a === 'connect' || a === 'howto') K().navigate('setup-page');
                else if (a === 'purchase') K().navigate('purchase-page');
                else if (a === 'renew') K().navigate('renew-page');
                else if (a === 'support') K().navigate('support-page');
                else if (a === 'topup') window.WebAppCabinet?.openTopUp?.();
                else if (a === 'history') window.WebAppCabinet?.openPaymentHistory?.();
                else if (a === 'devices-manage' && key && typeof openActionModal === 'function') {
                    openActionModal('devices', key.key_id, key.host_name || '');
                }
            });
        });

        const preview = document.getElementById('webapp-vault-devices-preview');
        if (preview && key) {
            try {
                preview.innerHTML = await loadDevicesPreview(key.key_id, key.host_name || '');
            } catch (_) {
                preview.innerHTML = '<p style="color:var(--wa-vault-muted);font-size:0.8125rem;margin:0">Не удалось загрузить устройства</p>';
            }
        } else if (preview) {
            preview.innerHTML = '<p style="color:var(--wa-vault-muted);font-size:0.8125rem;margin:0">Нет активного ключа</p>';
        }
    }

    function destroy() {
        document.removeEventListener('keydown', onKeydown);
        document.getElementById('webapp-vault-home')?.remove();
        document.getElementById('webapp-vault-sidebar')?.remove();
        document.getElementById('webapp-vault-header')?.remove();
        document.getElementById('webapp-vault-backdrop')?.remove();
        document.getElementById('webapp-vault-user-menu')?.remove();
        document.documentElement.classList.remove('webapp-vault-drawer-open');
    }

    function onKeydown(ev) {
        if (ev.key === 'Escape') {
            closeDrawer();
            document.getElementById('webapp-vault-user-menu')?.remove();
        }
    }

    function init() {
        if (!isActive() || !document.getElementById('main-page')) return;
        renderSidebar();
        renderHeader();
        renderHome();
        syncNav(K().pageIdFromHash());
        syncHeaderAvatar();
        document.addEventListener('keydown', onKeydown);
    }

    window.WebAppVault = { init, destroy, syncNav, refresh: renderHome, isActive, syncHeaderAvatar };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (isActive()) init(); });
    } else if (isActive()) init();
})();
