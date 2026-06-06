(function () {
    'use strict';

    const cfg = window.ACCESS_AUTH || {};
    const csrf = cfg.csrfToken || '';

    function showToast(message, ok) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, ok ? 'success' : 'danger');
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
            showToast('Passkey не поддерживается в этом браузере', false);
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
            showToast('Passkey добавлен', true);
            window.location.reload();
        } catch (err) {
            showToast(err.message || 'Не удалось добавить passkey', false);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function onTelegramLink(user) {
        try {
            const data = await postJson(cfg.telegramLinkUrl, user);
            showToast(data.message || 'Telegram привязан', true);
            window.location.reload();
        } catch (err) {
            showToast(err.message || 'Не удалось привязать Telegram', false);
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
    });
})();
