(function () {
    'use strict';

    let cabinetConfig = null;

    function getUserId() {
        if (typeof window.getWebappUserId === 'function') return window.getWebappUserId();
        const rendered = Number(window.RENDERED_USER_ID) || 0;
        if (rendered) return rendered;
        return Number(window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0;
    }

    function notify(msg, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
            return;
        }
        window.Telegram?.WebApp?.showAlert?.(msg);
    }

    async function loadCabinetConfig() {
        if (cabinetConfig) return cabinetConfig;
        if (typeof window.__webappFetchCabinetConfig === 'function') {
            cabinetConfig = await window.__webappFetchCabinetConfig();
            return cabinetConfig;
        }
        const userId = getUserId();
        if (!userId) return null;
        try {
            const resp = await fetch('/api/cabinet/config?user_id=' + userId);
            const data = await resp.json();
            if (data.ok) {
                cabinetConfig = data;
                return data;
            }
        } catch (e) {
            console.error('cabinet config error', e);
        }
        return null;
    }

    function renderTrialBanner(cfg) {
        const container = document.getElementById('key-info-section-container');
        if (!container || !cfg?.modules?.trial || !cfg?.trial?.available) return;
        if (document.getElementById('webapp-trial-banner')) return;

        const days = cfg.trial.duration_days || 3;
        const banner = document.createElement('div');
        banner.id = 'webapp-trial-banner';
        banner.className = 'webapp-cabinet-banner';
        banner.innerHTML = `
            <div class="webapp-cabinet-banner__icon"><span class="material-icons-round">card_giftcard</span></div>
            <div class="webapp-cabinet-banner__text">
                <div class="webapp-cabinet-banner__title">Бесплатный пробный период</div>
                <div class="webapp-cabinet-banner__sub">${days} дн. — протестируйте сервис бесплатно</div>
            </div>
            <button type="button" id="webapp-trial-btn" class="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">Получить</button>
        `;
        container.prepend(banner);
        banner.querySelector('#webapp-trial-btn')?.addEventListener('click', activateTrial);
    }

    function renderQuickActions() {
        const main = document.getElementById('main-page');
        const anchor = document.getElementById('key-info-section-container');
        if (!main || !anchor || document.getElementById('webapp-cabinet-quick')) return;

        const wrap = document.createElement('div');
        wrap.id = 'webapp-cabinet-quick';
        wrap.className = 'webapp-cabinet-quick';
        wrap.innerHTML = `
            <button type="button" class="webapp-cabinet-quick__btn" data-action="topup"><span class="material-icons-round">account_balance_wallet</span><span>Баланс</span></button>
            <button type="button" class="webapp-cabinet-quick__btn" data-action="promo"><span class="material-icons-round">redeem</span><span>Промо</span></button>
            <button type="button" class="webapp-cabinet-quick__btn" data-action="history"><span class="material-icons-round">receipt_long</span><span>Платежи</span></button>
            <button type="button" class="webapp-cabinet-quick__btn" data-action="qr"><span class="material-icons-round">qr_code_2</span><span>QR</span></button>
        `;
        anchor.after(wrap);
        wrap.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'topup') openTopUpFlow();
            else if (action === 'promo') window.openPromoModal?.();
            else if (action === 'history') openPaymentHistory();
            else if (action === 'qr') openQrForActiveKey();
        });
    }

    function renderProfileActions() {
        const footer = document.querySelector('#profile-page footer');
        if (!footer || document.getElementById('webapp-profile-extra-actions')) return;

        const block = document.createElement('div');
        block.id = 'webapp-profile-extra-actions';
        block.className = 'flex flex-col gap-3 w-full';
        block.innerHTML = `
            <button type="button" id="webapp-topup-btn" class="w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl font-medium text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <span class="material-icons-round text-sm">account_balance_wallet</span>
                <span>Пополнить баланс</span>
            </button>
            <button type="button" id="webapp-history-btn" class="w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl font-medium text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <span class="material-icons-round text-sm">receipt_long</span>
                <span>История платежей</span>
            </button>
            <button type="button" id="webapp-referral-btn" class="w-full bg-white/5 border border-white/10 text-white py-3 rounded-xl font-medium text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <span class="material-icons-round text-sm">group_add</span>
                <span>Реферальная программа</span>
            </button>
        `;
        footer.prepend(block);
        block.querySelector('#webapp-topup-btn')?.addEventListener('click', openTopUpFlow);
        block.querySelector('#webapp-history-btn')?.addEventListener('click', openPaymentHistory);
        block.querySelector('#webapp-referral-btn')?.addEventListener('click', openReferralModal);
    }

    function renderSetupOsTabs(cfg) {
        const main = document.querySelector('#setup-page main');
        if (!main || document.getElementById('webapp-setup-os-block')) return;

        const howto = cfg?.howto || {};
        const tabs = [
            { id: 'android', label: 'Android', text: howto.android },
            { id: 'ios', label: 'iOS', text: howto.ios },
            { id: 'windows', label: 'Windows', text: howto.windows },
            { id: 'linux', label: 'Linux', text: howto.linux },
        ].filter((t) => t.text);

        if (!tabs.length) return;

        const block = document.createElement('div');
        block.id = 'webapp-setup-os-block';
        block.className = 'px-1';
        block.innerHTML = `
            <div class="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-2">Инструкция по ОС</div>
            <div class="webapp-setup-os-tabs" role="tablist">
                ${tabs.map((t, i) => `<button type="button" class="webapp-setup-os-tab${i === 0 ? ' is-active' : ''}" data-os="${t.id}">${t.label}</button>`).join('')}
            </div>
            <div id="webapp-setup-os-content" class="webapp-setup-os-content">${tabs[0].text.replace(/</g, '&lt;')}</div>
        `;
        const keysBlock = main.querySelector('.flex.flex-col.gap-3');
        if (keysBlock) keysBlock.before(block);
        else main.appendChild(block);

        const contentEl = block.querySelector('#webapp-setup-os-content');
        block.querySelector('.webapp-setup-os-tabs')?.addEventListener('click', (e) => {
            const tab = e.target.closest('[data-os]');
            if (!tab) return;
            block.querySelectorAll('.webapp-setup-os-tab').forEach((el) => el.classList.remove('is-active'));
            tab.classList.add('is-active');
            const found = tabs.find((t) => t.id === tab.dataset.os);
            if (found && contentEl) contentEl.textContent = found.text;
        });
    }

    async function activateTrial() {
        const cfg = cabinetConfig || await loadCabinetConfig();
        if (!cfg?.trial?.available) {
            notify('Пробный период недоступен', 'error');
            return;
        }

        let hostName = null;
        const hosts = cfg.trial.hosts || [];
        if (hosts.length === 1) hostName = hosts[0].host_name;
        else if (hosts.length > 1) {
            hostName = await pickTrialHost(hosts);
            if (!hostName) return;
        }

        const btn = document.getElementById('webapp-trial-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '...';
        }

        try {
            const resp = await fetch('/api/trial/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: getUserId(), host_name: hostName }),
            });
            const data = await resp.json();
            if (data.needs_host && data.hosts?.length) {
                hostName = await pickTrialHost(data.hosts);
                if (!hostName) return;
                const retry = await fetch('/api/trial/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: getUserId(), host_name: hostName }),
                });
                const retryData = await retry.json();
                if (!retryData.ok) {
                    notify(retryData.error || 'Ошибка активации', 'error');
                    return;
                }
                Object.assign(data, retryData);
            }
            if (data.ok) {
                notify(data.message || 'Пробный ключ активирован', 'success');
                document.getElementById('webapp-trial-banner')?.remove();
                if (typeof window.refreshAppData === 'function') await window.refreshAppData();
                else location.reload();
                window.WebAppGlassHub?.refresh?.();
            } else {
                notify(data.error || 'Ошибка активации', 'error');
            }
        } catch (e) {
            notify('Ошибка соединения', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Получить';
            }
        }
    }

    function openGenericModal(title, html, icon) {
        const modal = document.getElementById('action-modal');
        const backdrop = document.getElementById('action-backdrop');
        const card = document.getElementById('action-card');
        const titleEl = document.getElementById('action-modal-title');
        const contentEl = document.getElementById('action-modal-content');
        if (!modal || !titleEl || !contentEl) return;
        titleEl.innerHTML = `<span class="material-icons-round text-primary text-sm mr-1">${icon || 'info'}</span> ${title}`;
        contentEl.innerHTML = html;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        requestAnimationFrame(() => {
            backdrop?.classList.remove('opacity-0', 'pointer-events-none');
            card?.classList.remove('translate-y-full');
        });
    }

    window.closeGenericModal = function () {
        if (typeof window.closeActionModal === 'function') window.closeActionModal();
    };

    function pickTrialHost(hosts) {
        return new Promise((resolve) => {
            const html = `
                <div class="flex flex-col gap-2">
                    ${hosts.map((h) => `
                        <button type="button" class="trial-host-pick w-full p-3 rounded-xl border border-white/10 bg-white/5 text-left text-xs font-bold hover:border-primary/30" data-host="${h.host_name}">
                            ${h.label || h.host_name}
                        </button>
                    `).join('')}
                </div>`;
            openGenericModal('Выберите сервер', html, 'public');
            document.querySelectorAll('.trial-host-pick').forEach((btn) => {
                btn.addEventListener('click', () => {
                    window.closeGenericModal();
                    resolve(btn.dataset.host);
                });
            });
        });
    }

    function openTopUpFlow() {
        const cfg = cabinetConfig;
        const min = cfg?.topup?.min || 10;
        const max = cfg?.topup?.max || 100000;
        const amountStr = prompt(`Сумма пополнения (RUB)\nМинимум: ${min}, максимум: ${max}`, '500');
        if (amountStr == null) return;
        const amount = parseFloat(String(amountStr).replace(',', '.'));
        if (!amount || amount < min || amount > max) {
            notify(`Введите сумму от ${min} до ${max} RUB`, 'error');
            return;
        }
        window.currentPaymentData = {
            action: 'top_up',
            price: amount,
            amount: amount,
            planId: null,
        };
        window.selectedMethod = null;
        window.methodsCache = null;
        if (typeof window.openPaymentModal === 'function') {
            window.openPaymentModal(null, null, 'top_up', null, amount, 'Пополнение баланса');
        } else if (typeof window.openMethodsList === 'function') {
            window.openMethodsList();
        }
    }

    async function openPaymentHistory() {
        try {
            const resp = await fetch('/api/payments/history?user_id=' + getUserId());
            const data = await resp.json();
            if (!data.ok) {
                notify(data.error || 'Не удалось загрузить историю', 'error');
                return;
            }
            const renderList = (items) => {
                if (!items?.length) return '<div class="text-center text-gray-500 py-4 text-xs">Записей нет</div>';
                return items.map((item) => `
                    <div class="webapp-history-item">
                        <div>
                            <div class="webapp-history-item__label">${item.label}</div>
                            <div class="webapp-history-item__meta">${item.method} · ${item.date || ''}</div>
                        </div>
                        <div class="webapp-history-item__amount ${item.success ? 'is-success' : 'is-pending'}">${item.amount.toFixed(2)} ₽</div>
                    </div>
                `).join('');
            };
            const html = `
                <div class="flex flex-col gap-4">
                    <div>
                        <div class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Оплаты</div>
                        ${renderList(data.payments)}
                    </div>
                    <div>
                        <div class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Баланс</div>
                        ${renderList(data.balance)}
                    </div>
                </div>`;
            openGenericModal('История платежей', html, 'receipt_long');
        } catch (e) {
            notify('Ошибка загрузки истории', 'error');
        }
    }

    async function openReferralModal() {
        const cfg = cabinetConfig || await loadCabinetConfig();
        if (!cfg?.referrals?.enabled) {
            notify('Реферальная программа отключена', 'error');
            return;
        }
        const ref = cfg.referrals;
        const html = `
            <div class="flex flex-col gap-3 text-xs">
                <div class="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div class="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Ваша ссылка</div>
                    <div class="break-all text-primary font-mono text-[11px]">${ref.link}</div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div class="text-lg font-black text-white">${ref.count || 0}</div>
                        <div class="text-[10px] text-gray-500 uppercase">Приглашено</div>
                    </div>
                    <div class="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                        <div class="text-lg font-black text-primary">${(ref.earned || 0).toFixed(0)} ₽</div>
                        <div class="text-[10px] text-gray-500 uppercase">Заработано</div>
                    </div>
                </div>
                <button type="button" id="webapp-copy-ref" class="w-full py-2.5 rounded-xl bg-primary/15 text-primary border border-primary/25 font-bold uppercase tracking-wider text-[10px]">Скопировать ссылку</button>
            </div>`;
        openGenericModal('Реферальная программа', html, 'group_add');
        document.getElementById('webapp-copy-ref')?.addEventListener('click', () => {
            navigator.clipboard?.writeText(ref.link).then(() => notify('Ссылка скопирована', 'success'));
        });
    }

    async function getActiveSubUrl() {
        try {
            const resp = await fetch('/api/user-status?user_id=' + getUserId());
            const data = await resp.json();
            if (data.ok && data.keys?.length) {
                const key = data.keys[0];
                return key.sub_url || key.subscription_url || key.key || '';
            }
        } catch (_) {}
        return '';
    }

    async function openQrForActiveKey() {
        const url = await getActiveSubUrl();
        if (!url) {
            notify('Нет активной подписки для QR', 'error');
            return;
        }
        const html = `<div class="webapp-qr-wrap"><div id="webapp-qr-target"></div><div class="text-[10px] text-gray-500 break-all text-center px-2">${url}</div></div>`;
        openGenericModal('QR подписки', html, 'qr_code_2');
        if (typeof window.__webappLoadQrLib === 'function') {
            await window.__webappLoadQrLib();
        }
        const target = document.getElementById('webapp-qr-target');
        if (target && window.QRCode) {
            target.innerHTML = '';
            new window.QRCode(target, { text: url, width: 200, height: 200, colorDark: '#000', colorLight: '#fff' });
        }
    }

    function applyModuleVisibility(cfg) {
        if (!cfg?.modules) return;
        const m = cfg.modules;
        if (!m.trial) document.getElementById('webapp-trial-banner')?.remove();
        if (!m.topup) {
            document.querySelectorAll('[data-action="topup"], #webapp-topup-btn').forEach((el) => {
                const btn = el.closest('button') || el;
                btn.remove();
            });
        }
        if (!m.referrals) document.getElementById('webapp-referral-btn')?.remove();
        if (!m.promo) {
            document.querySelectorAll('[data-action="promo"]').forEach((el) => el.closest('button')?.remove());
        }
        if (!m.howto) document.getElementById('webapp-setup-os-block')?.remove();
        if (!m.support) {
            document.querySelectorAll('[data-page-id="support-page"], #support-page').forEach((el) => el.remove?.());
        }
    }

    function applyBranding(cfg) {
        const accent = cfg?.branding?.accent_color;
        if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) {
            document.documentElement.style.setProperty('--wa-accent', accent);
            document.documentElement.style.setProperty('--primary', accent);
        }
    }

    async function initCabinet() {
        if (!document.getElementById('main-page')) return;
        if (window.STUDIO_PREVIEW) return;
        const cfg = await loadCabinetConfig();
        applyBranding(cfg);
        applyModuleVisibility(cfg);
        renderTrialBanner(cfg);
        renderQuickActions();
        renderProfileActions();
        renderSetupOsTabs(cfg);
        applyModuleVisibility(cfg);
    }

    window.WebAppCabinet = {
        init: initCabinet,
        reload: loadCabinetConfig,
        openTopUp: openTopUpFlow,
        openHistory: openPaymentHistory,
        openQr: openQrForActiveKey,
        openReferral: openReferralModal,
        activateTrial,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCabinet);
    } else {
        initCabinet();
    }
})();
