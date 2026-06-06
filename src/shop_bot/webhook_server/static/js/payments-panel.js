(function () {
    'use strict';

    const cfg = window.PAYMENTS_PANEL || {};

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
            if (typeof window.showToast === 'function') {
                window.showToast('danger', 'Не удалось скопировать');
            }
        });
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

    function bindDomainLiveUpdate() {
        const domainInput = document.querySelector('#tab-payments [name="domain"]');
        if (!domainInput) return;
        domainInput.addEventListener('input', refreshWebhooks);
        domainInput.addEventListener('change', refreshWebhooks);
    }

    function bindTonSecretLiveUpdate() {
        const tonSecret = document.querySelector('#tab-payments [name="ton_webhook_secret"]');
        if (!tonSecret) return;
        tonSecret.addEventListener('input', refreshWebhooks);
        tonSecret.addEventListener('change', refreshWebhooks);
    }

    function init() {
        if (!document.getElementById('tab-payments')) return;
        refreshWebhooks();
    }

    bindCopyDelegation();
    bindRevealDelegation();

    document.addEventListener('DOMContentLoaded', () => {
        bindDomainLiveUpdate();
        bindTonSecretLiveUpdate();
        init();
    });

    window.initPaymentsPanel = init;
})();
