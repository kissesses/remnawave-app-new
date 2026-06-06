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
    }

    window.reinitAccessPanel = bootstrapAccessPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapAccessPanel);
    } else {
        bootstrapAccessPanel();
    }
})();
