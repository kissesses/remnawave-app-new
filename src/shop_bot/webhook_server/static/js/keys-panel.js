(function () {
    'use strict';

    const page = document.querySelector('.keys-page');
    if (!page) return;

    const tbody = document.getElementById('keys-tbody');
    const pagEl = document.getElementById('keys-pagination');
    const searchInput = document.getElementById('keys-search');
    const hostSelect = document.getElementById('keys-host-filter');
    const sortSelect = document.getElementById('keys-sort');
    const createPanel = document.getElementById('keys-create-panel');
    const createToggle = document.getElementById('keys-create-toggle');
    const drawer = document.getElementById('keys-detail-drawer');
    const bulkBar = document.getElementById('keys-bulk-bar');
    const bulkCountEl = document.getElementById('keys-bulk-count');
    const bulkModalCount = document.getElementById('keys-bulk-modal-count');
    const selectAll = document.getElementById('keys-select-all');
    const bulkUrl = page.dataset.bulkUrl || '/admin/keys/bulk';
    const COLSPAN = 9;

    const selected = new Set();

    function getCsrf() {
        return typeof getCsrfToken === 'function' ? getCsrfToken() : '';
    }

    function currentParams() {
        return new URLSearchParams(window.location.search);
    }

    function buildPageUrl(overrides) {
        const params = currentParams();
        Object.entries(overrides || {}).forEach(([k, v]) => {
            if (v === null || v === undefined || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (!params.has('filter')) params.set('filter', 'general');
        return `${window.location.pathname}?${params.toString()}`;
    }

    function syncFetchUrls() {
        const params = currentParams();
        if (tbody) {
            const fetchUrl = new URL(tbody.dataset.fetchUrl, window.location.origin);
            params.forEach((v, k) => fetchUrl.searchParams.set(k, v));
            tbody.dataset.fetchUrl = fetchUrl.toString();
        }
        if (pagEl) {
            const pagUrl = new URL(pagEl.dataset.src, window.location.origin);
            params.forEach((v, k) => pagUrl.searchParams.set(k, v));
            pagEl.dataset.src = pagUrl.pathname + pagUrl.search;
        }
    }

    function setActiveFilters() {
        const params = currentParams();
        const filter = params.get('filter') || 'general';
        const status = params.get('status') || 'all';

        document.querySelectorAll('.keys-filter[data-filter]').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.filter === filter);
        });
        document.querySelectorAll('.keys-filter[data-status]').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.status === status);
        });
    }

    function updateBulkBar() {
        const n = selected.size;
        if (bulkCountEl) bulkCountEl.textContent = String(n);
        if (bulkModalCount) bulkModalCount.textContent = String(n);
        bulkBar?.classList.toggle('hidden', n === 0);
    }

    function clearSelection() {
        selected.clear();
        document.querySelectorAll('.keys-row-check').forEach((cb) => { cb.checked = false; });
        if (selectAll) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        }
        updateBulkBar();
    }

    function bindRowChecks() {
        const boxes = document.querySelectorAll('.keys-row-check');
        boxes.forEach((cb) => {
            const id = parseInt(cb.value, 10);
            cb.checked = selected.has(id);
            cb.onchange = () => {
                if (cb.checked) selected.add(id);
                else selected.delete(id);
                if (selectAll) {
                    const allChecked = boxes.length > 0 && [...boxes].every((b) => b.checked);
                    selectAll.checked = allChecked;
                    selectAll.indeterminate = !allChecked && selected.size > 0;
                }
                updateBulkBar();
            };
        });
        if (selectAll) {
            const allChecked = boxes.length > 0 && [...boxes].every((b) => b.checked);
            selectAll.checked = allChecked;
            selectAll.indeterminate = !allChecked && selected.size > 0;
        }
    }

    async function loadTable() {
        if (!tbody) return;
        const url = new URL(tbody.dataset.fetchUrl, window.location.origin);
        tbody.innerHTML = `<tr><td colspan="${COLSPAN}"><div class="keys-loading"><span class="material-symbols-outlined">progress_activity</span>Загрузка ключей…</div></td></tr>`;
        try {
            const resp = await fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
            if (!resp.ok) throw new Error('load failed');
            tbody.innerHTML = await resp.text();
            bindRowChecks();
            await updatePagination(url);
        } catch (e) {
            console.error('Keys table load failed:', e);
            tbody.innerHTML = `<tr><td colspan="${COLSPAN}"><div class="keys-empty">Ошибка загрузки</div></td></tr>`;
        }
    }

    async function updatePagination(currentUrl) {
        if (!pagEl) return;
        const pagUrl = new URL(pagEl.dataset.src, window.location.origin);
        currentUrl.searchParams.forEach((v, k) => pagUrl.searchParams.set(k, v));
        try {
            const resp = await fetch(pagUrl, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
            if (resp.ok) {
                pagEl.innerHTML = await resp.text();
                pagEl.dataset.src = pagUrl.pathname + pagUrl.search;
            }
        } catch (_) { /* ignore */ }
    }

    async function navigate(href, replace) {
        if (replace) history.replaceState(null, '', href);
        else history.pushState(null, '', href);
        syncFetchUrls();
        setActiveFilters();
        clearSelection();
        await loadTable();
    }

    async function postBulk(action, extra) {
        const resp = await fetch(bulkUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrf(),
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                action,
                key_ids: [...selected],
                ...extra,
            }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || resp.statusText);
        return data;
    }

    document.addEventListener('click', async (e) => {
        const link = e.target.closest('.ajax-nav');
        if (!link || !page.contains(link)) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;
        await navigate(href, false);
    });

    window.addEventListener('popstate', async () => {
        syncFetchUrls();
        setActiveFilters();
        if (hostSelect) hostSelect.value = currentParams().get('host') || '';
        if (sortSelect) sortSelect.value = currentParams().get('sort') || 'expiry_asc';
        clearSelection();
        await loadTable();
    });

    if (searchInput) {
        let t = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                navigate(buildPageUrl({ q: searchInput.value.trim(), page: '1' }), true);
            }, 400);
        });
    }

    if (hostSelect) {
        hostSelect.addEventListener('change', () => {
            navigate(buildPageUrl({ host: hostSelect.value, page: '1' }), true);
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            navigate(buildPageUrl({ sort: sortSelect.value, page: '1' }), true);
        });
    }

    if (selectAll) {
        selectAll.addEventListener('change', () => {
            document.querySelectorAll('.keys-row-check').forEach((cb) => {
                cb.checked = selectAll.checked;
                const id = parseInt(cb.value, 10);
                if (selectAll.checked) selected.add(id);
                else selected.delete(id);
            });
            selectAll.indeterminate = false;
            updateBulkBar();
        });
    }

    document.getElementById('keys-bulk-clear-btn')?.addEventListener('click', clearSelection);

    document.getElementById('keys-bulk-extend-btn')?.addEventListener('click', () => {
        if (!selected.size) return;
        if (typeof openModal === 'function') openModal('keysBulkModal');
    });

    document.querySelectorAll('.keys-bulk-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('keys-bulk-delta');
            if (input) input.value = btn.dataset.days || '30';
        });
    });

    document.getElementById('keys-bulk-confirm-extend')?.addEventListener('click', async () => {
        const delta = parseInt(document.getElementById('keys-bulk-delta')?.value || '0', 10);
        if (!delta) {
            if (typeof showToast === 'function') showToast('warning', 'Укажите количество дней');
            return;
        }
        const btn = document.getElementById('keys-bulk-confirm-extend');
        const prog = document.getElementById('keys-bulk-progress');
        const fill = document.getElementById('keys-bulk-progress-fill');
        const progText = document.getElementById('keys-bulk-progress-text');
        if (btn) btn.disabled = true;
        prog?.classList.remove('hidden');
        if (progText) progText.textContent = 'Обработка…';
        if (fill) fill.style.width = '40%';
        try {
            const data = await postBulk('extend', { delta_days: delta });
            if (fill) fill.style.width = '100%';
            const msg = `Готово: ${data.success_count || 0} OK` + (data.failed_count ? `, ошибок: ${data.failed_count}` : '');
            if (progText) progText.textContent = msg;
            if (typeof showToast === 'function') showToast(data.failed_count ? 'warning' : 'success', msg);
            if (typeof closeModal === 'function') closeModal('keysBulkModal');
            clearSelection();
            await loadTable();
        } catch (err) {
            if (typeof showToast === 'function') showToast('danger', err.message || 'Ошибка');
        } finally {
            if (btn) btn.disabled = false;
            setTimeout(() => prog?.classList.add('hidden'), 1200);
            if (fill) fill.style.width = '0%';
        }
    });

    document.getElementById('keys-bulk-delete-btn')?.addEventListener('click', async () => {
        if (!selected.size) return;
        const n = selected.size;
        const run = async () => {
            try {
                const data = await postBulk('delete', {});
                const msg = `Удалено: ${data.success_count || 0}` + (data.failed_count ? `, ошибок: ${data.failed_count}` : '');
                if (typeof showToast === 'function') showToast(data.failed_count ? 'warning' : 'success', msg);
                clearSelection();
                await loadTable();
            } catch (err) {
                if (typeof showToast === 'function') showToast('danger', err.message || 'Ошибка');
            }
        };
        if (typeof showConfirmModal === 'function') {
            showConfirmModal(`Удалить ${n} ключ(ей)? Действие необратимо.`, run);
        } else if (window.confirm(`Удалить ${n} ключ(ей)?`)) {
            await run();
        }
    });

    if (createToggle && createPanel) {
        if (new URLSearchParams(window.location.search).has('user_id')) {
            createPanel.classList.add('is-open');
        }
        createToggle.addEventListener('click', () => {
            createPanel.classList.toggle('is-open');
        });
    }

    function closeDrawer() {
        drawer?.classList.remove('is-open');
        drawer?.setAttribute('aria-hidden', 'true');
    }

    function statusLabel(code) {
        const map = { active: 'Активен', expiring: 'Истекает ≤7 дн.', expired: 'Истёк', gift: 'Gift' };
        return map[code] || code || '—';
    }

    function openDrawer(btn) {
        if (!drawer) return;
        const map = {
            'drawer-key-id': btn.dataset.keyId,
            'drawer-status': statusLabel(btn.dataset.status),
            'drawer-user': btn.dataset.user,
            'drawer-host': btn.dataset.host,
            'drawer-email': btn.dataset.email,
            'drawer-uuid': btn.dataset.uuid,
            'drawer-expires': btn.dataset.expires,
            'drawer-created': btn.dataset.created,
            'drawer-sub': btn.dataset.sub,
            'drawer-comment': btn.dataset.comment || '—',
            'drawer-user-comment': btn.dataset.userComment || '—',
        };
        Object.entries(map).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val || '—';
        });
        const copyBtn = document.getElementById('drawer-copy-sub');
        if (copyBtn) copyBtn.dataset.key = btn.dataset.sub || '';
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
    }

    document.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.btn-view-key');
        if (viewBtn) {
            e.preventDefault();
            openDrawer(viewBtn);
            return;
        }
        if (e.target.closest('[data-keys-drawer-close]')) closeDrawer();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer();
    });

    document.getElementById('drawer-copy-sub')?.addEventListener('click', function () {
        if (typeof window.copyKey === 'function') window.copyKey(this);
    });

    document.querySelectorAll('.keys-host-row[data-host]').forEach((row) => {
        const go = () => {
            const host = row.dataset.host;
            if (!host || host === '—') return;
            if (hostSelect) hostSelect.value = host;
            navigate(buildPageUrl({ host, page: '1' }), true);
        };
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
            }
        });
    });

    syncFetchUrls();
    setActiveFilters();
    loadTable();

    if (tbody?.dataset.fetchInterval) {
        const ms = parseInt(tbody.dataset.fetchInterval, 10);
        if (ms > 0) setInterval(loadTable, ms);
    }
})();
