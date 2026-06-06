(function () {
    'use strict';

    const PRESENCE_URL = document.body.dataset.presenceUrl || '/admin/presence.json';
    const POLL_MS = 30000;
    const POLL_OPEN_MS = 5000;
    const BTN_IDS = ['panel-admins-online-btn', 'panel-admins-online-btn-glass'];

    let popoverOpen = false;
    let pollTimer = null;
    let presenceTab = 'online';
    let lastPayload = null;

    function formatAgo(seconds) {
        if (seconds == null) return '—';
        if (seconds < 15) return 'только что';
        if (seconds < 60) return `${seconds} сек. назад`;
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m} мин. назад`;
        return `${Math.floor(m / 60)} ч. назад`;
    }

    function formatDuration(seconds) {
        if (seconds == null || seconds < 0) return '—';
        if (seconds < 60) return `${seconds} сек.`;
        const m = Math.floor(seconds / 60);
        if (m < 60) return `${m} мин.`;
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return rm ? `${h} ч. ${rm} мин.` : `${h} ч.`;
    }

    function initials(login) {
        const s = (login || '?').trim();
        return (s[0] || '?').toUpperCase();
    }

    function escapeHtml(text) {
        return String(text || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function statusLabel(status) {
        if (status === 'online') return 'В сети';
        if (status === 'away') return 'Отошёл';
        return 'Не в сети';
    }

    function getTriggerButtons() {
        return BTN_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    }

    function closePopover() {
        popoverOpen = false;
        document.getElementById('panel-admins-popover')?.classList.add('hidden');
        schedulePoll(POLL_MS);
    }

    function openPopover() {
        popoverOpen = true;
        document.getElementById('panel-admins-popover')?.classList.remove('hidden');
        schedulePoll(POLL_OPEN_MS);
        refreshPresence();
    }

    function schedulePoll(ms) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refreshPresence, ms);
    }

    function setPresenceTab(tab) {
        presenceTab = tab;
        document.querySelectorAll('[data-presence-tab]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.presenceTab === tab);
        });
        document.querySelectorAll('[data-presence-panel]').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.presencePanel === tab);
        });
    }

    function renderRow(item, selfId) {
        const self = item.admin_id === selfId || item.is_self;
        const status = item.status || (item.active ? 'online' : 'offline');
        const dotClass = status === 'online' ? '' : status === 'away' ? ' is-away' : ' is-offline';
        const subParts = [
            item.role_name || 'Админ',
            item.page_label || statusLabel(status),
        ];
        if (item.device_label && presenceTab !== 'all') {
            subParts.push(item.device_label);
        }
        return `
            <li>
                <button type="button" class="panel-admins-list__item${self ? ' is-self' : ''}" data-admin-id="${item.admin_id}">
                    <span class="panel-admins-list__avatar">${initials(item.login)}</span>
                    <span class="panel-admins-list__body">
                        <span class="panel-admins-list__name">${escapeHtml(item.login)}${self ? ' · вы' : ''}</span>
                        <span class="panel-admins-list__sub">${escapeHtml(subParts.filter(Boolean).join(' · '))}</span>
                    </span>
                    <span class="panel-admins-list__dot${dotClass}" title="${formatAgo(item.online_seconds_ago)}"></span>
                </button>
            </li>`;
    }

    function bindListClicks(root) {
        root?.querySelectorAll('[data-admin-id]').forEach((btn) => {
            btn.addEventListener('click', () => openAdminDetail(parseInt(btn.dataset.adminId, 10)));
        });
    }

    function fillList(listId, emptyId, items, selfId) {
        const list = document.getElementById(listId);
        const empty = document.getElementById(emptyId);
        if (!list) return;
        if (!items?.length) {
            list.innerHTML = '';
            empty?.classList.remove('hidden');
            return;
        }
        empty?.classList.add('hidden');
        list.innerHTML = items.map((item) => renderRow(item, selfId)).join('');
        bindListClicks(list);
    }

    function updateToolbar(data) {
        const stats = data.stats || {};
        const online = stats.online ?? data.online_count ?? 0;
        const away = stats.away ?? data.away_count ?? 0;
        const active = online + away;

        document.querySelectorAll('.panel-admins-online-count').forEach((el) => {
            el.textContent = String(active);
        });

        getTriggerButtons().forEach((btn) => {
            btn.classList.toggle('has-others-online', online > 0 && data.self_id && active > 1);
            btn.classList.toggle('has-away', away > 0 && !online);
        });

        const statsEl = document.getElementById('panel-admins-stats');
        if (statsEl) {
            const parts = [];
            if (online) parts.push(`${online} в сети`);
            if (away) parts.push(`${away} отошли`);
            statsEl.textContent = parts.length ? parts.join(' · ') : 'Нет активных сессий';
        }
    }

    function renderPresence(data) {
        if (!data?.ok) return;
        lastPayload = data;
        const selfId = data.self_id;

        updateToolbar(data);

        const onlineItems = (data.online || []).filter((x) => x.status === 'online');
        const awayItems = data.away || [];
        fillList('panel-admins-list-online', 'panel-admins-empty-online', [...onlineItems, ...awayItems], selfId);
        fillList('panel-admins-list-all', 'panel-admins-empty-all', data.roster || [], selfId);
        fillList('panel-admins-list-recent', 'panel-admins-empty-recent', data.recent || [], selfId);
    }

    async function refreshPresence() {
        try {
            const resp = await fetch(PRESENCE_URL, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const data = await resp.json();
            renderPresence(data);
        } catch (_) { /* ignore */ }
    }

    async function openAdminDetail(adminId) {
        try {
            const resp = await fetch(`/admin/presence/${adminId}.json`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
            });
            const data = await resp.json();
            if (!data.ok) {
                window.showToast?.('danger', data.error || 'Не удалось загрузить профиль');
                return;
            }
            fillAdminDetail(data);
            closePopover();
            window.openModal?.('panelAdminDetailModal');
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        }
    }

    function fillAdminDetail(data) {
        const admin = data.admin || {};
        const presence = data.presence || {};
        document.getElementById('pad-avatar').textContent = initials(admin.login);
        document.getElementById('pad-login').textContent = admin.login || '—';
        document.getElementById('pad-role').textContent = admin.is_superadmin
            ? `${admin.role_name || 'Superadmin'} · полный доступ`
            : (admin.role_name || '—');

        const badge = document.getElementById('pad-online-badge');
        if (badge) {
            const status = presence.status || (presence.online ? 'online' : 'offline');
            badge.textContent = presence.online
                ? `${statusLabel(status)} · ${formatAgo(presence.online_seconds_ago)}`
                : 'Не в сети';
            badge.className = 'panel-admin-detail__status'
                + (status === 'online' ? ' is-online' : status === 'away' ? ' is-away' : ' is-offline');
        }

        document.getElementById('pad-page').textContent = presence.page_label || '—';
        document.getElementById('pad-session').textContent = formatDuration(presence.session_duration_sec);
        document.getElementById('pad-device').textContent = presence.device_label || '—';
        document.getElementById('pad-security').textContent = admin.security_label || '—';
        document.getElementById('pad-telegram').textContent = admin.telegram_username
            ? `@${admin.telegram_username}`
            : 'Не привязан';
        document.getElementById('pad-active').textContent = admin.is_active ? 'Да' : 'Нет';

        const lastLogin = data.last_login;
        const lastLoginEl = document.getElementById('pad-last-login');
        if (lastLoginEl) {
            lastLoginEl.textContent = lastLogin?.created_at
                ? `${lastLogin.created_at}${lastLogin.ip ? ` · ${lastLogin.ip}` : ''}`
                : '—';
        }

        const recentEl = document.getElementById('pad-recent');
        const actions = data.recent_actions || [];
        if (recentEl) {
            recentEl.innerHTML = actions.length
                ? actions.map((a) => `
                    <li>
                        <span class="panel-admin-detail__action-text">
                            <span class="panel-admin-detail__action-name">${escapeHtml(a.action_label || a.action)}</span>
                            ${a.summary && a.summary !== a.action_label ? `<span class="panel-admin-detail__action-summary">${escapeHtml(a.summary)}</span>` : ''}
                        </span>
                        <span class="panel-admin-detail__action-date">${escapeHtml(a.created_at || '')}</span>
                    </li>`).join('')
                : '<li class="panel-admin-detail__action-empty">Нет записей</li>';
        }

        const manageWrap = document.getElementById('pad-manage-wrap');
        const manageLink = document.getElementById('pad-manage-link');
        if (manageWrap && manageLink) {
            if (data.can_manage_admins && data.settings_access_url) {
                manageWrap.classList.remove('hidden');
                manageLink.href = data.settings_access_url;
            } else {
                manageWrap.classList.add('hidden');
            }
        }
    }

    function initPresence() {
        if (!document.getElementById('panel-admins-popover')) return;

        getTriggerButtons().forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popoverOpen) closePopover();
                else openPopover();
            });
        });

        document.querySelectorAll('[data-admins-close]').forEach((el) => el.addEventListener('click', closePopover));
        document.getElementById('panel-admins-refresh')?.addEventListener('click', () => {
            refreshPresence();
            document.getElementById('panel-admins-refresh')?.classList.add('is-spinning');
            setTimeout(() => document.getElementById('panel-admins-refresh')?.classList.remove('is-spinning'), 600);
        });

        document.querySelectorAll('[data-presence-tab]').forEach((btn) => {
            btn.addEventListener('click', () => setPresenceTab(btn.dataset.presenceTab));
        });

        document.addEventListener('click', (e) => {
            if (!popoverOpen) return;
            const pop = document.getElementById('panel-admins-popover');
            const triggers = getTriggerButtons();
            if (pop && !pop.contains(e.target) && !triggers.some((btn) => btn.contains(e.target))) {
                closePopover();
            }
        });

        refreshPresence();
        schedulePoll(POLL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPresence);
    } else {
        initPresence();
    }

    window.PanelPresence = {
        refresh: refreshPresence,
        open: openPopover,
        close: closePopover,
    };
})();
