/**
 * Bot Studio — tabs, token validation, status, control, notifications
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'bot-studio-tab';
    const boot = window.BOT_PANEL_BOOT || {};
    let statusPollId = null;

    function $(id) {
        return document.getElementById(id);
    }

    function csrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }

    function toast(type, message) {
        if (typeof window.showToast === 'function') {
            window.showToast(type, message);
        }
    }

    async function postJson(url, body) {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await resp.json().catch(() => ({}));
        return { resp, data };
    }

    function resolveInitialTab() {
        const root = $('tab-bot');
        if (!root) return 'overview';
        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash && root.querySelector(`[data-section-nav="${hash}"]`)) {
            return hash;
        }
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && root.querySelector(`[data-section-nav="${stored}"]`)) {
                return stored;
            }
        } catch (_) { /* ignore */ }
        return root.dataset.botDefaultTab || 'overview';
    }

    function initSectionHooks() {
        const root = $('tab-bot');
        if (!root) return;

        root.querySelectorAll('[data-section-nav]').forEach((link) => {
            link.addEventListener('click', () => {
                const id = link.dataset.sectionNav || 'overview';
                try {
                    localStorage.setItem(STORAGE_KEY, id);
                } catch (_) { /* ignore */ }
                if (id === 'control') {
                    refreshStatus();
                }
            });
        });

        root.querySelectorAll('[data-bot-goto]').forEach((el) => {
            el.addEventListener('click', () => {
                const id = el.dataset.botGoto || 'overview';
                root.querySelector(`[data-section-nav="${id}"]`)?.click();
            });
        });

        const initial = resolveInitialTab();
        const current = root.querySelector('[data-section-nav].is-active')?.dataset.sectionNav;
        if (initial !== current) {
            root.querySelector(`[data-section-nav="${initial}"]`)?.click();
        }
    }

    function updateStatusUi(payload) {
        if (!payload) return;
        const main = payload.main || {};
        const support = payload.support || {};
        const webapp = payload.webapp || {};

        const setPill = (elId, running, configured) => {
            const el = $(elId);
            if (!el) return;
            el.classList.remove('bot-pill--run', 'bot-pill--stop', 'bot-pill--warn');
            if (running) {
                el.textContent = 'Запущен';
                el.classList.add('bot-pill--run');
            } else if (!configured) {
                el.textContent = 'Не настроен';
                el.classList.add('bot-pill--warn');
            } else {
                el.textContent = 'Остановлен';
                el.classList.add('bot-pill--stop');
            }
        };

        setPill('bot-status-main-pill', main.running, main.configured);
        setPill('bot-status-support-pill', support.running, support.configured);
        setPill('bot-status-webapp-pill', webapp.enabled, true);

        const mainUser = $('bot-status-main-user');
        if (mainUser) {
            mainUser.textContent = main.username ? `@${main.username}` : '—';
        }
        const supportUser = $('bot-status-support-user');
        if (supportUser) {
            supportUser.textContent = support.username ? `@${support.username}` : '—';
        }
        const webappTitle = $('bot-status-webapp-title');
        if (webappTitle) {
            webappTitle.textContent = webapp.enabled ? (webapp.title || 'WebApp') : 'Выключен';
        }

        const hubMain = $('bot-hub-main-status');
        if (hubMain) {
            hubMain.classList.toggle('bot-stat--ok', main.running);
            hubMain.classList.toggle('bot-stat--bad', !main.running && main.configured);
            hubMain.classList.toggle('bot-stat--warn', !main.configured);
        }
        const hubSupport = $('bot-hub-support-status');
        if (hubSupport) {
            hubSupport.classList.toggle('bot-stat--ok', support.running);
            hubSupport.classList.toggle('bot-stat--bad', !support.running && support.configured);
            hubSupport.classList.toggle('bot-stat--warn', !support.configured);
        }
    }

    async function refreshStatus() {
        if (!boot.statusUrl) return;
        try {
            const resp = await fetch(boot.statusUrl, { credentials: 'same-origin' });
            const data = await resp.json();
            if (data.ok) {
                updateStatusUi(data);
            }
        } catch (_) { /* ignore */ }
    }

    function initStatusPolling() {
        if (statusPollId) {
            clearInterval(statusPollId);
            statusPollId = null;
        }
        refreshStatus();
        statusPollId = setInterval(refreshStatus, 12000);
    }

    async function validateToken(kind) {
        const inputId = kind === 'support' ? 'bot_token_support' : 'bot_token_main';
        const resultId = kind === 'support' ? 'bot-validate-support' : 'bot-validate-main';
        const tokenInput = $(inputId);
        const resultEl = $(resultId);
        if (!tokenInput || !resultEl || !boot.validateUrl) return;

        const token = (tokenInput.value || '').trim();
        if (!token) {
            resultEl.textContent = 'Введите токен для проверки';
            resultEl.className = 'bot-validate-result is-visible bot-validate-result--err';
            return;
        }

        resultEl.textContent = 'Проверка…';
        resultEl.className = 'bot-validate-result is-visible';

        const { data } = await postJson(boot.validateUrl, { token });
        if (data.ok) {
            const username = data.username ? `@${data.username}` : '—';
            resultEl.textContent = `OK · ${data.first_name || 'Bot'} · ${username}`;
            resultEl.className = 'bot-validate-result is-visible bot-validate-result--ok';
            const usernameInput = document.querySelector(
                kind === 'support' ? 'input[name="support_bot_username"]' : 'input[name="telegram_bot_username"]',
            );
            if (usernameInput && data.username && !usernameInput.value.trim()) {
                usernameInput.value = data.username;
            }
        } else {
            resultEl.textContent = data.error || 'Некорректный токен';
            resultEl.className = 'bot-validate-result is-visible bot-validate-result--err';
        }
    }

    function initValidateButtons() {
        $('bot-validate-main-btn')?.addEventListener('click', () => validateToken('main'));
        $('bot-validate-support-btn')?.addEventListener('click', () => validateToken('support'));
    }

    async function botAction(url, confirmMsg) {
        if (confirmMsg && !window.confirm(confirmMsg)) return;
        const { data } = await postJson(url);
        toast(data.ok ? 'success' : 'danger', data.message || data.error || 'Ошибка');
        if (data.main || data.support) {
            updateStatusUi(data);
        } else {
            refreshStatus();
        }
    }

    function initControlButtons() {
        if (!boot.canControl) return;

        $('bot-start-main')?.addEventListener('click', () => botAction(boot.startMain));
        $('bot-stop-main')?.addEventListener('click', () => botAction(boot.stopMain, 'Остановить основной бот?'));
        $('bot-start-support')?.addEventListener('click', () => botAction(boot.startSupport));
        $('bot-stop-support')?.addEventListener('click', () => botAction(boot.stopSupport, 'Остановить support-бот?'));
        $('bot-start-both')?.addEventListener('click', () => botAction(boot.startBoth));
        $('bot-stop-both')?.addEventListener('click', () => botAction(boot.stopBoth, 'Остановить оба бота?'));
    }

    function initNotifyTests() {
        document.querySelectorAll('#tab-bot [data-notify-test]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const category = btn.getAttribute('data-notify-test');
                btn.disabled = true;
                try {
                    const { data } = await postJson(boot.notifyTest, { category });
                    toast(data.ok ? 'success' : 'danger', data.message || data.error || 'Ошибка');
                } catch (_) {
                    toast('danger', 'Ошибка сети');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    function initCreateTopics() {
        $('bot-notify-create-topics')?.addEventListener('click', async () => {
            const btn = $('bot-notify-create-topics');
            if (!btn) return;
            const chatInput = document.querySelector('#tab-bot input[name="notifications_chat_id"]');
            const chatId = chatInput?.value?.trim() || '';
            btn.disabled = true;
            try {
                const { data } = await postJson(boot.createTopics, { chat_id: chatId });
                if (data.ok && data.topics) {
                    Object.entries(data.topics).forEach(([field, topicId]) => {
                        const input = document.querySelector(`#tab-bot input[name="${field}"]`);
                        if (input && topicId) input.value = topicId;
                    });
                }
                const created = (data.created || []).length;
                const skipped = (data.skipped || []).length;
                const msg = data.ok
                    ? `Топики: создано ${created}, пропущено ${skipped}`
                    : (data.error || 'Ошибка создания топиков');
                toast(data.ok ? 'success' : 'danger', msg);
            } catch (_) {
                toast('danger', 'Ошибка сети');
            } finally {
                btn.disabled = false;
            }
        });
    }

    function initPasswordToggles() {
        document.querySelectorAll('#tab-bot [data-bot-toggle-pw]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.botTogglePw;
                const input = targetId ? $(targetId) : null;
                if (!input) return;
                input.type = input.type === 'password' ? 'text' : 'password';
            });
        });
    }

    function initBotPanel() {
        if (!$('tab-bot')) return;
        initSectionHooks();
        initValidateButtons();
        initControlButtons();
        initNotifyTests();
        initCreateTopics();
        initPasswordToggles();
        initStatusPolling();
    }

    window.reinitBotPanel = initBotPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBotPanel);
    } else {
        initBotPanel();
    }
})();
