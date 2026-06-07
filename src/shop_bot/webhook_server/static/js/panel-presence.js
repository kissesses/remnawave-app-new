(function () {
    'use strict';

    const PRESENCE_URL = document.body.dataset.presenceUrl || '/admin/presence.json';
    const ADMIN_DETAIL_URL_TPL = document.body.dataset.adminDetailUrl || '/settings/access/admins/0.json';
    const POLL_MS = 30000;
    const POLL_OPEN_MS = 5000;
    const BTN_IDS = ['panel-admins-online-btn', 'panel-admins-online-btn-glass'];
    const LIST_MODAL_ID = 'panelAdminsModal';
    const DETAIL_MODAL_ID = 'panelAdminDetailModal';

    let listModalOpen = false;
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

    function adminDetailUrl(adminId) {
        return ADMIN_DETAIL_URL_TPL.replace('/0.json', `/${adminId}.json`);
    }

    function getTriggerButtons() {
        return BTN_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    }

    function openModalEl(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        if (typeof window.openModal === 'function') window.openModal(modalId);
        else modal.classList.add('open');
    }

    function closeModalEl(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (typeof window.closeModal === 'function') window.closeModal(modalId);
        else modal.classList.remove('open');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    }

    function closeListModal() {
        listModalOpen = false;
        closeModalEl(LIST_MODAL_ID);
        schedulePoll(POLL_MS);
    }

    function openListModal() {
        listModalOpen = true;
        openModalEl(LIST_MODAL_ID);
        schedulePoll(POLL_OPEN_MS);
        refreshPresence();
    }

    function closeDetailModal() {
        closeModalEl(DETAIL_MODAL_ID);
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
                    <span class="panel-admins-list__chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
                </button>
            </li>`;
    }

    function bindListClicks(root) {
        root?.querySelectorAll('[data-admin-id]').forEach((btn) => {
            if (btn.dataset.padBound === '1') return;
            btn.dataset.padBound = '1';
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

    async function fetchAdminDetail(adminId) {
        try {
            const resp = await fetch(adminDetailUrl(adminId), {
                headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data.ok) return data;
            }
        } catch (_) { /* fallback below */ }

        const resp = await fetch(`/admin/presence/${adminId}.json`, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        });
        return resp.json();
    }

    async function openAdminDetail(adminId) {
        try {
            const data = await fetchAdminDetail(adminId);
            if (!data?.ok) {
                window.showToast?.('danger', data?.error || 'Не удалось загрузить профиль');
                return;
            }
            fillAdminDetail(data);
            closeListModal();
            openModalEl(DETAIL_MODAL_ID);
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? '—';
    }

    function fillAdminDetail(data) {
        const admin = data.admin || {};
        const presence = data.presence || {};
        const perms = data.permissions || {};

        setText('pad-avatar', initials(admin.login));
        setText('pad-login', admin.login || '—');
        setText('pad-role', admin.is_superadmin
            ? `${admin.role_name || 'Superadmin'} · полный доступ`
            : (admin.role_name || '—'));

        const badge = document.getElementById('pad-online-badge');
        if (badge) {
            const status = presence.status || (presence.online ? 'online' : 'offline');
            badge.textContent = presence.online
                ? `${statusLabel(status)} · ${formatAgo(presence.online_seconds_ago)}`
                : 'Не в сети';
            badge.className = 'panel-admin-detail__status'
                + (status === 'online' ? ' is-online' : status === 'away' ? ' is-away' : ' is-offline');
        }

        const chips = [];
        if (admin.is_superadmin) chips.push('<span class="panel-admin-detail__chip">Superadmin</span>');
        if (admin.is_active) chips.push('<span class="panel-admin-detail__chip is-ok">Активен</span>');
        else chips.push('<span class="panel-admin-detail__chip is-muted">Выключен</span>');
        if (admin.is_self) chips.push('<span class="panel-admin-detail__chip">Это вы</span>');
        const chipsEl = document.getElementById('pad-chips');
        if (chipsEl) chipsEl.innerHTML = chips.join('');

        setText('pad-id', admin.id ?? '—');
        setText('pad-page', presence.page_label || '—');
        setText('pad-session', formatDuration(presence.session_duration_sec));
        setText('pad-device', presence.device_label || '—');
        setText('pad-security', data.security?.label || admin.security_label || '—');
        setText('pad-telegram', admin.telegram_username
            ? `@${admin.telegram_username}`
            : (admin.telegram_user_id ? `ID ${admin.telegram_user_id}` : 'Не привязан'));

        const passkeys = data.passkeys || [];
        setText('pad-passkeys', passkeys.length
            ? `${passkeys.length} · ${passkeys.map((p) => p.label || 'Passkey').join(', ')}`
            : 'Нет');
        setText('pad-totp', data.totp_enabled ? 'Включён' : 'Выключен');

        const lastLogin = data.last_login;
        setText('pad-last-login', lastLogin?.created_at
            ? `${lastLogin.created_at}${lastLogin.ip ? ` · ${lastLogin.ip}` : ''}`
            : '—');
        setText('pad-active', admin.is_active ? 'Да' : 'Нет');
        setText('pad-created', admin.created_at || '—');
        setText('pad-updated', admin.updated_at || '—');

        const permsWrap = document.getElementById('pad-perms-wrap');
        const permsSummary = document.getElementById('pad-perms-summary');
        const permsChips = document.getElementById('pad-perms-chips');
        if (permsWrap && permsSummary && permsChips) {
            if (perms.is_superadmin) {
                permsWrap.classList.remove('hidden');
                permsSummary.textContent = 'Полный доступ ко всем разделам панели';
                permsChips.innerHTML = '<span class="panel-admin-detail__perm-chip is-edit">Superadmin</span>';
            } else if ((perms.groups || []).length) {
                permsWrap.classList.remove('hidden');
                permsSummary.textContent = `${perms.view_count || 0} просмотр · ${perms.edit_count || 0} редактирование`;
                permsChips.innerHTML = (perms.groups || []).map((g) => (
                    `<span class="panel-admin-detail__perm-chip${g.level === 'edit' ? ' is-edit' : ''}">${escapeHtml(g.title)}</span>`
                )).join('');
            } else {
                permsWrap.classList.add('hidden');
            }
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

        const auditLink = document.getElementById('pad-audit-link');
        if (auditLink) {
            if (data.audit_url) {
                auditLink.classList.remove('hidden');
                auditLink.href = data.audit_url;
            } else {
                auditLink.classList.add('hidden');
            }
        }

        const manageWrap = document.getElementById('pad-manage-wrap');
        const manageLink = document.getElementById('pad-manage-link');
        if (manageWrap && manageLink) {
            const canManage = data.can_manage_admins || data.can_edit;
            const manageUrl = data.settings_access_url || (canManage ? '/settings/access#admins' : '');
            if (canManage && manageUrl) {
                manageWrap.classList.remove('hidden');
                manageLink.href = manageUrl;
            } else {
                manageWrap.classList.add('hidden');
            }
        }
    }

    function initPresence() {
        if (!document.getElementById(LIST_MODAL_ID)) return;

        getTriggerButtons().forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (listModalOpen) closeListModal();
                else openListModal();
            });
        });

        document.querySelectorAll('[data-admins-close]').forEach((el) => el.addEventListener('click', closeListModal));
        document.getElementById('panel-admins-refresh')?.addEventListener('click', () => {
            refreshPresence();
            document.getElementById('panel-admins-refresh')?.classList.add('is-spinning');
            setTimeout(() => document.getElementById('panel-admins-refresh')?.classList.remove('is-spinning'), 600);
        });

        document.querySelectorAll('[data-presence-tab]').forEach((btn) => {
            btn.addEventListener('click', () => setPresenceTab(btn.dataset.presenceTab));
        });

        document.getElementById(LIST_MODAL_ID)?.addEventListener('click', (e) => {
            if (e.target.id === LIST_MODAL_ID) closeListModal();
        });
        document.getElementById(DETAIL_MODAL_ID)?.addEventListener('click', (e) => {
            if (e.target.id === DETAIL_MODAL_ID) closeDetailModal();
        });
        document.getElementById('pad-close')?.addEventListener('click', closeDetailModal);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById(DETAIL_MODAL_ID)?.classList.contains('open')) {
                closeDetailModal();
                return;
            }
            if (document.getElementById(LIST_MODAL_ID)?.classList.contains('open')) {
                closeListModal();
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
        open: openListModal,
        close: closeListModal,
    };
})();
