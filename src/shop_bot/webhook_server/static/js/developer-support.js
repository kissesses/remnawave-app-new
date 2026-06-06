(function () {
    'use strict';

    const root = document.getElementById('dev-support-app');
    if (!root || root.dataset.enabled !== '1') return;

    const csrf = root.dataset.csrf || '';
    const ticketsBase = (root.dataset.ticketsUrl || '').replace(/\.json$/, '');
    let pollTimer = null;
    let currentTicketId = null;

    const el = (id) => document.getElementById(id);

    const STATUS = {
        open: { label: 'Открыт', icon: 'mark_email_unread' },
        pending: { label: 'В работе', icon: 'hourglass_top' },
        resolved: { label: 'Решён', icon: 'check_circle' },
        closed: { label: 'Закрыт', icon: 'archive' },
    };

    function showToast(type, msg) {
        if (window.showToast) window.showToast(type, msg);
        else alert(msg);
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function formatDate(raw) {
        if (!raw) return '—';
        const s = String(raw);
        if (s.length >= 16) return s.slice(0, 16).replace('T', ' ');
        return s;
    }

    function statusMeta(st) {
        return STATUS[st] || { label: st || '—', icon: 'help' };
    }

    function attachmentUrl(ticketId, attachmentId) {
        return `${ticketsBase}/${ticketId}/attachments/${attachmentId}`;
    }

    function formatSize(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
        return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function fileIcon(name) {
        const ext = (name || '').split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
        if (ext === 'pdf') return 'picture_as_pdf';
        if (['txt', 'log'].includes(ext)) return 'description';
        if (ext === 'zip') return 'folder_zip';
        return 'attach_file';
    }

    function bindFileDrop(container, nameEl) {
        if (!container) return;
        const input = container.querySelector('input[type="file"]');
        if (!input) return;

        const showName = () => {
            const f = input.files && input.files[0];
            if (nameEl) nameEl.textContent = f ? f.name : '';
            container.classList.toggle('ds-file-drop--has-file', Boolean(f));
        };

        input.addEventListener('change', showName);
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.classList.add('ds-file-drop--over');
        });
        container.addEventListener('dragleave', () => container.classList.remove('ds-file-drop--over'));
        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('ds-file-drop--over');
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                showName();
            }
        });
        container.addEventListener('click', (e) => {
            if (e.target === input) return;
            input.click();
        });
    }

    async function apiPost(url, body, isForm = false) {
        const opts = { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } };
        if (isForm) {
            opts.body = body;
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.headers['X-CSRFToken'] = csrf;
            opts.body = JSON.stringify(body || {});
        }
        const resp = await fetch(url, opts);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.ok === false) {
            throw new Error(data.message || resp.statusText);
        }
        return data;
    }

    function setStatus(status, label) {
        root.dataset.status = status;
        const badge = el('ds-status-badge');
        const lbl = el('ds-status-label');
        if (badge) badge.dataset.status = status;
        if (lbl) lbl.textContent = label;
    }

    function updatePairingUI(data) {
        if (data.user_code) {
            el('ds-user-code').textContent = data.user_code;
            el('ds-pairing-active')?.classList.remove('hidden');
            if (data.bind_url) {
                const link = el('ds-bind-link');
                if (link) { link.href = data.bind_url; link.textContent = data.bind_url; }
            }
            if (data.expires_at) {
                const exp = el('ds-pairing-expires');
                if (exp) exp.textContent = `Код действует до ${data.expires_at}`;
            }
            setStatus('pending', 'Ожидание');
            startPolling();
        }
        if (data.installation_id) {
            el('ds-installation-id').textContent = data.installation_id;
        }
        if (data.status === 'active') {
            setStatus('active', 'Привязано');
            el('ds-pairing-active')?.classList.add('hidden');
            el('ds-btn-pair-start').disabled = true;
            el('ds-btn-pair-revoke').disabled = false;
            el('ds-btn-submit').disabled = false;
            document.getElementById('ds-panel-ticket')?.classList.remove('ds-card--locked');
            stopPolling();
            loadTickets();
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(async () => {
            try {
                const resp = await fetch(root.dataset.pairPoll, {
                    credentials: 'same-origin',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                });
                const data = await resp.json();
                if (!resp.ok || data.ok === false) throw new Error(data.message);
                updatePairingUI(data);
            } catch (_) { /* keep polling */ }
        }, 4000);
    }

    function stopPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function renderTicketCard(t) {
        const st = statusMeta(t.status);
        const attachBadge = Number(t.attachment_count) > 0
            ? `<span class="ds-my-card__attach" title="Вложения"><span class="material-symbols-outlined">attach_file</span>${t.attachment_count}</span>`
            : '';
        return `
            <article class="ds-my-card" data-id="${t.id}" tabindex="0">
                <div class="ds-my-card__icon">
                    <span class="material-symbols-outlined">${escapeHtml(st.icon)}</span>
                </div>
                <div class="ds-my-card__body">
                    <div class="ds-my-card__top">
                        <span class="ds-my-card__id">#${t.id}</span>
                        <span class="ds-badge ds-badge--${escapeHtml(t.status || 'open')}">${escapeHtml(st.label)}</span>
                    </div>
                    <h3 class="ds-my-card__subject">${escapeHtml(t.subject || '—')}</h3>
                    <p class="ds-my-card__meta">
                        <span class="material-symbols-outlined">schedule</span>
                        ${escapeHtml(formatDate(t.updated_at || t.created_at))}
                        ${t.admin_login ? ` · ${escapeHtml(t.admin_login)}` : ''}
                    </p>
                </div>
                <div class="ds-my-card__aside">
                    ${attachBadge}
                    <span class="material-symbols-outlined ds-my-card__chev">chevron_right</span>
                </div>
            </article>
        `;
    }

    async function loadTickets() {
        const box = el('ds-tickets-list');
        if (!box) return;
        if (root.dataset.status !== 'active') {
            box.innerHTML = '<p class="ds-empty">Сначала привяжите панель</p>';
            return;
        }
        box.innerHTML = `<div class="ds-my-tickets__loading"><span class="material-symbols-outlined ds-spin">progress_activity</span><span>Загрузка…</span></div>`;
        try {
            const resp = await fetch(root.dataset.ticketsUrl, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            const items = data.items || [];
            if (!items.length) {
                box.innerHTML = `
                    <div class="ds-my-tickets__empty">
                        <span class="material-symbols-outlined">inbox</span>
                        <p>Обращений пока нет</p>
                        <span>Создайте тикет выше — он появится здесь</span>
                    </div>`;
                return;
            }
            box.innerHTML = items.map(renderTicketCard).join('');
            box.querySelectorAll('.ds-my-card').forEach((card) => {
                const open = () => openTicket(parseInt(card.dataset.id, 10));
                card.addEventListener('click', open);
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                });
            });
        } catch (e) {
            box.innerHTML = `<p class="ds-empty">Ошибка загрузки: ${escapeHtml(e.message)}</p>`;
        }
    }

    function renderAttachments(ticketId, attachments) {
        const box = el('ds-modal-attachments');
        if (!box) return;
        if (!attachments || !attachments.length) {
            box.classList.add('hidden');
            box.innerHTML = '';
            return;
        }
        box.classList.remove('hidden');
        box.innerHTML = `
            <h4 class="ds-attach-title"><span class="material-symbols-outlined">attach_file</span> Вложения</h4>
            <ul class="ds-attach-list">
                ${attachments.map((a) => `
                    <li>
                        <a class="ds-attach-chip" href="${attachmentUrl(ticketId, a.id)}" download>
                            <span class="material-symbols-outlined">${fileIcon(a.filename)}</span>
                            <span class="ds-attach-chip__name">${escapeHtml(a.filename)}</span>
                            <span class="ds-attach-chip__size">${formatSize(a.size_bytes)}</span>
                            <span class="material-symbols-outlined ds-attach-chip__dl">download</span>
                        </a>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function renderMessage(m) {
        const isDev = m.sender === 'developer';
        const label = isDev ? 'Разработчик' : (m.sender === 'client' ? 'Вы' : m.sender);
        return `
            <article class="ds-thread-msg ${isDev ? 'ds-thread-msg--dev' : 'ds-thread-msg--client'}">
                <header class="ds-thread-msg__head">
                    <span class="ds-thread-msg__avatar material-symbols-outlined">${isDev ? 'engineering' : 'person'}</span>
                    <div>
                        <strong>${escapeHtml(label)}</strong>
                        <time>${escapeHtml(formatDate(m.created_at))}</time>
                    </div>
                </header>
                <div class="ds-thread-msg__body">${escapeHtml(m.content)}</div>
            </article>
        `;
    }

    async function openTicket(id) {
        currentTicketId = id;
        const modal = el('ds-ticket-modal');
        const body = el('ds-modal-body');
        const statusBox = el('ds-modal-status');
        el('ds-modal-title').textContent = `Тикет #${id}`;
        body.innerHTML = '<div class="ds-my-tickets__loading"><span class="material-symbols-outlined ds-spin">progress_activity</span></div>';
        statusBox.innerHTML = '';
        renderAttachments(id, []);
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');

        try {
            const resp = await fetch(`${ticketsBase}/${id}.json`, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            const t = data.ticket || data;
            const st = statusMeta(t.status);
            el('ds-modal-title').textContent = t.subject || `Тикет #${id}`;
            statusBox.innerHTML = `<span class="ds-badge ds-badge--${escapeHtml(t.status || 'open')}"><span class="material-symbols-outlined">${escapeHtml(st.icon)}</span>${escapeHtml(st.label)}</span>`;
            const msgs = (t.messages || []).map(renderMessage).join('');
            body.innerHTML = msgs || '<p class="ds-empty">Сообщений нет</p>';
            renderAttachments(id, t.attachments || []);
        } catch (e) {
            body.innerHTML = `<p class="ds-empty">${escapeHtml(e.message)}</p>`;
        }
    }

    function closeModal() {
        const modal = el('ds-ticket-modal');
        modal?.classList.add('hidden');
        modal?.setAttribute('aria-hidden', 'true');
        currentTicketId = null;
        const replyForm = el('ds-reply-form');
        if (replyForm) replyForm.reset();
        el('ds-reply-file-name').textContent = '';
        el('ds-reply-file-drop')?.classList.remove('ds-file-drop--has-file');
    }

    document.querySelectorAll('[data-close-modal]').forEach((node) => {
        node.addEventListener('click', closeModal);
    });

    el('ds-reply-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentTicketId) return;
        const form = e.target;
        const message = form.message.value.trim();
        const fileInput = form.querySelector('input[name="attachment"]');
        const hasFile = fileInput && fileInput.files && fileInput.files.length;
        if (message.length < 2 && !hasFile) {
            showToast('danger', 'Введите сообщение или приложите файл');
            return;
        }
        const fd = new FormData();
        fd.set('csrf_token', csrf);
        fd.set('message', message);
        if (hasFile) fd.set('attachment', fileInput.files[0]);
        try {
            await apiPost(`${ticketsBase}/${currentTicketId}/reply`, fd, true);
            showToast('success', 'Ответ отправлен');
            form.reset();
            el('ds-reply-file-name').textContent = '';
            el('ds-reply-file-drop')?.classList.remove('ds-file-drop--has-file');
            openTicket(currentTicketId);
            loadTickets();
        } catch (err) {
            showToast('danger', err.message);
        }
    });

    el('ds-btn-pair-start')?.addEventListener('click', async () => {
        try {
            el('ds-btn-pair-start').disabled = true;
            const data = await apiPost(root.dataset.pairStart, {});
            updatePairingUI(data);
            showToast('success', data.message || 'Код создан');
        } catch (e) {
            showToast('danger', e.message);
            el('ds-btn-pair-start').disabled = false;
        }
    });

    el('ds-btn-pair-revoke')?.addEventListener('click', async () => {
        if (!confirm('Отозвать привязку? Новые тикеты отправлять будет нельзя.')) return;
        try {
            await apiPost(root.dataset.pairRevoke, {});
            setStatus('unpaired', 'Не привязано');
            el('ds-installation-id').textContent = '—';
            el('ds-btn-pair-start').disabled = false;
            el('ds-btn-pair-revoke').disabled = true;
            el('ds-btn-submit').disabled = true;
            el('ds-pairing-active')?.classList.add('hidden');
            document.getElementById('ds-panel-ticket')?.classList.add('ds-card--locked');
            stopPolling();
            showToast('success', 'Привязка отозвана');
        } catch (e) {
            showToast('danger', e.message);
        }
    });

    el('ds-ticket-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        fd.set('csrf_token', csrf);
        try {
            el('ds-btn-submit').disabled = true;
            const resp = await fetch(root.dataset.ticketCreate, {
                method: 'POST',
                body: fd,
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.message || 'Ошибка');
            showToast('success', data.message || 'Тикет отправлен');
            form.reset();
            el('ds-create-file-name').textContent = '';
            el('ds-create-file-drop')?.classList.remove('ds-file-drop--has-file');
            loadTickets();
        } catch (err) {
            showToast('danger', err.message);
        } finally {
            el('ds-btn-submit').disabled = root.dataset.status !== 'active';
        }
    });

    el('ds-btn-refresh-tickets')?.addEventListener('click', loadTickets);

    bindFileDrop(el('ds-create-file-drop'), el('ds-create-file-name'));
    bindFileDrop(el('ds-reply-file-drop'), el('ds-reply-file-name'));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    if (root.dataset.status === 'pending') startPolling();
    if (root.dataset.status === 'active') loadTickets();
})();
