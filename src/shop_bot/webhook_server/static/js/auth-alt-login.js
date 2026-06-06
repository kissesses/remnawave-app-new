(function () {
    'use strict';

    const cfg = window.AUTH_ALT || {};
    const csrf = cfg.csrfToken || '';
    let pendingAccountRef = null;

    function showError(message) {
        const wrap = document.querySelector('.auth-form-wrap');
        if (!wrap) {
            alert(message);
            return;
        }
        let box = wrap.querySelector('.auth-alt-error');
        if (!box) {
            box = document.createElement('div');
            box.className = 'auth-alert auth-alert--danger auth-alt-error';
            box.innerHTML = '<span class="material-symbols-outlined">error</span><span></span>';
            const header = wrap.querySelector('.auth-form-header');
            if (header && header.nextElementSibling) {
                header.parentNode.insertBefore(box, header.nextElementSibling);
            } else {
                wrap.prepend(box);
            }
        }
        box.querySelector('span:last-child').textContent = message;
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

    function prepareRequestOptions(options) {
        const pubKey = Object.assign({}, options);
        pubKey.challenge = base64urlToBuffer(pubKey.challenge);
        if (Array.isArray(pubKey.allowCredentials)) {
            pubKey.allowCredentials = pubKey.allowCredentials.map(function (c) {
                return Object.assign({}, c, { id: base64urlToBuffer(c.id) });
            });
        }
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
                authenticatorData: bufferToBase64url(response.authenticatorData),
                signature: bufferToBase64url(response.signature),
                userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
            },
        };
        if (response.getTransports) {
            out.response.transports = response.getTransports();
        }
        return out;
    }

    async function loginWithPasskey(opts) {
        opts = opts || {};
        if (!window.PublicKeyCredential) {
            showError('Passkey не поддерживается в этом браузере');
            return;
        }
        const btn = document.getElementById('passkey-login-btn');
        if (btn) btn.disabled = true;
        try {
            const body = {};
            if (opts.accountRef) body.account_ref = opts.accountRef;
            const begin = await postJson(cfg.passkeyOptionsUrl, body);
            const pubKey = prepareRequestOptions(begin.options);
            const credential = await navigator.credentials.get({ publicKey: pubKey });
            const verifyBody = {
                credential: serializeCredential(credential),
                remember_me: true,
            };
            if (opts.accountRef) verifyBody.account_ref = opts.accountRef;
            const verify = await postJson(cfg.passkeyVerifyUrl, verifyBody);
            if (verify.totp_required) {
                window.location.href = verify.redirect || '/login?step=totp';
                return;
            }
            window.location.href = verify.redirect || '/dashboard';
        } catch (err) {
            showError(err.message || 'Не удалось войти по passkey');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function onTelegramAuth(user, opts) {
        opts = opts || {};
        try {
            const payload = Object.assign({}, user, { remember_me: true });
            if (opts.accountRef) payload.account_ref = opts.accountRef;
            const data = await postJson(cfg.telegramLoginUrl, payload);
            if (data.totp_required) {
                window.location.href = data.redirect || '/login?step=totp';
                return;
            }
            window.location.href = data.redirect || '/dashboard';
        } catch (err) {
            showError(err.message || 'Не удалось войти через Telegram');
        }
    }

    const TELEGRAM_ICON_SVG = '<svg class="auth-macos-telegram-btn__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>';

    function mountTelegramWidget(wrap, accountRef) {
        if (!wrap || !cfg.telegramBotUsername) return false;

        pendingAccountRef = accountRef || null;

        const isMacosMount = wrap.classList.contains('auth-macos-telegram-mount');
        const isIconWrap = wrap.id === 'telegram-login-wrap';

        if (isIconWrap) {
            wrap.querySelectorAll('iframe').forEach(function (node) { node.remove(); });
        } else {
            wrap.innerHTML = '';
        }

        const bot = String(cfg.telegramBotUsername).replace(/^@/, '');
        const origin = encodeURIComponent(window.location.origin || (window.location.protocol + '//' + window.location.host));
        let target = wrap;

        if (isMacosMount) {
            const btn = document.createElement('div');
            btn.className = 'auth-macos-telegram-btn';
            btn.innerHTML = '<span class="auth-macos-telegram-btn__visual">' +
                TELEGRAM_ICON_SVG +
                '<span class="auth-macos-telegram-btn__label">Войти через Telegram</span></span>';
            wrap.appendChild(btn);
            target = btn;
        }

        const iframe = document.createElement('iframe');
        iframe.src = 'https://oauth.telegram.org/embed/' + encodeURIComponent(bot)
            + '?origin=' + origin
            + '&size=large&request_access=write&userpic=false';
        iframe.setAttribute('title', 'Telegram');
        iframe.setAttribute('allow', 'identity-credentials-get');

        if (isMacosMount || isIconWrap) {
            iframe.width = '100%';
            iframe.height = '100%';
            iframe.style.border = 'none';
        } else {
            iframe.width = '100%';
            iframe.height = '44';
            iframe.style.border = 'none';
            iframe.style.maxWidth = '280px';
        }

        target.appendChild(iframe);
        return true;
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== 'https://oauth.telegram.org') return;
        let data;
        try {
            data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch (_) {
            return;
        }
        if (!data || data.event !== 'auth_user' || !data.auth_data) return;
        const ref = pendingAccountRef;
        pendingAccountRef = null;
        onTelegramAuth(data.auth_data, ref ? { accountRef: ref } : {});
    });

    window.AuthAltLoginPasskey = loginWithPasskey;
    window.AuthAltLoginMountTelegram = mountTelegramWidget;
    window.onTelegramAuth = onTelegramAuth;

    document.addEventListener('DOMContentLoaded', function () {
        const passkeyBtn = document.getElementById('passkey-login-btn');
        if (passkeyBtn) {
            passkeyBtn.addEventListener('click', loginWithPasskey);
        }

        const isMacosV2 = document.documentElement.dataset.design === 'macos-v2';
        const tgWrap = document.getElementById('telegram-login-wrap');
        if (tgWrap && !isMacosV2 && cfg.telegramEnabled && cfg.telegramBotUsername) {
            mountTelegramWidget(tgWrap, null);
        }
    });
})();
