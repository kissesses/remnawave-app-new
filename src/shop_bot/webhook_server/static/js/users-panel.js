(function () {
    'use strict';

    const listEl = document.getElementById('users-list');
    if (!listEl) return;

    const LS_KEY = 'users_open_keys_ids';

    function loadOpenSet() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return new Set(raw ? JSON.parse(raw) : []);
        } catch (_) {
            return new Set();
        }
    }

    function saveOpenSet(set) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
        } catch (_) { /* ignore */ }
    }

    const openSet = loadOpenSet();

    function getKeysPanel(uid) {
        return document.getElementById('keys-' + uid);
    }

    async function ensureKeysLoaded(uid) {
        const panel = getKeysPanel(uid);
        if (!panel) return;
        const body = panel.querySelector('[data-lazy="keys"]');
        if (!body || body.getAttribute('data-loaded') === '1') return;
        const src = panel.getAttribute('data-src');
        if (!src) return;
        try {
            const resp = await fetch(src, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
            if (resp.ok) {
                body.innerHTML = await resp.text();
                body.setAttribute('data-loaded', '1');
            }
        } catch (_) { /* ignore */ }
    }

    function openKeysForUid(uid) {
        const panel = getKeysPanel(uid);
        if (!panel) return;
        panel.classList.remove('hidden');
        openSet.add(String(uid));
        saveOpenSet(openSet);
    }

    function closeKeysForUid(uid) {
        const panel = getKeysPanel(uid);
        if (!panel) return;
        panel.classList.add('hidden');
        openSet.delete(String(uid));
        saveOpenSet(openSet);
    }

    function restoreOpenedKeys() {
        openSet.forEach((uid) => {
            const panel = getKeysPanel(uid);
            if (panel) panel.classList.remove('hidden');
        });
    }

    window.usersPanelRestoreKeys = restoreOpenedKeys;

    const avatarPending = new Set();

    function applyAvatarToWrap(wrap, url) {
        const img = wrap.querySelector('.users-card__avatar-img');
        if (!img || !url) return;
        img.onload = () => {
            wrap.classList.add('has-photo');
            img.hidden = false;
        };
        img.onerror = () => {
            img.hidden = true;
            wrap.classList.remove('has-photo');
        };
        img.src = url;
    }

    async function loadAvatarsForCards(wraps) {
        const targets = (wraps || []).filter((w) => w?.dataset?.uid && !w.dataset.avatarChecked);
        if (!targets.length) return;

        targets.forEach((w) => { w.dataset.avatarChecked = '1'; });
        const ids = targets.map((w) => parseInt(w.dataset.uid, 10)).filter((id) => id > 0);
        if (!ids.length) return;

        const batchKey = ids.join(',');
        if (avatarPending.has(batchKey)) return;
        avatarPending.add(batchKey);

        try {
            const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
            const res = await fetch('/users/avatars/check.json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRFToken': csrf,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ ids }),
            });
            if (!res.ok) return;
            const data = await res.json();
            const map = data.avatars || {};
            targets.forEach((wrap) => {
                const url = map[String(wrap.dataset.uid)];
                if (url) applyAvatarToWrap(wrap, url);
            });
        } catch (_) { /* ignore */ } finally {
            avatarPending.delete(batchKey);
        }
    }

    let avatarObserver = null;
    function initAvatarObserver() {
        if (avatarObserver) avatarObserver.disconnect();
        if (!('IntersectionObserver' in window)) {
            loadAvatarsForCards([...listEl.querySelectorAll('.users-card__avatar-wrap[data-uid]')]);
            return;
        }
        avatarObserver = new IntersectionObserver((entries) => {
            const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target);
            if (visible.length) loadAvatarsForCards(visible);
        }, { rootMargin: '120px' });
        listEl.querySelectorAll('.users-card__avatar-wrap[data-uid]').forEach((el) => {
            avatarObserver.observe(el);
        });
    }

    window.usersPanelLoadAvatars = () => {
        listEl.querySelectorAll('.users-card__avatar-wrap[data-uid]').forEach((el) => {
            delete el.dataset.avatarChecked;
        });
        initAvatarObserver();
        loadAvatarsForCards([...listEl.querySelectorAll('.users-card__avatar-wrap[data-uid]')]);
    };

    const loadList = async () => {
        const url = new URL(listEl.dataset.fetchUrl, location.origin);
        const params = new URLSearchParams(location.search);
        ['filter', 'page', 'q', 'per_page'].forEach((k) => {
            if (params.has(k)) url.searchParams.set(k, params.get(k));
        });
        listEl.dataset.fetchUrl = url.toString();
        try {
            listEl.style.opacity = '0.55';
            const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!res.ok) return;
            const data = await res.json();
            listEl.innerHTML = data.table_html || '';
            const pag = document.getElementById('users-pagination');
            if (pag) pag.innerHTML = data.pagination_html || '';
            restoreOpenedKeys();
            initAvatarObserver();
            loadAvatarsForCards([...listEl.querySelectorAll('.users-card__avatar-wrap[data-uid]')]);
        } catch (e) {
            console.error('Users list load failed', e);
            listEl.innerHTML = '<div class="users-empty"><span class="material-symbols-outlined">error</span><p>Ошибка загрузки</p></div>';
        } finally {
            listEl.style.opacity = '1';
        }
    };

    window.usersPanelReload = loadList;

    document.addEventListener('click', (e) => {
        const link = e.target.closest('.ajax-nav');
        if (!link || !link.closest('.users-page')) return;
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;
        history.pushState(null, '', href);
        const current = new URL(href, location.origin).searchParams.get('filter') || 'all';
        document.querySelectorAll('.users-filter').forEach((chip) => {
            chip.classList.toggle('is-active', (chip.dataset.filter || '') === current);
        });
        loadList();
    });

    const searchForm = document.getElementById('users-search-form');
    if (searchForm) {
        const input = searchForm.querySelector('input[name="q"]');
        const clearBtn = document.getElementById('search-clear');
        const toggleClear = () => {
            if (clearBtn) clearBtn.classList.toggle('hidden', !(input && input.value));
        };
        if (input) {
            input.addEventListener('input', toggleClear);
            toggleClear();
        }
        clearBtn?.addEventListener('click', () => {
            if (input) {
                input.value = '';
                toggleClear();
                input.focus();
            }
            searchForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
        let debounce = null;
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                const q = input?.value?.trim() || '';
                const filter = new URLSearchParams(location.search).get('filter') || 'all';
                const url = new URL('/users', location.origin);
                if (filter && filter !== 'all') url.searchParams.set('filter', filter);
                if (q) url.searchParams.set('q', q);
                history.pushState(null, '', url);
                loadList();
            }, 350);
        });
    }

    listEl.addEventListener('click', (e) => {
        const keysBtn = e.target.closest('[data-toggle="keys"]');
        if (keysBtn) {
            e.preventDefault();
            const uid = keysBtn.getAttribute('data-user');
            const panel = getKeysPanel(uid);
            if (!panel) return;
            if (panel.classList.contains('hidden')) {
                openKeysForUid(uid);
                ensureKeysLoaded(uid);
            } else {
                closeKeysForUid(uid);
            }
        }
    });

    loadList();
    const interval = parseInt(listEl.dataset.fetchInterval || '120000', 10);
    if (interval > 0) setInterval(loadList, interval);
    window.addEventListener('popstate', () => location.reload());
})();
