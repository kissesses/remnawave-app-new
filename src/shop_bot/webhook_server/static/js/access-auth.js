(function () {
    'use strict';

    const cfg = window.ACCESS_AUTH || {};
    const csrf = cfg.csrfToken || '';

    function notify(message, ok) {
        if (typeof window.showToast === 'function') {
            window.showToast(ok ? 'success' : 'danger', message);
            return;
        }
        alert(message);
    }

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': csrf,
            },
            credentials: 'same-origin',
            body: JSON.stringify(Object.assign({ csrf_token: csrf }, body || {})),
        });
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok || data.ok === false) {
            throw new Error(data.error || data.message || 'Ошибка запроса');
        }
        return data;
    }

    function base64urlToBuffer(base64url) {
        const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        return buf.buffer;
    }

    function bufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function prepareCreateOptions(options) {
        const pubKey = Object.assign({}, options);
        pubKey.challenge = base64urlToBuffer(pubKey.challenge);
        if (Array.isArray(pubKey.excludeCredentials)) {
            pubKey.excludeCredentials = pubKey.excludeCredentials.map(function (c) {
                return Object.assign({}, c, { id: base64urlToBuffer(c.id) });
            });
        }
        if (pubKey.user && pubKey.user.id) {
            pubKey.user = Object.assign({}, pubKey.user, { id: base64urlToBuffer(pubKey.user.id) });
        }
        return pubKey;
    }

    function serializeCredential(credential) {
        const response = credential.response;
        const out = {
            id: credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: bufferToBase64url(response.clientDataJSON),
                attestationObject: bufferToBase64url(response.attestationObject),
            },
        };
        if (response.getTransports) {
            out.response.transports = response.getTransports();
        }
        return out;
    }

    async function registerPasskey() {
        if (!window.PublicKeyCredential) {
            notify('Passkey не поддерживается в этом браузере', false);
            return;
        }
        const labelInput = document.getElementById('passkey-label-input');
        const label = labelInput ? labelInput.value.trim() : 'Passkey';
        const btn = document.getElementById('passkey-register-btn');
        if (btn) btn.disabled = true;
        try {
            const begin = await postJson(cfg.passkeyRegisterOptionsUrl, {});
            const pubKey = prepareCreateOptions(begin.options);
            const credential = await navigator.credentials.create({ publicKey: pubKey });
            await postJson(cfg.passkeyRegisterCompleteUrl, {
                credential: serializeCredential(credential),
                label: label || 'Passkey',
            });
            notify('Passkey добавлен', true);
            window.location.reload();
        } catch (err) {
            notify(err.message || 'Не удалось добавить passkey', false);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function onTelegramLink(user) {
        try {
            const data = await postJson(cfg.telegramLinkUrl, user);
            notify(data.message || 'Telegram привязан', true);
            window.location.reload();
        } catch (err) {
            notify(err.message || 'Не удалось привязать Telegram', false);
        }
    }

    function bindMethodRadioCards() {
        document.querySelectorAll('.security-method-form').forEach(function (form) {
            form.querySelectorAll('input[type="radio"][name="auth_security_method"]').forEach(function (radio) {
                radio.addEventListener('change', function () {
                    form.querySelectorAll('.auth-setup-method, .acc-method-card--radio').forEach(function (card) {
                        card.classList.remove('is-selected');
                    });
                    const label = radio.closest('.auth-setup-method, .acc-method-card--radio');
                    if (label) label.classList.add('is-selected');
                });
            });
        });
    }

    function bindTotpSecretCopy() {
        const copyBtn = document.getElementById('totp-secret-copy');
        if (!copyBtn) return;
        copyBtn.addEventListener('click', function () {
            const raw = (copyBtn.getAttribute('data-secret') || '').replace(/\s+/g, '');
            if (!raw) return;
            const done = function () {
                copyBtn.classList.add('security-totp-secret__copy--done');
                const label = copyBtn.querySelector('.security-totp-secret__copy-label');
                if (label) label.textContent = 'Скопировано';
                setTimeout(function () {
                    copyBtn.classList.remove('security-totp-secret__copy--done');
                    if (label) label.textContent = 'Копировать';
                }, 2000);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(raw).then(done).catch(function () {
                    window.prompt('Скопируйте ключ:', raw);
                });
            } else {
                window.prompt('Скопируйте ключ:', raw);
            }
        });
    }

    function bindSetupSectionToggle() {
        const section = document.getElementById('auth-setup-method-section');
        const toggle = document.getElementById('auth-setup-method-toggle');
        if (!section || !toggle) return;
        toggle.addEventListener('click', function () {
            const collapsed = section.classList.toggle('auth-setup-section--collapsed');
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.textContent = collapsed ? 'Изменить способ' : 'Свернуть';
        });
    }

    function scrollToConfigureIfNeeded() {
        const configure = document.getElementById('auth-setup-configure-section');
        if (!configure || !document.body.classList.contains('auth-security-setup')) return;
        const hasActive = document.querySelector('.auth-setup-step.is-active:nth-child(2)');
        if (hasActive && window.matchMedia('(max-width: 480px)').matches) {
            configure.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    window.onTelegramLink = onTelegramLink;

    document.addEventListener('DOMContentLoaded', function () {
        const passkeyBtn = document.getElementById('passkey-register-btn');
        if (passkeyBtn) {
            passkeyBtn.addEventListener('click', registerPasskey);
        }

        const tgWrap = document.getElementById('telegram-link-wrap');
        if (tgWrap && cfg.telegramBotUsername) {
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://telegram.org/js/telegram-widget.js?22';
            script.setAttribute('data-telegram-login', cfg.telegramBotUsername);
            script.setAttribute('data-size', 'medium');
            script.setAttribute('data-onauth', 'onTelegramLink(user)');
            script.setAttribute('data-request-access', 'write');
            tgWrap.appendChild(script);
        }

        bindMethodRadioCards();
        bindTotpSecretCopy();
        bindSetupSectionToggle();
        scrollToConfigureIfNeeded();
    });
})();
