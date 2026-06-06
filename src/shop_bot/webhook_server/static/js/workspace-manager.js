(function () {
    'use strict';

    const STORAGE_KEY = 'workspace:v1';
    const MIN_W = 280;
    const MIN_H = 200;
    const TITLEBAR_H = 38;
    const DOCK_H = 88;
    const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

    const WALLPAPER_PRESETS = {
        aurora: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
        sunset: 'linear-gradient(145deg, #2d1b4e 0%, #8b3a62 50%, #e8a87c 100%)',
        ocean: 'linear-gradient(145deg, #0c1445 0%, #1a5276 50%, #48c9b0 100%)',
        midnight: 'linear-gradient(145deg, #0d0d0d 0%, #1a1a2e 50%, #2d2d44 100%)',
        light: 'linear-gradient(145deg, #e8e8ed 0%, #f2f2f7 50%, #d1d1d6 100%)',
    };

    const DEFAULT_STATE = {
        wallpaper: { type: 'gradient', value: 'aurora', blur: 0 },
        logo: { url: '', size: 'md', visible: true },
        dock: { order: null, hidden: [] },
        windows: [],
    };

    let state = loadState();
    let enabled = false;
    let isHost = false;
    let dockEditMode = false;
    let zTop = 10;
    let dragState = null;
    let resizeState = null;
    let pendingDesktop = null;

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULT_STATE);
            const parsed = JSON.parse(raw);
            return {
                ...structuredClone(DEFAULT_STATE),
                ...parsed,
                wallpaper: normalizeWallpaper({ ...DEFAULT_STATE.wallpaper, ...(parsed.wallpaper || {}) }),
                logo: { ...DEFAULT_STATE.logo, ...(parsed.logo || {}) },
                dock: { ...DEFAULT_STATE.dock, ...(parsed.dock || {}) },
                windows: Array.isArray(parsed.windows) ? parsed.windows : [],
            };
        } catch {
            return structuredClone(DEFAULT_STATE);
        }
    }

    function saveState() {
        state.wallpaper = normalizeWallpaper(state.wallpaper);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        syncToServerDebounced();
    }

    function syncToServerNow() {
        clearTimeout(syncTimer);
        const token = document.querySelector('meta[name="csrf-token"]')?.content;
        if (!token) return Promise.resolve();
        return fetch('/settings/workspace/prefs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': token,
                Accept: 'application/json',
            },
            body: JSON.stringify({ prefs: state }),
        }).catch(() => {});
    }

    let syncTimer = null;
    function syncToServerDebounced() {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            const token = document.querySelector('meta[name="csrf-token"]')?.content;
            if (!token) return;
            fetch('/settings/workspace/prefs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': token,
                    Accept: 'application/json',
                },
                body: JSON.stringify({ prefs: state }),
            }).catch(() => {});
        }, 800);
    }

    function loadFromServer() {
        return fetch('/settings/workspace/prefs', { headers: { Accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.ok && data.prefs && typeof data.prefs === 'object') {
                    state = {
                        ...structuredClone(DEFAULT_STATE),
                        ...data.prefs,
                        wallpaper: normalizeWallpaper({ ...DEFAULT_STATE.wallpaper, ...(data.prefs.wallpaper || {}) }),
                        logo: { ...DEFAULT_STATE.logo, ...(data.prefs.logo || {}) },
                        dock: { ...DEFAULT_STATE.dock, ...(data.prefs.dock || {}) },
                        windows: Array.isArray(data.prefs.windows) ? data.prefs.windows : [],
                    };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                }
            })
            .catch(() => {});
    }

    function getDockRegistry() {
        return window.WORKSPACE_DOCK_ITEMS || [];
    }

    function getDockItem(id) {
        return getDockRegistry().find(i => i.id === id);
    }

    function routeForDockId(id) {
        const item = getDockItem(id);
        return item?.route || '/dashboard';
    }

    function normalizeRoute(route) {
        if (!route) return '/dashboard';
        try {
            const u = new URL(route, window.location.origin);
            return u.pathname.replace(/\/+$/, '') || '/';
        } catch {
            const p = String(route).split('?')[0];
            return p.startsWith('/') ? p.replace(/\/+$/, '') || '/' : '/' + p.replace(/\/+$/, '');
        }
    }

    function routesMatch(a, b) {
        return normalizeRoute(a) === normalizeRoute(b);
    }

    function getRouteFromItem(item) {
        return normalizeRoute(item?.dataset?.route || routeForDockId(item?.dataset?.dockId));
    }

    function embedUrl(route) {
        const raw = String(route || '/dashboard');
        try {
            const u = new URL(raw, window.location.origin);
            u.searchParams.set('embed', '1');
            return u.pathname + u.search;
        } catch {
            return normalizeRoute(raw) + '?embed=1';
        }
    }


    function uuid() {
        return 'ws-' + Math.random().toString(36).slice(2, 11);
    }

    function isMacosDesign() {
        const d = document.documentElement.dataset.design || '';
        return d === 'macos' || d === 'macos-v2';
    }

    function isWorkspaceDesign() {
        return document.documentElement.dataset.design === 'macos-v2';
    }

    function isEmbedPage() {
        return document.body.classList.contains('workspace-embed');
    }

    function isDashboardHostPage() {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        return path === '/dashboard' || path === '/';
    }

    function detectHost() {
        return document.body.dataset.workspaceHost === '1' || isDashboardHostPage();
    }

    function bootWorkspace() {
        if (!detectHost() || !isWorkspaceDesign()) return;
        setEnabled(true);
    }

    function setEnabled(on) {
        enabled = on && isWorkspaceDesign() && !isEmbedPage();
        isHost = detectHost();
        document.body.classList.toggle('workspace-host', enabled && isHost);
        if (enabled) {
            applyDesktop();
            renderDock();
            bindDock();
            restoreWindows();
            handleOpenQuery();
        } else {
            document.getElementById('workspace-window-layer')?.replaceChildren();
            if (!isWorkspaceDesign()) {
                document.body.classList.remove('workspace-host');
            }
        }
    }

    function normalizeWallpaper(w) {
        if (!w || typeof w !== 'object') return { ...DEFAULT_STATE.wallpaper };
        const hasImage = w.type === 'image' && String(w.value || '').trim();
        return {
            type: hasImage ? 'image' : 'gradient',
            value: hasImage ? String(w.value).trim() : (w.value || 'aurora'),
            blur: Math.max(0, Math.min(24, Number(w.blur) || 0)),
        };
    }

    function applyWallpaperToElement(el, wallpaper) {
        if (!el) return;
        const w = normalizeWallpaper(wallpaper);
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';

        if (w.type === 'image') {
            el.style.backgroundColor = '#0a0a0c';
            el.style.backgroundImage = `url("${String(w.value).replace(/"/g, '%22')}")`;
        } else {
            el.style.backgroundColor = '#0a0a0c';
            el.style.backgroundImage = WALLPAPER_PRESETS[w.value] || WALLPAPER_PRESETS.aurora;
        }
    }

    function paintWallpaper(wallpaper) {
        const w = normalizeWallpaper(wallpaper);
        document.documentElement.style.setProperty('--ws-wallpaper-blur', `${w.blur}px`);
        applyWallpaperToElement(document.getElementById('workspace-desktop__wallpaper'), w);
        applyWallpaperToElement(document.getElementById('theme-ws-live-preview'), w);
    }

    function paintLogo(logo) {
        const logoEl = document.getElementById('workspace-desktop__logo');
        const logoImg = document.getElementById('workspace-desktop__logo-img');
        if (!logoEl || !logoImg) return;

        const cfg = logo || DEFAULT_STATE.logo;
        const url = cfg.url || window.APP_ICON_URL || '';
        logoEl.classList.toggle('is-hidden', cfg.visible === false || !url);
        logoEl.classList.remove('size-sm', 'size-md', 'size-lg');
        logoEl.classList.add('size-' + (cfg.size || 'md'));
        if (url) logoImg.src = url;
    }

    function applyDesktop() {
        paintWallpaper(state.wallpaper);
        paintLogo(state.logo);
    }

    function findWindowByRoute(route) {
        const norm = normalizeRoute(route);
        return state.windows.find(w => !w.closed && routesMatch(w.route, norm));
    }

    function findWindowByDockId(dockId) {
        const route = normalizeRoute(routeForDockId(dockId));
        return state.windows.find(w => routesMatch(w.route, route));
    }

    function focusWindow(id) {
        const el = document.querySelector(`.ws-window[data-window-id="${id}"]`);
        if (!el) return;
        zTop += 1;
        el.style.zIndex = String(zTop);
        document.querySelectorAll('.ws-window').forEach(w => w.classList.remove('is-focused'));
        el.classList.remove('is-minimized');
        el.classList.add('is-focused');
        const win = state.windows.find(w => w.id === id);
        if (win) {
            win.minimized = false;
            win.z = zTop;
        }
        saveState();
        updateDockRunning();
    }

    function openWindow(opts) {
        if (!enabled) return null;
        const route = normalizeRoute(opts.route || '/dashboard');
        const title = opts.title || 'Окно';
        const dockId = opts.dockId;

        let existing = findWindowByRoute(route);
        if (existing) {
            focusWindow(existing.id);
            return existing.id;
        }

        const id = uuid();
        const pad = 24 + (state.windows.length % 6) * 28;
        const win = {
            id,
            route,
            title,
            dockId: dockId || null,
            x: opts.x ?? pad,
            y: opts.y ?? (52 + pad),
            w: opts.w ?? Math.min(1100, window.innerWidth - 80),
            h: opts.h ?? Math.min(720, window.innerHeight - 120),
            minimized: false,
            maximized: false,
            prevBounds: null,
            z: ++zTop,
        };
        state.windows.push(win);
        saveState();
        mountWindow(win);
        focusWindow(id);
        return id;
    }

    function closeWindow(id) {
        state.windows = state.windows.filter(w => w.id !== id);
        saveState();
        document.querySelector(`.ws-window[data-window-id="${id}"]`)?.remove();
        updateDockRunning();
    }

    function minimizeWindow(id) {
        const win = state.windows.find(w => w.id === id);
        if (!win) return;
        win.minimized = true;
        saveState();
        const el = document.querySelector(`.ws-window[data-window-id="${id}"]`);
        el?.classList.add('is-minimized');
        el?.classList.remove('is-focused');
        updateDockRunning();
    }

    function toggleMaximize(id) {
        const win = state.windows.find(w => w.id === id);
        const el = document.querySelector(`.ws-window[data-window-id="${id}"]`);
        if (!win || !el) return;

        if (win.maximized) {
            win.maximized = false;
            el.classList.remove('is-maximized');
            if (win.prevBounds) {
                Object.assign(win, win.prevBounds);
                win.prevBounds = null;
            }
            applyWindowBounds(el, win);
        } else {
            win.prevBounds = { x: win.x, y: win.y, w: win.w, h: win.h };
            win.maximized = true;
            win.x = 0;
            win.y = 38;
            win.w = window.innerWidth;
            win.h = window.innerHeight - TITLEBAR_H - DOCK_H;
            el.classList.add('is-maximized');
            applyWindowBounds(el, win);
        }
        saveState();
        focusWindow(id);
    }

    function workspaceLimits() {
        return {
            minX: 0,
            minY: TITLEBAR_H,
            maxRight: window.innerWidth,
            maxBottom: window.innerHeight - DOCK_H,
        };
    }

    function applyResizeDelta(win, edge, dx, dy, orig) {
        let x = orig.x;
        let y = orig.y;
        let w = orig.w;
        let h = orig.h;
        const lim = workspaceLimits();

        if (edge.includes('e')) {
            w = Math.max(MIN_W, orig.w + dx);
            w = Math.min(w, lim.maxRight - orig.x);
        }
        if (edge.includes('w')) {
            const nextW = orig.w - dx;
            if (nextW >= MIN_W) {
                w = nextW;
                x = orig.x + dx;
            } else {
                w = MIN_W;
                x = orig.x + orig.w - MIN_W;
            }
            if (x < lim.minX) {
                w -= lim.minX - x;
                x = lim.minX;
            }
            w = Math.max(MIN_W, w);
        }
        if (edge.includes('s')) {
            h = Math.max(MIN_H, orig.h + dy);
            h = Math.min(h, lim.maxBottom - orig.y);
        }
        if (edge.includes('n')) {
            const nextH = orig.h - dy;
            if (nextH >= MIN_H) {
                h = nextH;
                y = orig.y + dy;
            } else {
                h = MIN_H;
                y = orig.y + orig.h - MIN_H;
            }
            if (y < lim.minY) {
                h -= lim.minY - y;
                y = lim.minY;
            }
            h = Math.max(MIN_H, h);
        }

        win.x = x;
        win.y = y;
        win.w = w;
        win.h = h;
    }

    function applyWindowBounds(el, win) {
        el.style.left = win.x + 'px';
        el.style.top = win.y + 'px';
        el.style.width = win.w + 'px';
        el.style.height = win.h + 'px';
        if (win.z) el.style.zIndex = String(win.z);
    }

    function mountWindow(win) {
        const layer = document.getElementById('workspace-window-layer');
        if (!layer) return;

        const el = document.createElement('div');
        el.className = 'ws-window is-focused';
        el.dataset.windowId = win.id;
        el.innerHTML = `
            <div class="ws-window__titlebar" data-drag-handle>
                <div class="ws-window__lights">
                    <button type="button" class="ws-window__light ws-window__light--close" data-action="close" aria-label="Закрыть"></button>
                    <button type="button" class="ws-window__light ws-window__light--minimize" data-action="minimize" aria-label="Свернуть"></button>
                    <button type="button" class="ws-window__light ws-window__light--maximize" data-action="maximize" aria-label="Развернуть"></button>
                </div>
                <span class="ws-window__title"></span>
                <span style="width:52px;flex-shrink:0"></span>
            </div>
            <div class="ws-window__body">
                <iframe class="ws-window__iframe" title="" loading="lazy"></iframe>
            </div>
            ${RESIZE_HANDLES.map(edge => `<div class="ws-window__resize ws-window__resize--${edge}" data-resize="${edge}"></div>`).join('')}
        `;

        el.querySelector('.ws-window__title').textContent = win.title;
        const iframe = el.querySelector('.ws-window__iframe');
        iframe.title = win.title;
        iframe.src = embedUrl(win.route);

        applyWindowBounds(el, win);
        if (win.minimized) el.classList.add('is-minimized');

        el.addEventListener('mousedown', () => focusWindow(win.id));
        el.querySelector('[data-action="close"]')?.addEventListener('click', e => {
            e.stopPropagation();
            closeWindow(win.id);
        });
        el.querySelector('[data-action="minimize"]')?.addEventListener('click', e => {
            e.stopPropagation();
            minimizeWindow(win.id);
        });
        el.querySelector('[data-action="maximize"]')?.addEventListener('click', e => {
            e.stopPropagation();
            toggleMaximize(win.id);
        });

        const handle = el.querySelector('[data-drag-handle]');
        handle?.addEventListener('pointerdown', e => startDrag(e, win.id));
        el.querySelectorAll('[data-resize]').forEach(r => {
            r.addEventListener('pointerdown', e => startResize(e, win.id, r.dataset.resize));
        });

        layer.appendChild(el);
    }

    function startDrag(e, id) {
        if (e.target.closest('button')) return;
        const win = state.windows.find(w => w.id === id);
        const el = document.querySelector(`.ws-window[data-window-id="${id}"]`);
        if (!win || !el || win.maximized) return;
        e.preventDefault();
        dragState = { id, startX: e.clientX, startY: e.clientY, origX: win.x, origY: win.y };
        el.classList.add('is-dragging');
        el.setPointerCapture?.(e.pointerId);
        document.body.classList.add('ws-window-interacting');
        document.addEventListener('pointermove', onDragMove);
        document.addEventListener('pointerup', onDragEnd);
        focusWindow(id);
    }

    function onDragMove(e) {
        if (!dragState) return;
        const win = state.windows.find(w => w.id === dragState.id);
        const el = document.querySelector(`.ws-window[data-window-id="${dragState.id}"]`);
        if (!win || !el) return;
        win.x = Math.max(0, Math.min(dragState.origX + (e.clientX - dragState.startX), window.innerWidth - win.w));
        win.y = Math.max(TITLEBAR_H, Math.min(dragState.origY + (e.clientY - dragState.startY), window.innerHeight - DOCK_H - win.h));
        applyWindowBounds(el, win);
    }

    function onDragEnd(e) {
        if (dragState) {
            const el = document.querySelector(`.ws-window[data-window-id="${dragState.id}"]`);
            el?.classList.remove('is-dragging');
            if (e?.pointerId != null) el?.releasePointerCapture?.(e.pointerId);
            saveState();
        }
        dragState = null;
        document.body.classList.remove('ws-window-interacting');
        document.removeEventListener('pointermove', onDragMove);
        document.removeEventListener('pointerup', onDragEnd);
    }

    function startResize(e, id, edge) {
        const win = state.windows.find(w => w.id === id);
        const el = document.querySelector(`.ws-window[data-window-id="${id}"]`);
        if (!win || !el || win.maximized) return;
        e.preventDefault();
        e.stopPropagation();
        resizeState = {
            id,
            edge,
            startX: e.clientX,
            startY: e.clientY,
            orig: { x: win.x, y: win.y, w: win.w, h: win.h },
        };
        el.classList.add('is-resizing');
        el.setPointerCapture?.(e.pointerId);
        document.body.classList.add('ws-window-interacting');
        document.addEventListener('pointermove', onResizeMove);
        document.addEventListener('pointerup', onResizeEnd);
        focusWindow(id);
    }

    function onResizeMove(e) {
        if (!resizeState) return;
        const win = state.windows.find(w => w.id === resizeState.id);
        const el = document.querySelector(`.ws-window[data-window-id="${resizeState.id}"]`);
        if (!win || !el) return;
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        applyResizeDelta(win, resizeState.edge, dx, dy, resizeState.orig);
        applyWindowBounds(el, win);
    }

    function onResizeEnd(e) {
        if (resizeState) {
            const el = document.querySelector(`.ws-window[data-window-id="${resizeState.id}"]`);
            el?.classList.remove('is-resizing');
            if (e?.pointerId != null) el?.releasePointerCapture?.(e.pointerId);
            saveState();
        }
        resizeState = null;
        document.body.classList.remove('ws-window-interacting');
        document.removeEventListener('pointermove', onResizeMove);
        document.removeEventListener('pointerup', onResizeEnd);
    }

    function restoreWindows() {
        const layer = document.getElementById('workspace-window-layer');
        if (layer) layer.replaceChildren();
        state.windows.forEach(win => {
            if (win.route) win.route = normalizeRoute(win.route);
            mountWindow(win);
        });
        const maxZ = state.windows.reduce((m, w) => Math.max(m, w.z || 0), zTop);
        zTop = Math.max(zTop, maxZ);
        updateDockRunning();
        const top = state.windows.filter(w => !w.minimized).sort((a, b) => (b.z || 0) - (a.z || 0))[0];
        if (top) focusWindow(top.id);
    }

    function updateDockRunning() {
        document.querySelectorAll('.panel-dock__item[data-dock-id]').forEach(item => {
            const route = getRouteFromItem(item);
            const running = state.windows.some(w => !w.minimized && routesMatch(w.route, route));
            item.classList.toggle('is-running', running);
        });
        const hint = document.getElementById('workspace-desktop__hint');
        if (hint) {
            const anyOpen = state.windows.some(w => !w.minimized);
            hint.classList.toggle('hidden', anyOpen);
        }
    }

    function getOrderedDockIds() {
        const registry = getDockRegistry().map(i => i.id);
        const order = state.dock?.order?.length ? state.dock.order : registry;
        const hidden = new Set(state.dock?.hidden || []);
        const seen = new Set();
        const result = [];
        order.forEach(id => {
            if (registry.includes(id) && !hidden.has(id) && !seen.has(id)) {
                result.push(id);
                seen.add(id);
            }
        });
        registry.forEach(id => {
            if (!seen.has(id) && !hidden.has(id)) result.push(id);
        });
        return result;
    }

    function createDockItemElement(meta) {
        const a = document.createElement('a');
        a.href = meta.route;
        a.className = 'panel-dock__item';
        a.dataset.dock = meta.id;
        a.dataset.dockId = meta.id;
        a.dataset.route = meta.route;
        a.dataset.windowTitle = meta.label;
        a.title = meta.label;
        a.setAttribute('aria-label', meta.label);
        const badge = meta.id === 'support'
            ? '<span id="dock-support-badge" class="panel-dock__badge hidden"></span>'
            : '';
        a.innerHTML = `
            <span class="panel-dock__icon">
                <span class="material-symbols-outlined">${meta.icon}</span>
                ${badge}
            </span>
            <span class="panel-dock__label">${meta.label}</span>
            <span class="panel-dock__dot" aria-hidden="true"></span>
        `;
        return a;
    }

    function renderDock() {
        const inner = document.querySelector('.panel-dock__inner');
        if (!inner || !enabled) return;

        const footer = inner.querySelector('.panel-dock__footer');
        const divider = inner.querySelector('.panel-dock__divider');
        const settings = inner.querySelector('.panel-dock__item[data-dock-id="settings"]');
        const byId = {};
        inner.querySelectorAll('.panel-dock__item[data-dock-id]').forEach(el => {
            byId[el.dataset.dockId] = el;
        });

        getDockRegistry().forEach(meta => {
            if (!byId[meta.id]) {
                byId[meta.id] = createDockItemElement(meta);
            }
        });

        const order = getOrderedDockIds();
        const hidden = new Set(state.dock?.hidden || []);

        order.forEach(id => {
            if (id === 'settings') return;
            const el = byId[id];
            if (el) {
                el.classList.toggle('is-dock-hidden', hidden.has(id));
                inner.appendChild(el);
            }
        });

        hidden.forEach(id => {
            if (id === 'settings') return;
            const el = byId[id];
            if (el) el.classList.add('is-dock-hidden');
        });

        if (divider) inner.appendChild(divider);
        const settingsEl = byId.settings || settings;
        if (settingsEl) {
            settingsEl.classList.toggle('is-dock-hidden', hidden.has('settings'));
            inner.appendChild(settingsEl);
        }
        if (footer) inner.appendChild(footer);

        bindDock();
    }

    function bindDockControls() {
        const editBtn = document.getElementById('workspace-dock-edit-btn');
        const editorBtn = document.getElementById('workspace-dock-editor-open');

        if (editBtn && !editBtn.dataset.wsBound) {
            editBtn.dataset.wsBound = '1';
            editBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (!enabled) return;
                dockEditMode = !dockEditMode;
                document.querySelector('.panel-dock')?.classList.toggle('is-edit-mode', dockEditMode);
                if (dockEditMode) initDockDragReorder();
                else teardownDockDragReorder();
            });
        }

        if (editorBtn && !editorBtn.dataset.wsBound) {
            editorBtn.dataset.wsBound = '1';
            editorBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (!enabled) return;
                if (typeof window.openModal === 'function') window.openModal('workspaceDockModal');
                renderDockEditor();
            });
        }
    }

    function bindDock() {
        bindDockControls();
        document.querySelectorAll('.panel-dock__item[data-dock-id]').forEach(item => {
            if (item.dataset.wsBound) return;
            item.dataset.wsBound = '1';
            item.addEventListener('click', e => {
                if (!enabled || dockEditMode) return;
                const id = item.dataset.dockId;
                if (!id) return;
                e.preventDefault();
                const route = getRouteFromItem(item);
                const meta = getDockItem(id);
                const existing = findWindowByRoute(route);
                if (existing?.minimized) {
                    focusWindow(existing.id);
                    return;
                }
                if (existing) {
                    focusWindow(existing.id);
                    return;
                }
                openWindow({ route, title: meta?.label || item.dataset.windowTitle || id, dockId: id });
            });
        });
    }

    let dockSortable = null;
    function initDockDragReorder() {
        const inner = document.querySelector('.panel-dock__inner');
        if (!inner) return;
        inner.querySelectorAll('.panel-dock__item[data-dock-id]').forEach(item => {
            item.draggable = true;
            item.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', item.dataset.dockId);
                item.classList.add('is-dragging');
            });
            item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
            item.addEventListener('dragover', e => e.preventDefault());
            item.addEventListener('drop', e => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData('text/plain');
                const toId = item.dataset.dockId;
                if (!fromId || !toId || fromId === toId) return;
                const order = getOrderedDockIds();
                const fi = order.indexOf(fromId);
                const ti = order.indexOf(toId);
                if (fi < 0 || ti < 0) return;
                order.splice(fi, 1);
                order.splice(ti, 0, fromId);
                state.dock.order = order;
                saveState();
                renderDock();
            });
        });
    }

    function teardownDockDragReorder() {
        document.querySelectorAll('.panel-dock__item[data-dock-id]').forEach(item => {
            item.draggable = false;
        });
    }

    function renderDockEditor() {
        const list = document.getElementById('ws-dock-editor-list');
        if (!list) return;
        list.replaceChildren();
        const order = getOrderedDockIds().concat(
            (state.dock?.hidden || []).filter(id => getDockItem(id))
        );
        const allIds = [...new Set([...order, ...getDockRegistry().map(i => i.id)])];
        const hidden = new Set(state.dock?.hidden || []);

        allIds.forEach(id => {
            const meta = getDockItem(id);
            if (!meta) return;
            const row = document.createElement('div');
            row.className = 'ws-dock-editor-item' + (hidden.has(id) ? ' is-hidden-item' : '');
            row.dataset.dockId = id;
            row.innerHTML = `
                <span class="material-symbols-outlined ws-dock-editor-item__drag">drag_indicator</span>
                <span class="ws-dock-editor-item__icon"><span class="material-symbols-outlined">${meta.icon}</span></span>
                <span class="flex-1 text-sm font-semibold text-white">${meta.label}</span>
                <label class="flex items-center gap-1 text-[10px] text-white/50 uppercase font-bold cursor-pointer">
                    <input type="checkbox" class="ws-dock-vis" ${hidden.has(id) ? '' : 'checked'} />
                    Показать
                </label>
            `;
            row.querySelector('.ws-dock-vis')?.addEventListener('change', ev => {
                const hid = new Set(state.dock.hidden || []);
                if (ev.target.checked) hid.delete(id);
                else hid.add(id);
                state.dock.hidden = [...hid];
                saveState();
                renderDock();
                renderDockEditor();
            });
            list.appendChild(row);
        });

        document.getElementById('ws-dock-editor-save')?.addEventListener('click', () => {
            if (typeof window.closeModal === 'function') window.closeModal('workspaceDockModal');
            dockEditMode = false;
            document.querySelector('.panel-dock')?.classList.remove('is-edit-mode');
        }, { once: true });
    }

    function handleOpenQuery() {
        const params = new URLSearchParams(window.location.search);
        const open = params.get('ws_open');
        if (!open) return;
        const route = normalizeRoute(open.startsWith('/') ? open : '/' + open);
        const item = getDockRegistry().find(i => routesMatch(i.route, route));
        openWindow({ route, title: item?.label || 'Окно', dockId: item?.id });
        params.delete('ws_open');
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }

    function redirectToDesktopIfNeeded() {
        if (!isWorkspaceDesign() || isEmbedPage()) return;
        const path = window.location.pathname;
        if (path === '/dashboard' || path === '/') return;
        const item = getDockRegistry().find(i => {
            try {
                const u = new URL(i.route, window.location.origin);
                return u.pathname === path;
            } catch {
                return false;
            }
        });
        if (item) {
            window.location.replace('/dashboard?ws_open=' + encodeURIComponent(item.route));
        }
    }

    function getPendingDesktop() {
        if (!pendingDesktop) {
            pendingDesktop = {
                wallpaper: { ...state.wallpaper },
                logo: { ...state.logo },
            };
        }
        return pendingDesktop;
    }

    function initDesktopForm() {
        document.querySelectorAll('[data-ws-wallpaper]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-ws-wallpaper]').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');
                const p = getPendingDesktop();
                p.wallpaper = { type: 'gradient', value: btn.dataset.wsWallpaper, blur: p.wallpaper?.blur || 0 };
                const urlInput = document.getElementById('ws-wallpaper-url');
                if (urlInput) urlInput.value = '';
                applyDesktopPreview(p);
            });
        });

        const urlInput = document.getElementById('ws-wallpaper-url');
        const logoInput = document.getElementById('ws-logo-url');
        const logoVis = document.getElementById('ws-logo-visible');
        const logoSize = document.getElementById('ws-logo-size');
        const blurRange = document.getElementById('ws-wallpaper-blur');

        urlInput?.addEventListener('input', () => {
            const p = getPendingDesktop();
            const val = urlInput.value.trim();
            if (val) {
                p.wallpaper = { type: 'image', value: val, blur: p.wallpaper?.blur || 0 };
                document.querySelectorAll('[data-ws-wallpaper]').forEach(b => b.classList.remove('is-active'));
            } else {
                const active = document.querySelector('[data-ws-wallpaper].is-active');
                const presetVal = active?.dataset.wsWallpaper || state.wallpaper?.value || 'aurora';
                p.wallpaper = { type: 'gradient', value: presetVal, blur: p.wallpaper?.blur || 0 };
            }
            applyDesktopPreview(p);
        });
        logoInput?.addEventListener('input', () => {
            const p = getPendingDesktop();
            p.logo = { ...p.logo, url: logoInput.value.trim() };
            applyDesktopPreview(p);
        });
        logoVis?.addEventListener('change', () => {
            const p = getPendingDesktop();
            p.logo = { ...p.logo, visible: logoVis.checked };
            applyDesktopPreview(p);
        });
        logoSize?.addEventListener('change', () => {
            const p = getPendingDesktop();
            p.logo = { ...p.logo, size: logoSize.value };
            applyDesktopPreview(p);
        });
        blurRange?.addEventListener('input', () => {
            const lbl = document.getElementById('ws-blur-label');
            if (lbl) lbl.textContent = blurRange.value;
            const p = getPendingDesktop();
            p.wallpaper = { ...p.wallpaper, blur: parseInt(blurRange.value, 10) || 0 };
            applyDesktopPreview(p);
        });
    }

    function ensureDesktopLayerVisible() {
        if (!isWorkspaceDesign()) return;
        document.body.classList.add('workspace-host');
    }

    function applyDesktopPreview(preview) {
        ensureDesktopLayerVisible();
        paintWallpaper(preview.wallpaper);
        paintLogo(preview.logo);
    }

    function commitDesktopFromModal() {
        if (pendingDesktop) {
            state.wallpaper = normalizeWallpaper(pendingDesktop.wallpaper);
            state.logo = { ...pendingDesktop.logo };
        }
        pendingDesktop = null;
        saveState();
        applyDesktop();
        syncToServerNow();
    }

    function resetDesktopPreview() {
        pendingDesktop = null;
        applyDesktop();
    }

    function syncDesktopFormFromState() {
        pendingDesktop = {
            wallpaper: normalizeWallpaper(state.wallpaper),
            logo: { ...state.logo },
        };
        const w = pendingDesktop.wallpaper;
        document.querySelectorAll('[data-ws-wallpaper]').forEach(b => {
            b.classList.toggle('is-active', w.type === 'gradient' && b.dataset.wsWallpaper === w.value);
        });
        const urlInput = document.getElementById('ws-wallpaper-url');
        if (urlInput) urlInput.value = w.type === 'image' ? w.value : '';
        const logoInput = document.getElementById('ws-logo-url');
        if (logoInput) logoInput.value = state.logo?.url || '';
        const logoVis = document.getElementById('ws-logo-visible');
        if (logoVis) logoVis.checked = state.logo?.visible !== false;
        const logoSize = document.getElementById('ws-logo-size');
        if (logoSize) logoSize.value = state.logo?.size || 'md';
        const blurRange = document.getElementById('ws-wallpaper-blur');
        if (blurRange) blurRange.value = String(w.blur || 0);
        const blurLbl = document.getElementById('ws-blur-label');
        if (blurLbl) blurLbl.textContent = String(w.blur || 0);
        applyDesktopPreview(pendingDesktop);
    }

    function init() {
        isHost = detectHost();
        redirectToDesktopIfNeeded();

        loadFromServer().finally(bootWorkspace);

        initDesktopForm();
        bindDockControls();

        document.addEventListener('keydown', e => {
            if (!enabled) return;
            if (e.key === 'Escape') {
                if (document.querySelector('.modal-overlay.open')) return;
                const focused = state.windows.filter(w => !w.minimized).sort((a, b) => (b.z || 0) - (a.z || 0))[0];
                if (focused) closeWindow(focused.id);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                const focused = state.windows.filter(w => !w.minimized).sort((a, b) => (b.z || 0) - (a.z || 0))[0];
                if (focused) closeWindow(focused.id);
            }
        });

        const themeModal = document.getElementById('themeModal');
        if (themeModal) {
            themeModal.addEventListener('click', e => {
                if (e.target === themeModal) pendingDesktop = null;
            });
        }
        document.getElementById('theme-modal-cancel')?.addEventListener('click', () => {
            pendingDesktop = null;
            applyDesktop();
        });
    }

    function onDesignChange() {
        isHost = detectHost();
        if (!isWorkspaceDesign()) {
            setEnabled(false);
            document.body.classList.remove('workspace-host');
            pendingDesktop = null;
            return;
        }
        bootWorkspace();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.WorkspaceManager = {
        setEnabled,
        onDesignChange,
        openWindow,
        closeWindow,
        applyDesktop,
        getState: () => state,
        commitDesktopFromModal,
        syncDesktopFormFromState,
        resetDesktopPreview,
    };
})();
