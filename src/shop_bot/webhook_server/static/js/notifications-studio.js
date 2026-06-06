/**
 * Notifications Studio — channel switcher (Telegram / Mail)
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'notify-studio-channel';

    function $(id) {
        return document.getElementById(id);
    }

    function canTelegram() {
        return $('tab-content')?.dataset.notifyCanTelegram === '1';
    }

    function canMail() {
        return $('tab-content')?.dataset.notifyCanMail === '1';
    }

    function defaultChannel() {
        if (canTelegram()) return 'telegram';
        if (canMail()) return 'mail';
        return 'telegram';
    }

    function resolveChannel(requested) {
        if (requested === 'mail' && canMail()) return 'mail';
        if (requested === 'telegram' && canTelegram()) return 'telegram';
        return defaultChannel();
    }

    function setChannel(channel) {
        const ch = resolveChannel(channel);
        const tgPane = $('bmsg-telegram-pane');
        const mailPane = $('mtm-page-root');

        document.querySelectorAll('.bmsg-channel-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.notifyChannel === ch);
        });

        if (tgPane) tgPane.hidden = ch !== 'telegram';
        if (mailPane) mailPane.hidden = ch !== 'mail';

        const tgStats = $('bmsg-hub-stats-telegram');
        const tgActions = $('bmsg-hub-actions-telegram');
        if (tgStats) tgStats.hidden = ch !== 'telegram';
        if (tgActions) tgActions.hidden = ch !== 'telegram';

        if (ch !== 'mail') {
            closeMailPreviewModal();
        }

        const hubIcon = $('bmsg-hub-icon');
        const hubDesc = $('bmsg-hub-desc');
        if (hubIcon) hubIcon.textContent = ch === 'mail' ? 'mail' : 'forum';
        if (hubDesc) {
            hubDesc.textContent = ch === 'mail'
                ? 'SMTP-письма · HTML · переменные {{brand}}'
                : 'Telegram-бот · HTML · переменные {name}';
        }

        try {
            localStorage.setItem(STORAGE_KEY, ch);
        } catch (_) { /* ignore */ }

        const hash = ch === 'mail' ? '#mail' : '';
        if (location.hash !== hash && (hash || location.hash === '#mail')) {
            history.replaceState(null, '', location.pathname + location.search + hash);
        }

        window.dispatchEvent(new CustomEvent('notify-studio-channel', { detail: { channel: ch } }));
    }

    function closeMailPreviewModal() {
        const modal = $('mtmPreviewModal');
        if (!modal) return;
        if (typeof window.closeModal === 'function') {
            window.closeModal('mtmPreviewModal');
        } else {
            modal.classList.remove('open');
        }
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-overlay.open')) {
            document.body.classList.remove('has-modal-open');
        }
    }

    function initFromLocation() {
        const hash = (location.hash || '').replace('#', '').toLowerCase();
        let ch = hash === 'mail' ? 'mail' : null;
        if (!ch) {
            try {
                ch = localStorage.getItem(STORAGE_KEY);
            } catch (_) { /* ignore */ }
        }
        setChannel(ch || defaultChannel());
    }

    function bindEvents() {
        document.querySelectorAll('.bmsg-channel-tab').forEach((btn) => {
            btn.addEventListener('click', () => setChannel(btn.dataset.notifyChannel));
        });
        window.addEventListener('hashchange', initFromLocation);
    }

    function init() {
        if (!$('tab-content')?.classList.contains('bmsg-page')) return;
        bindEvents();
        initFromLocation();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
