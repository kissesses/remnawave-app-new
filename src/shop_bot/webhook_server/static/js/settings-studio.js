/**
 * Settings Studio — rail search, active link scroll, admins online hook.
 */
(function (window) {
    'use strict';

    function initRailSearch() {
        const input = document.getElementById('settings-macos-search');
        if (!input || input.dataset.setBound === '1') return;
        input.dataset.setBound = '1';

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            document.querySelectorAll('#settings-nav .tab-link').forEach((link) => {
                const label = link.dataset.settingsLabel || link.textContent.toLowerCase();
                const desc = link.dataset.settingsDesc || '';
                link.classList.toggle('hidden', q.length > 0 && !label.includes(q) && !desc.includes(q));
            });
            document.querySelectorAll('#settings-nav .settings-macos-nav-group').forEach((group) => {
                const visible = group.querySelector('.tab-link:not(.hidden)');
                group.classList.toggle('hidden', !visible);
            });
        });
    }

    function scrollActiveLinkIntoView() {
        const rail = document.getElementById('settings-macos-nav-rail');
        const active = rail?.querySelector('.tab-link.settings-tab-active');
        if (!active || !rail) return;
        try {
            active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        } catch (_) {
            active.scrollIntoView(false);
        }
    }

    function bindAdminsOnline() {
        const btn = document.getElementById('settings-hero-admins-online');
        if (!btn || btn.dataset.setBound === '1') return;
        btn.dataset.setBound = '1';

        btn.addEventListener('click', () => {
            if (typeof window.PanelPresence?.open === 'function') {
                window.PanelPresence.open();
                return;
            }
            const parentPresence = window.parent?.PanelPresence;
            if (typeof parentPresence?.open === 'function') {
                parentPresence.open();
                return;
            }
            window.PanelPresence?.refresh?.();
            const fallback = document.getElementById('panel-admins-online-btn')
                || document.getElementById('panel-admins-online-btn-glass')
                || window.parent?.document?.getElementById('panel-admins-online-btn')
                || window.parent?.document?.getElementById('panel-admins-online-btn-glass');
            fallback?.click();
        });
    }

    function initSettingsStudio() {
        initRailSearch();
        scrollActiveLinkIntoView();
        bindAdminsOnline();
    }

    window.initSettingsStudio = initSettingsStudio;
    window.reinitSettingsStudio = initSettingsStudio;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettingsStudio);
    } else {
        initSettingsStudio();
    }
}(window));
