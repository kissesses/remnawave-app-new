/**
 * Access Studio — tabs, search, permissions, audit
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'acc-studio-tab';
    let auditOffset = 0;
    let auditTotal = 0;
    let auditLoading = false;

    function $(id) {
        return document.getElementById(id);
    }

    function getCsrf() {
        return window.ACCESS_AUTH?.csrfToken || window.getCsrfToken?.() || '';
    }

    function tabFromHash() {
        const hash = (window.location.hash || '').replace(/^#/, '');
        return hash || null;
    }

    function setTab(tabId) {
        const root = $('tab-access');
        if (!root) return;

        document.querySelectorAll('.acc-tab').forEach((btn) => {
            const active = btn.dataset.accTab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        document.querySelectorAll('.acc-pane').forEach((pane) => {
            const show = pane.dataset.accPane === tabId;
            pane.hidden = !show;
        });

        try {
            localStorage.setItem(STORAGE_KEY, tabId);
        } catch (_) { /* ignore */ }

        if (tabId === 'audit') {
            auditOffset = 0;
            loadAudit(true);
        }
        if (tabId === 'invites') {
            loadInvites();
        }
        if (tabId === 'admins') {
            refreshAdminPresenceDots();
        }
    }

    function resolveInitialTab() {
        const root = $('tab-access');
        if (!root) return 'security';

        const hashTab = tabFromHash();
        if (hashTab && document.querySelector(`.acc-pane[data-acc-pane="${hashTab}"]`)) {
            return hashTab;
        }

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && document.querySelector(`.acc-pane[data-acc-pane="${stored}"]`)) {
                return stored;
            }
        } catch (_) { /* ignore */ }

        return root.dataset.accDefaultTab || 'security';
    }

    function filterTiles(inputId, gridSelector, attrs) {
        const input = $(inputId);
        const grid = document.querySelector(gridSelector);
        if (!input || !grid) return;

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            grid.querySelectorAll('.acc-tile').forEach((tile) => {
                const parts = attrs.map((a) => tile.dataset[a] || '');
                const hay = parts.join(' ');
                tile.classList.toggle('is-hidden', q && !hay.includes(q));
            });
        });
    }

    function initPermGroups() {
        const form = $('acc-role-form');
        if (!form) return;

        const boot = window.ACCESS_PANEL_BOOT || {};
        const presets = boot.rolePresets || [];
        const dockItems = boot.dockCoverage || [];

        function rows() {
            return form.querySelectorAll('.acc-level-row');
        }

        function setRowLevel(row, level) {
            const hidden = row.querySelector('.acc-level-input');
            if (hidden) hidden.value = level;
            row.querySelectorAll('.acc-level-seg__btn').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.level === level);
            });
            updateCoverage();
        }

        function setAll(level) {
            rows().forEach((row) => setRowLevel(row, level));
        }

        function setGroupLevels(group, level) {
            group.querySelectorAll('.acc-level-row').forEach((row) => setRowLevel(row, level));
        }

        function readLevels() {
            const out = {};
            rows().forEach((row) => {
                const perm = row.dataset.perm;
                const val = row.querySelector('.acc-level-input')?.value || 'none';
                if (perm && (val === 'view' || val === 'edit')) out[perm] = val;
            });
            return out;
        }

        function updateCoverage() {
            const levels = readLevels();
            let viewN = 0;
            let editN = 0;
            Object.values(levels).forEach((v) => {
                if (v === 'view') viewN += 1;
                if (v === 'edit') editN += 1;
            });
            const viewEl = $('acc-cov-view');
            const editEl = $('acc-cov-edit');
            if (viewEl) viewEl.textContent = String(viewN);
            if (editEl) editEl.textContent = String(editN);

            const dockEl = $('acc-cov-dock');
            if (!dockEl) return;
            const chips = dockItems
                .filter((d) => levels[d.perm])
                .map((d) => {
                    const lvl = levels[d.perm];
                    const cls = lvl === 'edit' ? 'acc-dock-chip--edit' : 'acc-dock-chip--view';
                    const icon = lvl === 'edit' ? 'edit' : 'visibility';
                    return `<span class="acc-dock-chip ${cls}"><span class="material-symbols-outlined">${icon}</span>${escapeHtml(d.label)}</span>`;
                });
            dockEl.innerHTML = chips.length
                ? chips.join('')
                : '<span class="acc-dock-chip acc-dock-chip--empty">Нет доступа к разделам dock</span>';
        }

        rows().forEach((row) => {
            row.querySelectorAll('.acc-level-seg__btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    setRowLevel(row, btn.dataset.level || 'none');
                });
            });
        });

        form.querySelectorAll('[data-acc-perm-all]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setAll(btn.dataset.accPermAll || 'edit');
            });
        });

        form.querySelector('[data-acc-perm-none]')?.addEventListener('click', (e) => {
            e.preventDefault();
            setAll('none');
        });

        form.querySelectorAll('.acc-perm-group').forEach((group) => {
            group.querySelectorAll('[data-acc-group-all]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setGroupLevels(group, btn.dataset.accGroupAll || 'edit');
                });
            });
            group.querySelector('[data-acc-group-none]')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setGroupLevels(group, 'none');
            });
        });

        document.querySelectorAll('[data-acc-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const preset = presets.find((p) => p.id === btn.dataset.accPreset);
                if (!preset) return;
                setAll('none');
                Object.entries(preset.levels || {}).forEach(([perm, level]) => {
                    const row = form.querySelector(`.acc-level-row[data-perm="${perm}"]`);
                    if (row && (level === 'view' || level === 'edit')) setRowLevel(row, level);
                });
                window.showToast?.('info', `Шаблон «${preset.label}» применён`);
            });
        });

        updateCoverage();
    }

    function renderAuditRow(entry) {
        const sum = entry.summary || entry.details || '';
        return `
            <div class="acc-audit-row">
                <div class="acc-audit-row__meta">
                    <span>${escapeHtml(entry.created_at || '—')}</span>
                    <span>${escapeHtml(entry.ip || '—')}</span>
                </div>
                <div class="acc-audit-row__action">${escapeHtml(entry.action_label || entry.action || '—')}
                    <span style="opacity:.55"> · ${escapeHtml(entry.admin_login || 'system')}</span>
                </div>
                ${sum ? `<div class="acc-audit-row__sum" title="${escapeHtml(sum)}">${escapeHtml(sum)}</div>` : ''}
            </div>`;
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function loadAudit(reset) {
        const list = $('acc-audit-list');
        const moreBtn = $('acc-audit-more');
        const totalEl = $('acc-audit-total');
        if (!list || auditLoading) return;

        if (reset) {
            auditOffset = 0;
            list.innerHTML = '';
        }

        auditLoading = true;
        const params = new URLSearchParams({
            offset: String(auditOffset),
            limit: '40',
            q: $('acc-audit-q')?.value?.trim() || '',
            admin: $('acc-audit-admin')?.value?.trim() || '',
            action: $('acc-audit-action')?.value?.trim() || '',
        });

        try {
            const resp = await fetch(`/settings/access/audit/list?${params}`, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) {
                window.showToast?.('danger', data.error || 'Ошибка загрузки журнала');
                return;
            }

            auditTotal = data.total || 0;
            if (totalEl) totalEl.textContent = String(auditTotal);

            const entries = data.entries || [];
            if (reset && !entries.length) {
                list.innerHTML = '<p class="acc-empty">Записей не найдено</p>';
            } else {
                if (reset) list.innerHTML = '';
                list.insertAdjacentHTML('beforeend', entries.map(renderAuditRow).join(''));
            }

            auditOffset += entries.length;
            if (moreBtn) {
                moreBtn.hidden = auditOffset >= auditTotal;
            }
        } catch (_) {
            window.showToast?.('danger', 'Не удалось загрузить журнал');
        } finally {
            auditLoading = false;
        }
    }

    function initAudit() {
        if (!$('acc-audit-list')) return;

        let debounce;
        ['acc-audit-q', 'acc-audit-admin', 'acc-audit-action'].forEach((id) => {
            $(id)?.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => loadAudit(true), 350);
            });
        });

        $('acc-audit-refresh')?.addEventListener('click', () => loadAudit(true));
        $('acc-audit-more')?.addEventListener('click', () => loadAudit(false));
    }

    const INVITE_STATUS_LABELS = {
        active: 'Активно',
        expired: 'Истекло',
        exhausted: 'Использовано',
        revoked: 'Отозвано',
    };
    let invitesCanManage = false;

    async function confirmAction(options) {
        if (typeof window.showConfirm === 'function') {
            return window.showConfirm(options);
        }
        return window.confirm(options.message || options.title || 'Продолжить?');
    }

    function renderInviteItem(inv) {
        const status = inv.status || 'active';
        const statusLabel = INVITE_STATUS_LABELS[status] || status;
        const uses = `${inv.uses_count || 0}/${inv.max_uses || 1}`;
        const prefix = inv.token_prefix ? ` · #${escapeHtml(inv.token_prefix)}…` : '';
        const note = inv.note ? `<div class="acc-invite-item__meta">${escapeHtml(inv.note)}</div>` : '';
        const email = inv.email_hint ? `<div class="acc-invite-item__meta">E-mail: ${escapeHtml(inv.email_hint)}</div>` : '';
        const redeemed = inv.last_redeemed_login
            ? `<div class="acc-invite-item__meta">Последний: ${escapeHtml(inv.last_redeemed_login)}</div>`
            : '';
        const createdBy = inv.created_by_login
            ? `<div class="acc-invite-item__meta">Создал: ${escapeHtml(inv.created_by_login)}</div>`
            : '';
        let actions = '';
        if (invitesCanManage && status === 'active') {
            const urlAttr = inv.url ? ` data-invite-copy="${escapeHtml(inv.url)}"` : '';
            actions = `<button type="button" class="acc-btn acc-btn--ghost acc-btn--sm" data-invite-id="${escapeHtml(String(inv.id || ''))}"${urlAttr}>
                    <span class="material-symbols-outlined">content_copy</span> Скопировать
               </button>
               <button type="button" class="acc-btn acc-btn--danger acc-btn--sm" data-invite-revoke-id="${escapeHtml(String(inv.id || ''))}">
                    <span class="material-symbols-outlined">link_off</span> Отозвать
               </button>`;
        }

        return `<article class="acc-invite-item" data-invite-status="${escapeHtml(status)}">
            <div class="acc-invite-item__head">
                <span class="acc-invite-item__role">${escapeHtml(inv.role_name || '—')}</span>
                <span class="acc-badge acc-invite-status--${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="acc-invite-item__meta">До ${escapeHtml(String(inv.expires_at || '—'))} · использований ${escapeHtml(uses)}${prefix}</div>
            ${createdBy}${note}${email}${redeemed}
            <div class="acc-invite-item__actions">${actions}</div>
        </article>`;
    }

    function renderInviteSections(invites) {
        const active = invites.filter((inv) => (inv.status || 'active') === 'active');
        const past = invites.filter((inv) => (inv.status || 'active') !== 'active');

        if (!invites.length) {
            return '<p class="acc-empty">Приглашений пока нет</p>';
        }

        const activeBlock = active.length
            ? `<section class="acc-invite-section">
                <h4 class="acc-invite-section__title">Активные</h4>
                <div class="acc-invite-section__list">${active.map(renderInviteItem).join('')}</div>
               </section>`
            : '<p class="acc-empty acc-empty--inline">Нет активных приглашений</p>';

        const pastBlock = past.length
            ? `<section class="acc-invite-section acc-invite-section--past">
                <h4 class="acc-invite-section__title">Прошлые</h4>
                <div class="acc-invite-section__list">${past.map(renderInviteItem).join('')}</div>
               </section>`
            : '';

        return `${activeBlock}${pastBlock}`;
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function loadInvites() {
        const list = $('acc-invite-list');
        const activeEl = $('acc-invites-active');
        if (!list) return;

        try {
            const resp = await fetch('/settings/access/invites/list', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) {
                list.innerHTML = '<p class="acc-empty">Не удалось загрузить приглашения</p>';
                return;
            }
            const invites = data.invites || [];
            invitesCanManage = !!data.can_manage;
            if (activeEl) activeEl.textContent = String(data.active_count ?? 0);
            list.innerHTML = renderInviteSections(invites);
        } catch (_) {
            list.innerHTML = '<p class="acc-empty">Ошибка загрузки</p>';
        }
    }

    async function copyText(text) {
        if (!text) return false;
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        }
    }

    async function fetchInviteUrl(inviteId) {
        const resp = await fetch(`/settings/access/invites/${encodeURIComponent(inviteId)}/url`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const data = await resp.json();
        if (data.ok && data.url) return { ok: true, url: data.url };
        return { ok: false, error: data.error, canRegenerate: !!data.can_regenerate };
    }

    async function regenerateInviteUrl(inviteId) {
        const resp = await fetch(`/settings/access/invites/${encodeURIComponent(inviteId)}/regenerate`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrf(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ csrf_token: getCsrf() }),
        });
        const data = await resp.json();
        if (data.ok && data.url) {
            return { ok: true, url: data.url };
        }
        return { ok: false, error: data.error || 'Не удалось обновить ссылку' };
    }

    async function copyInviteLink(copyBtn) {
        let url = copyBtn.dataset.inviteCopy || '';
        const inviteId = copyBtn.dataset.inviteId || '';

        if (!url && inviteId) {
            copyBtn.setAttribute('disabled', 'disabled');
            try {
                const result = await fetchInviteUrl(inviteId);
                if (result.ok) {
                    url = result.url;
                    copyBtn.dataset.inviteCopy = url;
                } else if (result.canRegenerate) {
                    const confirmed = await confirmAction({
                        title: 'Обновить ссылку?',
                        message: 'Полная ссылка недоступна (старое приглашение). Сгенерировать новую? Старая ссылка перестанет работать.',
                        type: 'warning',
                        confirmText: 'Обновить',
                        cancelText: 'Отмена',
                    });
                    if (!confirmed) return false;
                    const regen = await regenerateInviteUrl(inviteId);
                    if (!regen.ok) {
                        window.showToast?.('danger', regen.error || 'Не удалось обновить ссылку');
                        return false;
                    }
                    url = regen.url;
                    copyBtn.dataset.inviteCopy = url;
                    await loadInvites();
                } else {
                    window.showToast?.('danger', result.error || 'Ссылка недоступна');
                    return false;
                }
            } finally {
                copyBtn.removeAttribute('disabled');
            }
        }

        if (!url) return false;
        if (await copyText(url)) {
            window.showToast?.('success', 'Ссылка скопирована');
            return true;
        }
        window.showToast?.('danger', 'Не удалось скопировать');
        return false;
    }

    async function submitInviteForm() {
        const submitBtn = $('acc-invite-submit');
        submitBtn?.setAttribute('disabled', 'disabled');

        const payload = {
            role_id: $('acc-invite-role')?.value,
            expires_days: $('acc-invite-expires')?.value,
            max_uses: $('acc-invite-max-uses')?.value,
            note: $('acc-invite-note')?.value?.trim() || '',
            email_hint: $('acc-invite-email')?.value?.trim() || '',
        };

        try {
            const resp = await fetch('/settings/access/invites', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrf(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!data.ok) {
                window.showToast?.('danger', data.error || 'Не удалось создать приглашение');
                return;
            }
            const created = $('acc-invite-created');
            const urlInput = $('acc-invite-url');
            if (created && urlInput && data.invite?.url) {
                urlInput.value = data.invite.url;
                created.hidden = false;
                created.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            window.showToast?.('success', data.message || 'Приглашение создано');
            await loadInvites();
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        } finally {
            submitBtn?.removeAttribute('disabled');
        }
    }

    function initInvites() {
        const root = $('tab-access');
        if (!root) return;

        if (root.dataset.accInvitesBound !== '1') {
            root.dataset.accInvitesBound = '1';

            root.addEventListener('submit', (ev) => {
                const form = ev.target.closest('#acc-invite-form');
                if (!form) return;
                ev.preventDefault();
                ev.stopPropagation();
                submitInviteForm();
            }, true);

            root.addEventListener('click', async (ev) => {
                const refreshBtn = ev.target.closest('#acc-invites-refresh');
                if (refreshBtn) {
                    ev.preventDefault();
                    await loadInvites();
                    return;
                }

                const createdCopyBtn = ev.target.closest('#acc-invite-copy');
                if (createdCopyBtn) {
                    ev.preventDefault();
                    const url = $('acc-invite-url')?.value || '';
                    if (await copyText(url)) {
                        window.showToast?.('success', 'Ссылка скопирована');
                    }
                    return;
                }

                const revokeBtn = ev.target.closest('[data-invite-revoke-id]');
                if (revokeBtn) {
                    ev.preventDefault();
                    const inviteId = revokeBtn.dataset.inviteRevokeId;
                    const confirmed = await confirmAction({
                        title: 'Отозвать приглашение',
                        message: 'Ссылка перестанет работать. Продолжить?',
                        type: 'warning',
                        confirmText: 'Отозвать',
                        cancelText: 'Отмена',
                    });
                    if (!confirmed) return;

                    revokeBtn.setAttribute('disabled', 'disabled');
                    try {
                        const resp = await fetch(`/settings/access/invites/${encodeURIComponent(inviteId)}/revoke`, {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'X-CSRFToken': getCsrf(),
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                            body: JSON.stringify({ csrf_token: getCsrf() }),
                        });
                        const data = await resp.json();
                        if (data.ok) {
                            window.showToast?.('success', data.message || 'Приглашение отозвано');
                            await loadInvites();
                        } else {
                            window.showToast?.('danger', data.error || 'Ошибка');
                        }
                    } catch (_) {
                        window.showToast?.('danger', 'Ошибка сети');
                    } finally {
                        revokeBtn.removeAttribute('disabled');
                    }
                    return;
                }

                const copyBtn = ev.target.closest('button[data-invite-id]');
                if (copyBtn) {
                    ev.preventDefault();
                    await copyInviteLink(copyBtn);
                }
            });
        }

        if (document.querySelector('.acc-pane[data-acc-pane="invites"]:not([hidden])')) {
            loadInvites();
        }
    }

    function initDuplicateRole() {
        const btn = $('acc-role-duplicate');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            const roleId = btn.dataset.roleId;
            if (!roleId) return;

            const confirmed = await window.showConfirm?.({
                title: 'Копировать роль',
                message: 'Создать копию с теми же правами?',
                type: 'info',
                confirmText: 'Копировать',
                cancelText: 'Отмена',
            });
            if (!confirmed) return;

            try {
                const resp = await fetch(`/settings/access/roles/${roleId}/duplicate`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrf(),
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({ csrf_token: getCsrf() }),
                });
                const data = await resp.json();
                if (data.ok && data.role_id) {
                    window.location.href = `/settings/access?role_id=${data.role_id}#roles`;
                    return;
                }
                window.showToast?.('danger', data.message || data.error || 'Ошибка');
            } catch (_) {
                window.showToast?.('danger', 'Не удалось скопировать роль');
            }
        });
    }

    const adminState = {
        currentId: null,
        detail: null,
        tab: 'profile',
    };

    function adminDetailUrl(adminId) {
        const boot = window.ACCESS_PANEL_BOOT || {};
        const tpl = boot.adminDetailUrl || '/settings/access/admins/0.json';
        return tpl.replace('/0.json', `/${adminId}.json`);
    }

    function adminDeleteUrl(adminId) {
        const boot = window.ACCESS_PANEL_BOOT || {};
        const tpl = boot.adminDeleteUrl || '/settings/access/admins/0/delete';
        return tpl.replace('/0/delete', `/${adminId}/delete`);
    }

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

    function presenceStatusLabel(status) {
        if (status === 'online') return 'В сети';
        if (status === 'away') return 'Отошёл';
        return 'Не в сети';
    }

    function setAdminModalTab(tab) {
        adminState.tab = tab;
        document.querySelectorAll('[data-acc-admin-tab]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.accAdminTab === tab);
        });
        document.querySelectorAll('[data-acc-admin-pane]').forEach((pane) => {
            pane.classList.toggle('is-active', pane.dataset.accAdminPane === tab);
            pane.hidden = pane.dataset.accAdminPane !== tab;
        });
    }

    function openAdminModalShell() {
        const modal = $('accAdminModal');
        if (!modal) return;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        if (typeof window.openModal === 'function') window.openModal('accAdminModal');
        else modal.classList.add('open');
    }

    function closeAdminModal() {
        const modal = $('accAdminModal');
        if (!modal) return;
        if (typeof window.closeModal === 'function') window.closeModal('accAdminModal');
        else modal.classList.remove('open');
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        adminState.currentId = null;
        adminState.detail = null;
    }

    function fillRoleSelect(roles, selectedId) {
        const select = $('acc-admin-form-role');
        if (!select) return;
        select.innerHTML = (roles || []).map((role) => (
            `<option value="${role.id}"${Number(selectedId) === Number(role.id) ? ' selected' : ''}>${escapeHtml(role.name)}</option>`
        )).join('');
    }

    function renderAdminProfile(data) {
        const admin = data.admin || {};
        const presence = data.presence || {};
        const perms = data.permissions || {};

        $('acc-admin-modal-avatar').textContent = (admin.login || '?')[0]?.toUpperCase() || '?';
        $('acc-admin-modal-eyebrow').textContent = admin.is_self ? 'Ваш аккаунт' : 'Администратор';
        $('acc-admin-modal-title').textContent = admin.login || '—';
        $('acc-admin-modal-role').textContent = admin.is_superadmin
            ? `${admin.role_name || 'Superadmin'} · полный доступ`
            : (admin.role_name || '—');

        const statusEl = $('acc-admin-modal-status');
        if (statusEl) {
            const status = presence?.status || (presence?.online ? 'online' : 'offline');
            statusEl.hidden = false;
            statusEl.textContent = presence?.online
                ? `${presenceStatusLabel(status)} · ${formatAgo(presence.online_seconds_ago)}`
                : 'Не в сети';
            statusEl.className = `acc-admin-modal__status is-${status === 'online' || status === 'away' ? status : 'offline'}`;
        }

        const chips = [];
        if (admin.is_superadmin) chips.push('<span class="acc-chip"><span class="material-symbols-outlined">stars</span> Superadmin</span>');
        if (admin.is_active) chips.push('<span class="acc-chip"><span class="material-symbols-outlined">check_circle</span> Активен</span>');
        else chips.push('<span class="acc-chip"><span class="material-symbols-outlined">block</span> Выключен</span>');
        if (admin.telegram_username) chips.push(`<span class="acc-chip"><span class="material-symbols-outlined">send</span> @${escapeHtml(admin.telegram_username)}</span>`);
        $('acc-admin-modal-chips').innerHTML = chips.join('');

        $('acc-admin-meta-id').textContent = admin.id ?? '—';
        $('acc-admin-meta-role').textContent = admin.role_name || '—';
        $('acc-admin-meta-active').textContent = admin.is_active ? 'Да' : 'Нет';
        $('acc-admin-meta-online').textContent = presence?.online
            ? `${presenceStatusLabel(presence.status || 'online')} · ${formatAgo(presence.online_seconds_ago)}`
            : 'Не в сети';
        $('acc-admin-meta-page').textContent = presence?.page_label || '—';
        $('acc-admin-meta-device').textContent = presence?.device_label || '—';
        $('acc-admin-meta-security').textContent = data.security?.label || admin.security_label || '—';
        $('acc-admin-meta-telegram').textContent = admin.telegram_username
            ? `@${admin.telegram_username}`
            : (admin.telegram_user_id ? `ID ${admin.telegram_user_id}` : 'Не привязан');
        const passkeys = data.passkeys || [];
        $('acc-admin-meta-passkeys').textContent = passkeys.length
            ? `${passkeys.length} · ${passkeys.map((p) => p.label || 'Passkey').join(', ')}`
            : 'Нет';
        $('acc-admin-meta-totp').textContent = data.totp_enabled ? 'Включён' : 'Выключен';
        const lastLogin = data.last_login;
        $('acc-admin-meta-last-login').textContent = lastLogin?.created_at
            ? `${lastLogin.created_at}${lastLogin.ip ? ` · ${lastLogin.ip}` : ''}`
            : '—';
        $('acc-admin-meta-created').textContent = admin.created_at || '—';
        $('acc-admin-meta-updated').textContent = admin.updated_at || '—';

        const permsWrap = $('acc-admin-perms-wrap');
        const permsSummary = $('acc-admin-perms-summary');
        const permsChips = $('acc-admin-perms-chips');
        if (permsWrap && permsSummary && permsChips) {
            if (perms.is_superadmin) {
                permsWrap.hidden = false;
                permsSummary.textContent = 'Полный доступ ко всем разделам панели';
                permsChips.innerHTML = '<span class="acc-admin-modal__perm-chip is-edit"><span class="material-symbols-outlined">stars</span> Superadmin</span>';
            } else if ((perms.groups || []).length) {
                permsWrap.hidden = false;
                permsSummary.textContent = `${perms.view_count || 0} просмотр · ${perms.edit_count || 0} редактирование`;
                permsChips.innerHTML = (perms.groups || []).map((g) => (
                    `<span class="acc-admin-modal__perm-chip${g.level === 'edit' ? ' is-edit' : ''}">
                        <span class="material-symbols-outlined">${g.level === 'edit' ? 'edit' : 'visibility'}</span>
                        ${escapeHtml(g.title)}
                    </span>`
                )).join('');
            } else {
                permsWrap.hidden = true;
            }
        }

        const recentEl = $('acc-admin-recent-actions');
        const actions = data.recent_actions || [];
        if (recentEl) {
            recentEl.innerHTML = actions.length
                ? actions.map((a) => `
                    <li>
                        <span>
                            <span class="acc-admin-modal__action-name">${escapeHtml(a.action_label || a.action)}</span>
                            ${a.summary ? `<span class="acc-admin-modal__action-summary">${escapeHtml(a.summary)}</span>` : ''}
                        </span>
                        <span class="acc-admin-modal__action-date">${escapeHtml(a.created_at || '')}</span>
                    </li>`).join('')
                : '<li class="acc-admin-modal__action-empty">Нет записей</li>';
        }

        const auditLink = $('acc-admin-audit-link');
        if (auditLink) {
            if (data.audit_url) {
                auditLink.hidden = false;
                auditLink.href = data.audit_url;
            } else {
                auditLink.hidden = true;
            }
        }

        $('acc-admin-modal-loading').hidden = true;
        $('acc-admin-modal-profile-content').hidden = false;
    }

    function fillAdminEditForm(data) {
        const admin = data?.admin;
        const boot = window.ACCESS_PANEL_BOOT || {};
        const roles = data?.roles || boot.roles || [];
        const isCreate = !admin;

        $('acc-admin-form-id').value = admin?.id || '';
        $('acc-admin-form-login').value = admin?.login || '';
        $('acc-admin-form-pass').value = '';
        $('acc-admin-form-pass').required = isCreate;
        $('acc-admin-form-pass').placeholder = isCreate ? 'Мин. 16 символов' : 'Пусто — без изменений';
        $('acc-admin-form-pass-label').textContent = isCreate ? 'Пароль' : 'Новый пароль';
        $('acc-admin-form-active').checked = admin ? !!admin.is_active : true;
        fillRoleSelect(roles, admin?.role_id || roles[0]?.id);

        const deleteBtn = $('acc-admin-form-delete');
        if (deleteBtn) {
            deleteBtn.hidden = isCreate;
            deleteBtn.dataset.adminId = admin?.id || '';
            deleteBtn.dataset.adminLogin = admin?.login || '';
        }
    }

    async function loadAdminDetail(adminId) {
        $('acc-admin-modal-loading').hidden = false;
        $('acc-admin-modal-profile-content').hidden = true;

        try {
            const resp = await fetch(adminDetailUrl(adminId), {
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok) {
                window.showToast?.('danger', data.error || 'Не удалось загрузить профиль');
                closeAdminModal();
                return null;
            }
            adminState.detail = data;
            renderAdminProfile(data);
            fillAdminEditForm(data);
            return data;
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
            closeAdminModal();
            return null;
        }
    }

    async function openAdminModal(adminId, tab) {
        const boot = window.ACCESS_PANEL_BOOT || {};
        const isCreate = !adminId;

        adminState.currentId = adminId || null;
        openAdminModalShell();

        const tabsNav = $('acc-admin-modal-tabs');
        const editTab = $('acc-admin-modal-edit-tab');

        if (isCreate) {
            $('acc-admin-modal-avatar').textContent = '+';
            $('acc-admin-modal-eyebrow').textContent = 'Новая учётная запись';
            $('acc-admin-modal-title').textContent = 'Администратор';
            $('acc-admin-modal-role').textContent = 'Заполните поля ниже';
            $('acc-admin-modal-status').hidden = true;
            $('acc-admin-modal-chips').innerHTML = '';
            $('acc-admin-modal-loading').hidden = true;
            $('acc-admin-modal-profile-content').hidden = true;
            if (tabsNav) tabsNav.hidden = true;
            if (editTab) editTab.hidden = !boot.canEditAdmins;
            fillAdminEditForm(null);
            setAdminModalTab('edit');
            return;
        }

        if (tabsNav) tabsNav.hidden = false;
        if (editTab) editTab.hidden = true;

        const data = await loadAdminDetail(adminId);
        if (!data) return;

        if (editTab) editTab.hidden = !data.can_edit;
        setAdminModalTab(tab || 'profile');
    }

    async function submitAdminForm(ev) {
        ev.preventDefault();
        const form = $('acc-admin-form');
        if (!form) return;

        const saveBtn = $('acc-admin-form-save');
        saveBtn?.setAttribute('disabled', 'disabled');

        try {
            const resp = await fetch(form.action, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new FormData(form),
            });
            const data = await resp.json();
            if (data.ok) {
                window.showToast?.('success', data.message || 'Сохранено');
                closeAdminModal();
                window.location.href = '/settings/access#admins';
                return;
            }
            window.showToast?.('danger', data.error || data.message || 'Ошибка сохранения');
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        } finally {
            saveBtn?.removeAttribute('disabled');
        }
    }

    async function deleteAdminFromModal() {
        const btn = $('acc-admin-form-delete');
        const adminId = btn?.dataset.adminId;
        const login = btn?.dataset.adminLogin || '';
        if (!adminId) return;

        const confirmed = await confirmAction({
            title: 'Удалить администратора',
            message: `Удалить «${login}»? Это действие необратимо.`,
            type: 'warning',
            confirmText: 'Удалить',
            cancelText: 'Отмена',
        });
        if (!confirmed) return;

        btn.setAttribute('disabled', 'disabled');
        try {
            const resp = await fetch(adminDeleteUrl(adminId), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrf(),
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ csrf_token: getCsrf() }),
            });
            const data = await resp.json();
            if (data.ok) {
                window.showToast?.('success', data.message || 'Удалено');
                closeAdminModal();
                window.location.href = '/settings/access#admins';
                return;
            }
            window.showToast?.('danger', data.error || data.message || 'Ошибка');
        } catch (_) {
            window.showToast?.('danger', 'Ошибка сети');
        } finally {
            btn.removeAttribute('disabled');
        }
    }

    async function refreshAdminPresenceDots() {
        const boot = window.ACCESS_PANEL_BOOT || {};
        const url = boot.presenceUrl || document.body.dataset.presenceUrl;
        if (!url) return;

        try {
            const resp = await fetch(url, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                cache: 'no-store',
            });
            const data = await resp.json();
            if (!data.ok) return;

            const roster = data.roster || [];
            const byId = Object.fromEntries(roster.map((item) => [String(item.admin_id), item]));

            document.querySelectorAll('[data-admin-presence]').forEach((dot) => {
                const item = byId[String(dot.dataset.adminPresence)];
                dot.classList.remove('is-online', 'is-away');
                if (item?.status === 'online') dot.classList.add('is-online');
                else if (item?.status === 'away') dot.classList.add('is-away');
            });
        } catch (_) { /* ignore */ }
    }

    function initAdmins() {
        const root = $('tab-access');
        const grid = $('acc-admin-grid');
        if (!root || !grid) return;

        if (root.dataset.accAdminsBound === '1') return;
        root.dataset.accAdminsBound = '1';

        grid.addEventListener('click', (ev) => {
            const tile = ev.target.closest('.acc-admin-tile[data-admin-id]');
            if (!tile) return;
            ev.preventDefault();
            openAdminModal(parseInt(tile.dataset.adminId, 10), 'profile');
        });

        $('acc-admin-create')?.addEventListener('click', () => openAdminModal(null, 'edit'));
        $('acc-admin-modal-close')?.addEventListener('click', closeAdminModal);
        $('accAdminModal')?.addEventListener('click', (ev) => {
            if (ev.target.id === 'accAdminModal') closeAdminModal();
        });

        document.querySelectorAll('[data-acc-admin-tab]').forEach((btn) => {
            btn.addEventListener('click', () => setAdminModalTab(btn.dataset.accAdminTab || 'profile'));
        });

        $('acc-admin-form')?.addEventListener('submit', submitAdminForm);
        $('acc-admin-form-delete')?.addEventListener('click', deleteAdminFromModal);

        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && $('accAdminModal')?.classList.contains('open')) closeAdminModal();
        });

        const boot = window.ACCESS_PANEL_BOOT || {};
        if (boot.openAdminId) {
            setTab('admins');
            openAdminModal(boot.openAdminId, 'profile');
        }
    }

    function initAdminsTabPresence() {
        document.querySelectorAll('.acc-tab[data-acc-tab="admins"]').forEach((btn) => {
            if (btn.dataset.accPresenceBound === '1') return;
            btn.dataset.accPresenceBound = '1';
            btn.addEventListener('click', () => {
                setTimeout(refreshAdminPresenceDots, 0);
            });
        });
        if (document.querySelector('.acc-pane[data-acc-pane="admins"]:not([hidden])')) {
            refreshAdminPresenceDots();
        }
    }

    let accHashListenerBound = false;

    function initTabs() {
        document.querySelectorAll('.acc-tab').forEach((btn) => {
            if (btn.dataset.accBound === '1') return;
            btn.dataset.accBound = '1';
            btn.addEventListener('click', () => {
                const tab = btn.dataset.accTab;
                if (tab) {
                    window.location.hash = tab;
                    setTab(tab);
                }
            });
        });

        document.querySelectorAll('[data-acc-goto]').forEach((el) => {
            if (el.dataset.accBound === '1') return;
            el.dataset.accBound = '1';
            el.addEventListener('click', () => {
                const tab = el.dataset.accGoto;
                if (tab) {
                    window.location.hash = tab;
                    setTab(tab);
                }
            });
        });

        if (!accHashListenerBound) {
            accHashListenerBound = true;
            window.addEventListener('hashchange', () => {
                const tab = tabFromHash();
                if (tab) setTab(tab);
            });
        }

        setTab(resolveInitialTab());
    }

    function bootstrapAccessPanel() {
        if (!$('tab-access')) return;
        initTabs();
        filterTiles('acc-role-search', '#acc-role-grid', ['label', 'desc']);
        filterTiles('acc-admin-search', '#acc-admin-grid', ['label', 'role']);
        initPermGroups();
        initAudit();
        initInvites();
        initDuplicateRole();
        initAdmins();
        initAdminsTabPresence();
    }

    window.reinitAccessPanel = bootstrapAccessPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapAccessPanel);
    } else {
        bootstrapAccessPanel();
    }
})();
