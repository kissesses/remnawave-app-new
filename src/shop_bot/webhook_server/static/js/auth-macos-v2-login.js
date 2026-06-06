(function () {
    'use strict';

    const METHOD_ICONS = {
        password: 'key',
        password_totp: 'phonelink_lock',
        passkey: 'passkey',
        telegram: 'send',
    };

    function isMacosV2() {
        return (document.documentElement.dataset.design || '') === 'macos-v2';
    }

    function cfg() {
        return window.AUTH_MACOS_V2 || {};
    }

    function el(id) {
        return document.getElementById(id);
    }

    function setDisplayName(text) {
        const label = el('auth-macos-display-name');
        if (label) label.textContent = text || 'Учётная запись';
    }

    function setHint(text) {
        const hint = document.querySelector('.auth-macos-hint');
        if (hint) hint.textContent = text || '';
    }

    function applyAccountToForm(account) {
        const refInput = el('auth-account-ref');
        const userInput = el('username');
        if (refInput) refInput.value = account ? account.ref : '';
        if (userInput) {
            userInput.value = '';
            userInput.removeAttribute('required');
            userInput.classList.add('auth-input--bound-account');
        }
        setDisplayName(account ? account.label : 'Выберите учётную запись');
    }

    function hideTelegramMount() {
        const mount = el('auth-macos-telegram-mount');
        if (!mount) return;
        mount.classList.add('hidden');
        mount.innerHTML = '';
    }

    function showPasswordPanel(show) {
        document.body.classList.toggle('auth-macos-v2-password-ready', !!show);
        const panel = el('auth-macos-password-panel');
        if (panel) panel.classList.toggle('hidden', !show);
        if (show) hideTelegramMount();
    }

    function renderAccountButton(account) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'auth-macos-dock__item';
        btn.dataset.accountRef = account.ref;
        btn.title = account.label;
        btn.setAttribute('aria-label', account.label);
        const color = (account.avatar && account.avatar.color) || '#5856d6';
        const icon = (account.avatar && account.avatar.icon) || 'person';
        btn.style.background = 'linear-gradient(145deg, ' + color + 'dd, ' + color + '88)';
        btn.innerHTML = '<span class="material-symbols-outlined">' + icon + '</span>';
        btn.addEventListener('click', function () {
            selectAccount(account);
        });
        return btn;
    }

    function renderMethodButton(method, account) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'auth-macos-dock__item auth-macos-dock__item--method';
        btn.dataset.methodType = method.type;
        btn.title = method.label;
        btn.setAttribute('aria-label', method.label);
        const icon = METHOD_ICONS[method.type] || 'login';
        btn.innerHTML = '<span class="material-symbols-outlined">' + icon + '</span>';
        btn.addEventListener('click', function () {
            document.querySelectorAll('.auth-macos-dock__item--method').forEach(function (node) {
                node.classList.remove('auth-macos-dock__item--selected');
            });
            btn.classList.add('auth-macos-dock__item--selected');
            activateMethod(account, method);
        });
        return btn;
    }

    function buildDock() {
        const dock = el('auth-macos-dock');
        if (!dock || dock.dataset.ready === '1') return;
        dock.dataset.ready = '1';
        dock.setAttribute('aria-hidden', 'false');
        dock.innerHTML =
            '<div class="auth-macos-dock__panel">' +
            '  <div class="auth-macos-dock__stage auth-macos-dock__stage--accounts" data-stage="accounts"></div>' +
            '  <div class="auth-macos-dock__stage auth-macos-dock__stage--methods hidden" data-stage="methods">' +
            '    <button type="button" class="auth-macos-dock__back" aria-label="Назад">' +
            '      <span class="material-symbols-outlined">arrow_back</span>' +
            '    </button>' +
            '    <div class="auth-macos-dock__methods"></div>' +
            '  </div>' +
            '</div>';

        dock.querySelector('.auth-macos-dock__back').addEventListener('click', showAccountsStage);
    }

    function populateAccounts(accounts) {
        buildDock();
        const stage = document.querySelector('.auth-macos-dock__stage--accounts');
        if (!stage) return;
        stage.innerHTML = '';
        accounts.forEach(function (account) {
            stage.appendChild(renderAccountButton(account));
        });
        if (accounts.length === 1) {
            selectAccount(accounts[0], { auto: true });
        } else {
            showAccountsStage();
            setDisplayName('Выберите учётную запись');
            setHint('Нажмите на иконку в доке внизу');
            showPasswordPanel(false);
        }
    }

    function showAccountsStage() {
        const accountsStage = document.querySelector('.auth-macos-dock__stage--accounts');
        const methodsStage = document.querySelector('.auth-macos-dock__stage--methods');
        if (accountsStage) accountsStage.classList.remove('hidden');
        if (methodsStage) methodsStage.classList.add('hidden');
        applyAccountToForm(null);
        showPasswordPanel(false);
        hideTelegramMount();
        setDisplayName('Выберите учётную запись');
        setHint('Нажмите на иконку в доке внизу');
        const passInput = el('password');
        if (passInput) passInput.value = '';
    }

    function selectAccount(account, opts) {
        opts = opts || {};
        applyAccountToForm(account);
        const accountsStage = document.querySelector('.auth-macos-dock__stage--accounts');
        const methodsStage = document.querySelector('.auth-macos-dock__stage--methods');
        const methodsWrap = document.querySelector('.auth-macos-dock__methods');
        if (!methodsStage || !methodsWrap) return;

        methodsWrap.innerHTML = '';
        (account.methods || []).forEach(function (method) {
            methodsWrap.appendChild(renderMethodButton(method, account));
        });

        if (accountsStage) accountsStage.classList.add('hidden');
        methodsStage.classList.remove('hidden');
        setDisplayName(account.label);
        setHint('Выберите способ входа');

        showPasswordPanel(false);
        hideTelegramMount();
    }

    function activateMethod(account, method) {
        applyAccountToForm(account);
        if (method.type === 'password' || method.type === 'password_totp') {
            showPasswordPanel(true);
            setHint(method.type === 'password_totp' ? 'Пароль, затем код 2FA' : 'Введите пароль');
            const passInput = el('password');
            if (passInput) passInput.focus();
            return;
        }
        showPasswordPanel(false);
        if (method.type === 'passkey') {
            setHint('Подтвердите Passkey');
            if (typeof window.AuthAltLoginPasskey === 'function') {
                window.AuthAltLoginPasskey({ accountRef: account.ref });
            }
            return;
        }
        if (method.type === 'telegram') {
            setHint('Войдите через Telegram');
            hideTelegramMount();
            const mount = el('auth-macos-telegram-mount');
            if (!mount) return;
            mount.classList.remove('hidden');
            if (typeof window.AuthAltLoginMountTelegram === 'function') {
                if (!window.AuthAltLoginMountTelegram(mount, account.ref)) {
                    mount.innerHTML = '<p class="auth-macos-telegram-mount__error">Telegram не настроен</p>';
                }
            }
        }
    }

    function restoreClassicLoginForm() {
        const saved = localStorage.getItem('login_persist');
        const userInput = el('username');
        const rem = el('remember_me');
        if (userInput) {
            userInput.setAttribute('required', '');
            userInput.classList.remove('auth-input--bound-account');
            if (saved) {
                userInput.value = saved;
            }
        }
        if (rem && saved) {
            rem.checked = true;
        }
        const refInput = el('auth-account-ref');
        if (refInput) refInput.value = '';

        const userField = document.querySelector('.auth-field--username');
        if (userField) userField.classList.remove('auth-field--collapsed');

        const panel = el('auth-macos-password-panel');
        if (panel) panel.classList.remove('hidden');

        const altLogin = document.querySelector('.auth-alt-login');
        if (altLogin) altLogin.classList.remove('hidden');

        hideTelegramMount();

        const label = el('auth-macos-display-name');
        if (label) {
            delete label.dataset.serverName;
            const login = userInput && userInput.value.trim();
            label.textContent = login || 'Administrator';
        }
        setHint('');
    }

    function teardown() {
        document.body.classList.remove('auth-macos-v2-picker');
        document.body.classList.remove('auth-macos-v2-password-ready');
        restoreClassicLoginForm();
    }

    function init() {
        if (!isMacosV2()) return;
        const data = cfg();
        if (data.blocked || data.totpStep) return;
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        if (!accounts.length) return;

        document.body.classList.add('auth-macos-v2-picker');
        const userInput = el('username');
        if (userInput) userInput.removeAttribute('required');
        populateAccounts(accounts);

        const userField = document.querySelector('.auth-field--username');
        if (userField) userField.classList.add('auth-field--collapsed');

        const altLogin = document.querySelector('.auth-alt-login');
        if (altLogin) altLogin.classList.add('hidden');
    }

    function refresh() {
        if (!isMacosV2()) {
            teardown();
            return;
        }
        if (!document.body.classList.contains('auth-macos-v2-picker')) {
            init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.AuthMacosV2Login = { refresh, showAccountsStage, teardown };
})();
