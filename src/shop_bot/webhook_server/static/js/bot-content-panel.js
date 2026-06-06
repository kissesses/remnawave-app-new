/**
 * Bot content tab inside Button Constructor
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'btn-cstr-content-tab';

    function $(id) {
        return document.getElementById(id);
    }

    function root() {
        return document.querySelector('.btn-cstr-content-root');
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function sanitizeTelegramHtml(raw) {
        let s = escapeHtml(raw || '');
        s = s.replace(/\n/g, '<br>');
        s = s.replace(/&lt;(\/?)(b|strong|i|em|u|s|code|pre)&gt;/gi, '<$1$2>');
        return s || '<span style="opacity:.45">Текст главного меню…</span>';
    }

    function setTab(tabId) {
        const r = root();
        if (!r) return;

        r.querySelectorAll('.cnt-tab').forEach((btn) => {
            const active = btn.dataset.cntTab === tabId;
            btn.classList.toggle('is-active', active);
        });
        r.querySelectorAll('.cnt-pane').forEach((pane) => {
            pane.hidden = pane.dataset.cntPane !== tabId;
        });
        try {
            localStorage.setItem(STORAGE_KEY, tabId);
        } catch (_) { /* ignore */ }
    }

    function initTabs() {
        const r = root();
        if (!r) return;

        r.querySelectorAll('.cnt-tab').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.cntTab || 'overview'));
        });
        r.querySelectorAll('[data-cnt-goto]').forEach((el) => {
            el.addEventListener('click', (e) => {
                if (el.tagName === 'A') return;
                e.preventDefault();
                setTab(el.dataset.cntGoto || 'overview');
            });
        });

        let tabId = 'overview';
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && r.querySelector(`.cnt-pane[data-cnt-pane="${stored}"]`)) {
                tabId = stored;
            }
        } catch (_) { /* ignore */ }
        setTab(tabId);
    }

    function initPlatformTabs() {
        const r = root();
        if (!r) return;
        const switchPlatform = (plat) => {
            r.querySelectorAll('.cnt-platform-tab, .cnt-howto-nav__btn').forEach((b) => {
                b.classList.toggle('is-active', b.dataset.platform === plat);
            });
            r.querySelectorAll('.cnt-platform-pane').forEach((pane) => {
                pane.hidden = pane.dataset.platform !== plat;
            });
        };
        r.querySelectorAll('.cnt-platform-tab, .cnt-howto-nav__btn').forEach((btn) => {
            btn.addEventListener('click', () => switchPlatform(btn.dataset.platform));
        });
    }

    function updatePreview() {
        const bubble = $('bc-tg-bubble');
        const src = $('bc-main-menu-text');
        if (bubble && src) {
            bubble.innerHTML = sanitizeTelegramHtml(src.value);
        }
    }

    function initPreview() {
        const src = $('bc-main-menu-text');
        if (src) {
            src.addEventListener('input', updatePreview);
            updatePreview();
        }
    }

    function initSave() {
        const form = $('btn-cstr-content-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = $('btn-cstr-content-save');
            const csrf = form.querySelector('[name="csrf_token"]')?.value
                || document.querySelector('meta[name="csrf-token"]')?.content
                || '';
            if (btn) btn.disabled = true;
            try {
                const res = await fetch(form.action, {
                    method: 'POST',
                    body: new FormData(form),
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                        'X-CSRFToken': csrf,
                    },
                    credentials: 'same-origin',
                });
                const data = await res.json().catch(() => ({}));
                const ok = res.ok && data.ok !== false;
                const msg = data.message || (ok ? 'Настройки сохранены.' : 'Ошибка сохранения');
                if (window.SettingsPage?.toast) {
                    window.SettingsPage.toast(ok ? 'success' : 'danger', msg);
                } else if (window.showToast) {
                    window.showToast(ok ? 'success' : 'danger', msg);
                }
            } catch (_) {
                if (window.showToast) window.showToast('danger', 'Ошибка сохранения');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    function init() {
        if (!root()) return;
        initTabs();
        initPlatformTabs();
        initPreview();
        initSave();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.BotContentPanel = { setTab };
})();
