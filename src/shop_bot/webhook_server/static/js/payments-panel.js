(function () {
    'use strict';

    const STORAGE_KEY = 'pay-studio-tab';
    const cfg = window.PAYMENTS_PANEL || {};
    const SEARCH_TABS = new Set(['payments-fiat', 'payments-crypto', 'payments-telegram']);

    function getBaseUrl() {
        const domainInput = document.querySelector('#tab-payments [name="domain"]');
        const domain = (domainInput?.value || cfg.domain || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        if (domain) return 'https://' + domain;
        if (cfg.baseUrl) return String(cfg.baseUrl).replace(/\/+$/, '');
        return window.location.protocol + '//' + window.location.host;
    }

    function getTonSecret() {
        const el = document.querySelector('#tab-payments [name="ton_webhook_secret"]');
        return (el?.value || '').trim();
    }

    function buildWebhookUrl(endpoint, secretParam) {
        let url = getBaseUrl() + endpoint;
        if (secretParam) {
            const secret = getTonSecret();
            if (secret) {
                url += (endpoint.includes('?') ? '&' : '?') + secretParam + '=' + encodeURIComponent(secret);
            }
        }
        return url;
    }

    function refreshWebhooks() {
        document.querySelectorAll('#tab-payments .webhook-display').forEach((el) => {
            const endpoint = el.getAttribute('data-endpoint');
            if (!endpoint) return;
            const secretParam = el.getAttribute('data-secret-param');
            const url = buildWebhookUrl(endpoint, secretParam);
            el.textContent = url;
            el.dataset.copyUrl = url;
        });

        document.querySelectorAll('#tab-payments .pay-webhook--static').forEach((block) => {
            const path = block.getAttribute('data-path');
            if (!path) return;
            const url = getBaseUrl() + path;
            const urlEl = block.querySelector('.pay-webhook__url');
            if (urlEl) {
                urlEl.textContent = url;
                urlEl.dataset.copyUrl = url;
            }
        });
    }

    function copyText(text, btn) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            btn.classList.add('is-copied');
            const icon = btn.querySelector('.material-symbols-outlined');
            const prev = icon ? icon.textContent : '';
            if (icon) icon.textContent = 'check';
            setTimeout(() => {
                btn.classList.remove('is-copied');
                if (icon) icon.textContent = prev || 'content_copy';
            }, 1800);
        }).catch(() => {
            window.showToast?.('danger', 'Не удалось скопировать');
        });
    }

    function setTab(tabId) {
        const root = document.getElementById('tab-payments');
        if (!root) return;

        root.querySelectorAll('.pay-channel-tab').forEach((btn) => {
            const active = btn.dataset.payTab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        root.querySelectorAll('.pay-pane').forEach((pane) => {
            pane.hidden = pane.dataset.payPane !== tabId;
        });

        const toolbar = document.getElementById('pay-board-toolbar');
        if (toolbar) {
            toolbar.hidden = !SEARCH_TABS.has(tabId);
        }

        const search = document.getElementById('pay-provider-search');
        if (search && SEARCH_TABS.has(tabId)) {
            filterProviders(search.value);
        }

        try {
            localStorage.setItem(STORAGE_KEY, tabId);
        } catch (_) { /* ignore */ }

        if (history.replaceState) {
            history.replaceState(null, '', `#${tabId}`);
        }
    }

    function resolveInitialTab() {
        const root = document.getElementById('tab-payments');
        if (!root) return 'payments-general';

        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash && root.querySelector(`.pay-pane[data-pay-pane="${hash}"]`)) {
            return hash;
        }

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && root.querySelector(`.pay-pane[data-pay-pane="${stored}"]`)) {
                return stored;
            }
        } catch (_) { /* ignore */ }

        return root.dataset.payDefaultTab || 'payments-general';
    }

    function filterProviders(query) {
        const q = (query || '').trim().toLowerCase();
        const activePane = document.querySelector('#tab-payments .pay-pane:not([hidden])');
        if (!activePane) return;

        activePane.querySelectorAll('[data-pay-search]').forEach((card) => {
            const hay = (card.dataset.paySearch || card.textContent || '').toLowerCase();
            card.classList.toggle('is-filter-hidden', Boolean(q) && !hay.includes(q));
        });
    }

    function initTabs() {
        const root = document.getElementById('tab-payments');
        if (!root) return;

        root.querySelectorAll('.pay-channel-tab').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.payTab || 'payments-general'));
        });

        setTab(resolveInitialTab());
    }

    function bindCopyDelegation() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#tab-payments .pay-webhook__copy');
            if (!btn) return;
            const block = btn.closest('.pay-webhook, .pay-webhook--static');
            const urlEl = block?.querySelector('.pay-webhook__url, .webhook-display');
            const text = urlEl?.dataset.copyUrl || urlEl?.textContent || '';
            copyText(text.trim(), btn);
        });
    }

    function bindRevealDelegation() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#tab-payments .pay-field__reveal');
            if (!btn) return;
            const wrap = btn.closest('.pay-field__wrap');
            const input = wrap?.querySelector('.pay-field__input');
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            const icon = btn.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = isPass ? 'visibility_off' : 'visibility';
        });
    }

    function bindLiveUpdates() {
        const domainInput = document.querySelector('#tab-payments [name="domain"]');
        domainInput?.addEventListener('input', refreshWebhooks);
        domainInput?.addEventListener('change', refreshWebhooks);

        const tonSecret = document.querySelector('#tab-payments [name="ton_webhook_secret"]');
        tonSecret?.addEventListener('input', refreshWebhooks);
        tonSecret?.addEventListener('change', refreshWebhooks);

        document.getElementById('pay-refresh-webhooks')?.addEventListener('click', refreshWebhooks);

        document.getElementById('pay-provider-search')?.addEventListener('input', (e) => {
            filterProviders(e.target.value);
        });
    }

    function initPaymentsPanel() {
        if (!document.getElementById('tab-payments')) return;
        bindLiveUpdates();
        initTabs();
        refreshWebhooks();
    }

    bindCopyDelegation();
    bindRevealDelegation();

    window.reinitPaymentsPanel = initPaymentsPanel;
    window.initPaymentsPanel = initPaymentsPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPaymentsPanel);
    } else {
        initPaymentsPanel();
    }
})();
