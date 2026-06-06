(function () {
    'use strict';

    const CANNED_REPLIES = [
        { label: 'Принято в работу', text: 'Здравствуйте! Ваше обращение принято в работу. Мы свяжемся с вами в ближайшее время.' },
        { label: 'Нужны детали', text: 'Спасибо за обращение! Уточните, пожалуйста: версия клиента, хост/ключ и скриншот ошибки (если есть).' },
        { label: 'Проблема решена', text: 'Проблема решена. Проверьте подключение и напишите, если что-то ещё не работает.' },
        { label: 'Ключ продлён', text: 'Срок действия ключа продлён. Обновите подписку в приложении (pull-to-refresh / обновить конфиг).' },
        { label: 'Закрываем тикет', text: 'Если вопросов больше нет — тикет закрываем. Для новой проблемы создайте обращение заново.' },
    ];

    function csrf() {
        return typeof getCsrfToken === 'function' ? getCsrfToken() : '';
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.match(/(\d{4})[-/](\d{2})[-/](\d{2})\s+(\d{2}):(\d{2})/);
        if (!parts) return dateStr;
        const date = new Date(Date.UTC(parts[1], parts[2] - 1, parts[3], parts[4], parts[5]));
        const diffMin = Math.floor((Date.now() - date) / 60000);
        if (diffMin < 1) return 'сейчас';
        if (diffMin < 60) return diffMin + ' мин.';
        if (diffMin < 1440) return Math.floor(diffMin / 60) + ' ч.';
        if (diffMin < 10080) return Math.floor(diffMin / 1440) + ' д.';
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    window.updateRelativeTimes = function () {
        document.querySelectorAll('.mobile-relative-time, .desktop-rel-time, .msg-rel-time').forEach((el) => {
            const ts = el.dataset.timestamp;
            if (ts) el.textContent = formatRelativeTime(ts);
        });
    };

    function initCannedMenus(root) {
        (root || document).querySelectorAll('.support-canned-wrap').forEach((wrap) => {
            const menu = wrap.querySelector('.support-canned-menu');
            const toggle = wrap.querySelector('.support-canned-toggle');
            if (!menu || menu.dataset.ready) return;
            menu.dataset.ready = '1';
            menu.innerHTML = CANNED_REPLIES.map((r) =>
                `<button type="button" data-text="${r.text.replace(/"/g, '&quot;')}">${r.label}</button>`
            ).join('');
            toggle?.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.hidden = !menu.hidden;
            });
            menu.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const ta = wrap.closest('.support-composer, .support-ticket-page')?.querySelector('textarea[name="message"]');
                    if (ta) {
                        ta.value = btn.dataset.text || '';
                        ta.dispatchEvent(new Event('input'));
                        ta.focus();
                    }
                    menu.hidden = true;
                });
            });
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.support-canned-wrap')) {
                document.querySelectorAll('.support-canned-menu').forEach((m) => { m.hidden = true; });
            }
        });
    }

    function bindComposer(form, ticketPath, chatEl) {
        if (!form || form.dataset.bound) return;
        form.dataset.bound = '1';
        const modeBtns = form.closest('.support-composer')?.querySelectorAll('.support-composer__mode') || [];
        let composeMode = 'reply';

        modeBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                composeMode = btn.dataset.mode || 'reply';
                modeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
                const ta = form.querySelector('textarea');
                if (ta) {
                    ta.placeholder = composeMode === 'note'
                        ? 'Внутренняя заметка (не видна пользователю)...'
                        : 'Ответ пользователю...';
                }
            });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ta = form.querySelector('textarea');
            const text = (ta?.value || '').trim();
            if (!text) return;
            const fd = new FormData(form);
            fd.set('t_action', composeMode === 'note' ? 'note' : 'reply');
            fd.set('message', text);
            const sendBtn = form.querySelector('.support-composer__send');
            if (sendBtn) sendBtn.disabled = true;
            try {
                const res = await fetch(ticketPath, {
                    method: 'POST',
                    body: fd,
                    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                });
                const data = await res.json().catch(() => ({}));
                if (data.ok) {
                    ta.value = '';
                    ta.style.height = 'auto';
                    if (chatEl) await refreshChat(chatEl, ticketPath, true);
                    if (window.showToast) showToast('success', data.message || 'Отправлено');
                } else if (window.showToast) {
                    showToast('warning', data.message || 'Не удалось отправить');
                }
            } catch (err) {
                if (window.showToast) showToast('danger', 'Ошибка сети');
            } finally {
                if (sendBtn) sendBtn.disabled = false;
            }
        });

        const ta = form.querySelector('textarea');
        if (ta) {
            ta.addEventListener('input', () => {
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
            });
            ta.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    form.requestSubmit();
                }
            });
        }
    }

    async function refreshChat(chatEl, ticketPath, forceScroll) {
        const res = await fetch(ticketPath + '?partial=true');
        if (!res.ok) return;
        const html = await res.text();
        const wasBottom = forceScroll || chatEl.scrollHeight - chatEl.scrollTop <= chatEl.clientHeight + 120;
        chatEl.innerHTML = html || '<div class="support-empty"><p>Нет сообщений</p></div>';
        if (wasBottom) {
            chatEl.scrollTop = chatEl.scrollHeight;
        }
        updateRelativeTimes();
    }

    function updateStats(stats) {
        if (!stats) return;
        Object.entries(stats).forEach(([key, val]) => {
            const el = document.querySelector(`[data-stat="${key}"]`);
            if (el) el.textContent = String(val);
        });
    }

    /* ===== Inbox ===== */
    const page = document.querySelector('.support-page');
    const inbox = document.getElementById('support-inbox');
    const preview = document.getElementById('support-preview');
    let bulkMode = false;
    const selected = new Set();
    let activePreviewId = null;

    if (inbox && page) {
        const bulkBar = document.getElementById('support-bulk-bar');
        const bulkCount = document.getElementById('support-bulk-count');
        const bulkUrl = page.dataset.bulkUrl || '/support/bulk';

        const loadInbox = async () => {
            const url = new URL(inbox.dataset.fetchUrl, location.origin);
            const params = new URLSearchParams(location.search);
            ['status', 'page', 'q', 'sort'].forEach((k) => {
                if (params.has(k)) url.searchParams.set(k, params.get(k));
            });
            inbox.dataset.fetchUrl = url.toString();
            try {
                inbox.style.opacity = '0.55';
                const res = await fetch(url, { headers: { Accept: 'application/json' } });
                if (!res.ok) return;
                const data = await res.json();
                inbox.innerHTML = data.table_html || '';
                const pag = document.getElementById('support-pagination');
                if (pag) pag.innerHTML = data.pagination_html || '';
                updateStats(data.stats);
                bindInboxItems();
                if (bulkMode) enableBulkUi(true);
                updateRelativeTimes();
            } catch (e) {
                console.error('Support inbox load failed', e);
            } finally {
                inbox.style.opacity = '1';
            }
        };

        function bindInboxItems() {
            inbox.querySelectorAll('[data-preview-ticket]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.previewTicket;
                    if (bulkMode) return;
                    loadPreview(id);
                    inbox.querySelectorAll('.support-inbox-item').forEach((el) => {
                        el.classList.toggle('is-selected', el.dataset.ticketId === id);
                    });
                });
            });
            inbox.querySelectorAll('.support-row-check').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const id = cb.value;
                    if (cb.checked) selected.add(id);
                    else selected.delete(id);
                    if (bulkCount) bulkCount.textContent = String(selected.size);
                });
            });
        }

        async function loadPreview(ticketId) {
            if (!preview || !ticketId) return;
            activePreviewId = ticketId;
            preview.innerHTML = '<div class="support-loading"><span class="material-symbols-outlined animate-spin">progress_activity</span></div>';
            try {
                const res = await fetch(`/support/${ticketId}/panel.partial`);
                if (!res.ok) throw new Error('not found');
                preview.innerHTML = await res.text();
                initCannedMenus(preview);
                const panel = preview.querySelector('.support-preview__panel');
                const chatEl = preview.querySelector('#support-preview-messages');
                const form = preview.querySelector('.support-preview-composer');
                const path = `/support/${ticketId}`;
                bindComposer(form, path, chatEl);
                bindPanelActions(panel, path, ticketId);
                updateRelativeTimes();
            } catch (e) {
                preview.innerHTML = '<div class="support-preview__empty"><p>Не удалось загрузить тикет</p></div>';
            }
        }

        function bindPanelActions(panel, path, ticketId) {
            if (!panel) return;
            panel.querySelectorAll('[data-panel-action]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.panelAction;
                    const fd = new FormData();
                    fd.append('csrf_token', btn.dataset.csrf || csrf());
                    fd.append('t_action', action);
                    const res = await fetch(path, {
                        method: 'POST',
                        body: fd,
                        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                    });
                    const data = await res.json().catch(() => ({}));
                    if (data.ok) {
                        if (window.showToast) showToast('success', data.message);
                        loadPreview(ticketId);
                        loadInbox();
                    }
                });
            });
        }

        function enableBulkUi(on) {
            bulkMode = on;
            document.querySelectorAll('.support-bulk-check').forEach((el) => {
                el.classList.toggle('hidden', !on);
            });
            bulkBar?.classList.toggle('hidden', !on);
            if (!on) {
                selected.clear();
                if (bulkCount) bulkCount.textContent = '0';
                inbox.querySelectorAll('.support-row-check').forEach((cb) => { cb.checked = false; });
            }
        }

        document.getElementById('support-bulk-toggle')?.addEventListener('click', () => {
            enableBulkUi(!bulkMode);
        });
        document.getElementById('support-bulk-cancel')?.addEventListener('click', () => enableBulkUi(false));

        bulkBar?.querySelectorAll('[data-bulk]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.bulk;
                if (!selected.size) return;
                if (action === 'delete' && !confirm(`Удалить ${selected.size} тикет(ов)?`)) return;
                try {
                    const res = await fetch(bulkUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
                        body: JSON.stringify({ action, ids: Array.from(selected) }),
                    });
                    const data = await res.json();
                    if (window.showToast) {
                        showToast(data.ok ? 'success' : 'warning', `Готово: ${data.done}/${data.total}`);
                    }
                    enableBulkUi(false);
                    if (preview) {
                        preview.innerHTML = '<div class="support-preview__empty"><span class="material-symbols-outlined">forum</span><p>Выберите тикет</p></div>';
                    }
                    activePreviewId = null;
                    loadInbox();
                } catch (e) {
                    if (window.showToast) showToast('danger', 'Ошибка');
                }
            });
        });

        document.addEventListener('click', (e) => {
            const link = e.target.closest('.ajax-nav');
            if (!link || !link.closest('.support-page')) return;
            e.preventDefault();
            const href = link.getAttribute('href');
            if (!href) return;
            history.pushState(null, '', href);
            const current = new URL(href, location.origin).searchParams.get('status') || 'waiting';
            document.querySelectorAll('.support-filter').forEach((chip) => {
                chip.classList.toggle('is-active', (chip.dataset.status || '') === current);
            });
            loadInbox();
        });

        const searchForm = document.getElementById('support-search-form');
        searchForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = searchForm.querySelector('input[name="q"]')?.value?.trim() || '';
            const params = new URLSearchParams(location.search);
            const status = params.get('status') || 'waiting';
            const sort = params.get('sort') || 'priority';
            const url = new URL('/support', location.origin);
            url.searchParams.set('status', status);
            if (q) url.searchParams.set('q', q);
            if (sort) url.searchParams.set('sort', sort);
            history.pushState(null, '', url);
            loadInbox();
        });

        document.getElementById('support-sort')?.addEventListener('change', (e) => {
            const sort = e.target.value;
            const params = new URLSearchParams(location.search);
            params.set('sort', sort);
            history.pushState(null, '', `${location.pathname}?${params}`);
            loadInbox();
        });

        loadInbox();
        const interval = parseInt(inbox.dataset.fetchInterval || '20000', 10);
        if (interval > 0) {
            setInterval(() => {
                loadInbox();
                if (activePreviewId) loadPreview(activePreviewId);
            }, interval);
        }
        window.addEventListener('popstate', () => location.reload());
    }

    /* ===== Full ticket page ===== */
    const chatBox = document.getElementById('support-chat-messages');
    if (chatBox) {
        const ticketPath = location.pathname;

        const loadMessages = async (forceScroll) => {
            try {
                await refreshChat(chatBox, ticketPath, forceScroll);
            } catch (e) {
                console.error('Messages load failed', e);
            }
        };

        bindComposer(document.getElementById('support-composer-form'), ticketPath, chatBox);
        initCannedMenus(document);

        document.querySelectorAll('[data-ticket-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.ticketAction;
                if (action === 'delete') {
                    if (!confirm('Удалить этот тикет?')) return;
                }
                const fd = new FormData();
                fd.append('csrf_token', btn.dataset.csrf || csrf());
                fd.append('t_action', action);
                const url = action === 'delete' ? ticketPath + '/delete' : ticketPath;
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        body: fd,
                        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
                    });
                    if (action === 'delete') {
                        const data = await res.json().catch(() => ({}));
                        if (data.ok) location.href = '/support';
                        else if (window.showToast) showToast('danger', data.message || 'Ошибка');
                        return;
                    }
                    const data = await res.json().catch(() => ({}));
                    if (data.ok) {
                        if (window.showToast) showToast('success', data.message);
                        if (action === 'star') {
                            location.reload();
                            return;
                        }
                        if (action === 'close' || action === 'open') {
                            document.querySelectorAll('[data-status-badge]').forEach((el) => {
                                el.textContent = data.status === 'closed' ? 'Закрыт' : 'Открыт';
                                el.classList.remove('support-pill--closed', 'support-pill--waiting', 'support-pill--open');
                                el.classList.add(data.status === 'closed' ? 'support-pill--closed' : 'support-pill--open');
                            });
                            const closeBtn = document.querySelector('[data-ticket-action="close"]');
                            const openBtn = document.querySelector('[data-ticket-action="open"]');
                            if (closeBtn) closeBtn.hidden = data.status === 'closed';
                            if (openBtn) openBtn.hidden = data.status === 'open';
                            const composerTa = document.querySelector('#support-composer-form textarea');
                            const sendBtn = document.querySelector('.support-composer__send');
                            if (composerTa) composerTa.disabled = data.status === 'closed';
                            if (sendBtn) sendBtn.disabled = data.status === 'closed';
                        }
                    }
                } catch (e) {
                    if (window.showToast) showToast('danger', 'Ошибка');
                }
            });
        });

        document.getElementById('support-copy-transcript')?.addEventListener('click', async () => {
            try {
                const res = await fetch(ticketPath + '/messages.json');
                const data = await res.json();
                const lines = (data.messages || []).map((m) => {
                    const who = m.sender === 'admin' ? 'Support' : m.sender === 'note' ? 'Note' : 'User';
                    return `[${m.created_at}] ${who}: ${m.content}`;
                });
                await navigator.clipboard.writeText(lines.join('\n\n'));
                if (window.showToast) showToast('success', 'Переписка скопирована');
            } catch (e) {
                if (window.showToast) showToast('danger', 'Не удалось скопировать');
            }
        });

        window.generateGeminiResponse = async function (event) {
            event.preventDefault();
            const btn = event.currentTarget;
            const ta = document.querySelector('#support-composer-form textarea');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (!ta || btn.disabled) return;
            btn.disabled = true;
            if (icon) icon.textContent = 'hourglass_empty';
            try {
                const ticketId = chatBox.dataset.ticketId;
                const r = await fetch('/admin/gemini/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': btn.dataset.csrf || csrf() },
                    body: JSON.stringify({ ticket_id: ticketId, current_text: ta.value }),
                });
                const d = await r.json();
                if (d.ok) {
                    ta.value = d.response;
                    ta.dispatchEvent(new Event('input'));
                    ta.focus();
                } else if (window.showToast) showToast('danger', d.error || 'Ошибка Gemini');
            } catch (e) {
                if (window.showToast) showToast('danger', 'Сеть недоступна');
            } finally {
                btn.disabled = false;
                if (icon) icon.textContent = 'auto_awesome';
            }
        };

        chatBox.innerHTML = '<div class="support-loading"><span class="material-symbols-outlined animate-spin">progress_activity</span></div>';
        loadMessages(true);
        setInterval(() => loadMessages(false), 10000);
    }

    updateRelativeTimes();
})();
