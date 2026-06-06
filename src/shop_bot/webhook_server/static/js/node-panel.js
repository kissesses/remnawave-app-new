(function () {
    'use strict';

    const page = document.querySelector('.node-page');
    if (!page) return;

    const gridEl = document.getElementById('node-servers-grid');
    const statsEl = document.getElementById('node-stats');
    const searchInput = document.getElementById('node-search');
    const drawerOverlay = document.getElementById('node-drawer-overlay');
    const drawerTitle = document.getElementById('node-drawer-title');
    const drawerSub = document.getElementById('node-drawer-sub');
    const drawerBody = document.getElementById('node-drawer-body');
    const drawerClose = document.getElementById('node-drawer-close');

    const state = {
        hosts: [],
        sshTargets: [],
        filter: 'all',
        search: '',
        view: localStorage.getItem('node_panel_view') || 'grid',
        uptime: {},
        speedtests: {},
        activeDrawer: null,
    };

    function csrf() {
        return typeof getCsrfToken === 'function' ? getCsrfToken() : '';
    }

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function serverKey(type, name) {
        return `${type}:${name}`;
    }

    function barClass(pct) {
        if (pct > 85) return 'node-metric-bar--bad';
        if (pct > 55) return 'node-metric-bar--warn';
        return 'node-metric-bar--ok';
    }

    function metricColor(pct, warn, bad) {
        if (pct > bad) return '#f87171';
        if (pct > warn) return '#fbbf24';
        return '#6ee7b7';
    }

    function metricsHtml(data) {
        if (!data || !data.ok) {
            const err = data && data.error ? esc(data.error) : 'Недоступен';
            return `<div class="node-card__metrics-inner" style="color:#f87171;font-size:0.75rem;text-align:center;padding:1rem 0">${err}</div>`;
        }
        const cpu = data.cpu_percent || 0;
        const ram = data.ram_percent || 0;
        const swap = data.swap_percent || 0;
        const swapBlock = data.swap_total > 0
            ? `<div class="node-metric-row"><span class="node-metric-label">SWAP</span><span class="node-metric-val" style="color:${metricColor(swap, 65, 85)}">${swap}%</span></div>
               <div class="node-metric-bar ${barClass(swap)}"><span style="width:${swap}%"></span></div>`
            : '';
        return `
            <div class="node-metric-row">
                <span class="node-metric-label">Uptime</span>
                <span class="node-metric-val">${esc(data.uptime_formatted || '—')}</span>
            </div>
            <div class="node-metric-row">
                <span class="node-metric-label">CPU</span>
                <span class="node-metric-val" style="color:${metricColor(cpu, 40, 70)}">${cpu}% · ${data.cpu_cores || '?'}c</span>
            </div>
            <div class="node-metric-bar ${barClass(cpu)}"><span style="width:${cpu}%"></span></div>
            <div class="node-metric-row">
                <span class="node-metric-label">RAM</span>
                <span class="node-metric-val" style="color:${metricColor(ram, 55, 85)}">${ram}% · ${esc(data.ram_used)}/${esc(data.ram_total)}</span>
            </div>
            <div class="node-metric-bar ${barClass(ram)}"><span style="width:${ram}%"></span></div>
            ${swapBlock}
            <div class="node-metric-net">
                <span>↓ ${esc(data.net_rx_mbs || '0')} MB/s</span>
                <span>↑ ${esc(data.net_tx_mbs || '0')} MB/s</span>
            </div>`;
    }

    function skeletonHtml() {
        return `<div class="node-skeleton"><div class="node-skeleton-line" style="width:60%"></div><div class="node-skeleton-line"></div><div class="node-skeleton-line"></div><div class="node-skeleton-line" style="width:40%"></div></div>`;
    }

    function filteredServers() {
        const q = state.search.trim().toLowerCase();
        const items = [];
        state.hosts.forEach((h) => {
            items.push({
                type: 'host',
                name: h.host_name,
                addr: `${h.ssh_host || 'N/A'}:${h.ssh_port || 22}`,
                desc: h.description || '',
                raw: h,
            });
        });
        state.sshTargets.forEach((t) => {
            items.push({
                type: 'ssh',
                name: t.target_name,
                addr: `${t.ssh_host}:${t.ssh_port || 22}`,
                desc: t.description || '',
                raw: t,
            });
        });
        return items.filter((s) => {
            if (state.filter === 'host' && s.type !== 'host') return false;
            if (state.filter === 'ssh' && s.type !== 'ssh') return false;
            if (!q) return true;
            const hay = `${s.name} ${s.addr} ${s.desc}`.toLowerCase();
            return hay.includes(q);
        });
    }

    function updateStats() {
        if (!statsEl) return;
        const total = state.hosts.length + state.sshTargets.length;
        let online = 0;
        let highLoad = 0;
        let cpuSum = 0;
        let cpuCount = 0;
        Object.values(state.uptime).forEach((u) => {
            if (u && u.ok) {
                online += 1;
                const cpu = u.cpu_percent || 0;
                cpuSum += cpu;
                cpuCount += 1;
                if (cpu > 70 || (u.ram_percent || 0) > 85) highLoad += 1;
            }
        });
        const avgCpu = cpuCount ? Math.round(cpuSum / cpuCount) : '—';
        statsEl.innerHTML = `
            <div class="node-stat"><div class="node-stat__label">Всего</div><div class="node-stat__value">${total}</div></div>
            <div class="node-stat node-stat--online"><div class="node-stat__label">Онлайн</div><div class="node-stat__value">${online}</div></div>
            <div class="node-stat node-stat--host"><div class="node-stat__label">Remnawave</div><div class="node-stat__value">${state.hosts.length}</div></div>
            <div class="node-stat node-stat--ssh"><div class="node-stat__label">SSH</div><div class="node-stat__value">${state.sshTargets.length}</div></div>
            <div class="node-stat"><div class="node-stat__label">Ср. CPU</div><div class="node-stat__value">${avgCpu}${cpuCount ? '%' : ''}</div></div>
            <div class="node-stat node-stat--warn"><div class="node-stat__label">Нагрузка</div><div class="node-stat__value">${highLoad}</div></div>`;
    }

    function speedtestLine(name) {
        const st = state.speedtests[name];
        if (!st) return '';
        return `<span>↓ ${st.download_mbps ?? '—'} Mbps</span> · <span>↑ ${st.upload_mbps ?? '—'} Mbps</span> · <span>${st.ping_ms ?? '—'} ms</span>`;
    }

    function cardHtml(s, idx) {
        const key = serverKey(s.type, s.name);
        const uptime = state.uptime[key];
        const statusCls = !uptime ? 'is-loading' : (uptime.ok ? 'is-online' : 'is-offline');
        const typeLabel = s.type === 'host' ? 'Remnawave' : 'SSH';
        const icon = s.type === 'host' ? 'hub' : 'terminal';
        const stHtml = state.speedtests[s.name] ? speedtestLine(s.name) : '';
        const sshOnly = s.type === 'ssh';
        return `
        <article class="node-card node-card--${s.type}" draggable="true"
            data-server-type="${s.type}" data-server-name="${esc(s.name)}" data-idx="${idx}">
            <div class="node-card__head">
                <span class="node-card__drag material-symbols-outlined" onclick="event.stopPropagation()">drag_indicator</span>
                <div class="node-card__icon">
                    <span class="material-symbols-outlined">${icon}</span>
                    <span class="node-card__status ${statusCls}" id="node-st-${idx}"></span>
                </div>
                <div class="node-card__meta">
                    <div class="node-card__name">${esc(s.name)}</div>
                    <div class="node-card__addr">${esc(s.addr)}</div>
                    <span class="node-card__badge">${typeLabel}</span>
                </div>
                <div class="node-card__actions-top">
                    <button type="button" class="node-card__icon-btn" data-action="refresh" title="Обновить" onclick="event.stopPropagation()">
                        <span class="material-symbols-outlined text-base">refresh</span>
                    </button>
                    <div class="node-menu-wrap">
                        <button type="button" class="node-card__icon-btn" data-action="menu" onclick="event.stopPropagation()">
                            <span class="material-symbols-outlined text-base">more_vert</span>
                        </button>
                        <div class="node-menu" hidden>
                            <button type="button" data-action="drawer">Подробнее</button>
                            <button type="button" data-action="speedtest">Speedtest</button>
                            <button type="button" data-action="reboot" class="is-danger">Перезагрузка</button>
                            ${sshOnly ? `
                            <button type="button" data-action="scheduler">Планировщик</button>
                            <button type="button" data-action="warp">WARP</button>
                            <button type="button" data-action="swap">SWAP</button>
                            <button type="button" data-action="deploy">Развернуть</button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div class="node-card__metrics" id="node-metrics-${idx}">
                <div class="node-card__metrics-inner">${uptime ? metricsHtml(uptime) : skeletonHtml()}</div>
            </div>
            <div class="node-card__speed${stHtml ? ' is-visible' : ''}" id="node-st-result-${idx}">${stHtml}</div>
            <div class="node-card__foot">
                <button type="button" class="node-btn node-btn--ghost" data-action="terminal">
                    <span class="material-symbols-outlined text-sm">terminal</span> Терминал
                </button>
                ${sshOnly ? `<button type="button" class="node-btn node-btn--primary" data-action="deploy">
                    <span class="material-symbols-outlined text-sm">rocket_launch</span> Deploy
                </button>` : ''}
                <button type="button" class="node-btn node-btn--ghost" data-action="drawer">
                    <span class="material-symbols-outlined text-sm">insights</span> Метрики
                </button>
            </div>
        </article>`;
    }

    function render() {
        if (!gridEl) return;
        const items = filteredServers();
        gridEl.classList.toggle('is-list', state.view === 'list');
        if (!items.length) {
            const total = state.hosts.length + state.sshTargets.length;
            const msg = total === 0
                ? 'Нет серверов с SSH Host. Добавьте SSH-цели на вкладке «SSH-цели» или укажите SSH в Настройках → Хосты.'
                : 'Нет серверов по текущему фильтру или поиску';
            gridEl.innerHTML = `<div class="node-empty"><div class="node-empty__icon material-symbols-outlined">dns</div><p>${esc(msg)}</p></div>`;
            updateStats();
            return;
        }
        gridEl.innerHTML = items.map((s, i) => cardHtml(s, i)).join('');
        bindCardEvents();
        updateStats();
    }

    function bindCardEvents() {
        if (!gridEl) return;
        gridEl.querySelectorAll('.node-card').forEach((card) => {
            const type = card.dataset.serverType;
            const name = card.dataset.serverName;
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]') || e.target.closest('.node-menu-wrap')) return;
                openDrawer(type, name);
            });
            card.querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleAction(btn.dataset.action, type, name, card);
                });
            });
        });
        initDragDrop();
    }

    function closeMenus() {
        document.querySelectorAll('.node-menu').forEach((m) => { m.hidden = true; });
    }

    function handleAction(action, type, name, card) {
        closeMenus();
        switch (action) {
            case 'menu':
                const menu = card.querySelector('.node-menu');
                if (menu) {
                    closeMenus();
                    menu.hidden = !menu.hidden;
                }
                break;
            case 'refresh':
                loadUptime(type, name, card.dataset.idx, true);
                break;
            case 'terminal':
                if (typeof window.openExecuteCommandModal === 'function') {
                    window.openExecuteCommandModal(type, name);
                }
                break;
            case 'deploy':
                if (typeof window.deployNodeWizard === 'function') window.deployNodeWizard(name);
                break;
            case 'scheduler':
                if (typeof window.openSchedulerModal === 'function') window.openSchedulerModal(name);
                break;
            case 'warp':
                if (typeof window.openWarpWizard === 'function') window.openWarpWizard(name);
                break;
            case 'swap':
                if (typeof window.openSwapModal === 'function') window.openSwapModal(name);
                break;
            case 'reboot':
                if (typeof window.rebootServer === 'function') window.rebootServer(type, name);
                break;
            case 'speedtest':
                runSpeedtest(type, name, card.dataset.idx);
                break;
            case 'drawer':
                openDrawer(type, name);
                break;
            default:
                break;
        }
    }

    async function loadUptime(type, name, idx, force) {
        const key = serverKey(type, name);
        const metricsEl = document.getElementById(`node-metrics-${idx}`);
        const statusEl = document.getElementById(`node-st-${idx}`);
        if (statusEl) statusEl.className = 'node-card__status is-loading';
        try {
            const resp = await fetch(`/node/servers/uptime/${type}/${encodeURIComponent(name)}`);
            const data = await resp.json();
            state.uptime[key] = data;
            if (metricsEl) {
                metricsEl.innerHTML = `<div class="node-card__metrics-inner">${metricsHtml(data)}</div>`;
            }
            if (statusEl) {
                statusEl.className = `node-card__status ${data.ok ? 'is-online' : 'is-offline'}`;
            }
            updateStats();
            cacheUptime(type, name, data);
            if (state.activeDrawer && state.activeDrawer.type === type && state.activeDrawer.name === name) {
                renderDrawerMetrics(type, name);
            }
        } catch (e) {
            if (metricsEl) metricsEl.innerHTML = `<div class="node-card__metrics-inner" style="color:#f87171">Ошибка загрузки</div>`;
            if (statusEl) statusEl.className = 'node-card__status is-offline';
        }
    }

    function cacheUptime(type, name, data) {
        const cachedStr = localStorage.getItem('remnawave_servers_cache');
        if (!cachedStr) return;
        try {
            const cachedObj = JSON.parse(cachedStr);
            if (type === 'host') {
                const i = cachedObj.hosts.findIndex((h) => h.host_name === name);
                if (i !== -1) cachedObj.hosts[i].uptime_data = data;
            } else {
                const i = cachedObj.ssh_targets.findIndex((t) => t.target_name === name);
                if (i !== -1) cachedObj.ssh_targets[i].uptime_data = data;
            }
            localStorage.setItem('remnawave_servers_cache', JSON.stringify(cachedObj));
            if (typeof window.updateClearCacheBtn === 'function') window.updateClearCacheBtn();
        } catch (err) { /* ignore */ }
    }

    async function refreshAllUptime() {
        const items = filteredServers();
        let delay = 0;
        items.forEach((s, idx) => {
            setTimeout(() => loadUptime(s.type, s.name, idx), delay);
            delay += 120;
        });
    }

    async function runSpeedtest(type, name, idx) {
        const el = document.getElementById(`node-st-result-${idx}`);
        if (el) el.innerHTML = 'Запуск speedtest…';
        try {
            let url;
            if (type === 'ssh') {
                url = `/node/ssh-targets/${encodeURIComponent(name)}/speedtest/run`;
            } else {
                url = `/admin/hosts/${encodeURIComponent(name)}/speedtest/run`;
            }
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrf() },
            });
            const data = await resp.json();
            if (data.ok) {
                await loadSpeedtestResult(name, idx);
                if (typeof showToast === 'function') showToast('success', `Speedtest: ${name}`);
            } else if (typeof showToast === 'function') {
                showToast('danger', data.error || 'Ошибка speedtest');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('danger', 'Ошибка speedtest');
        }
    }

    async function loadSpeedtestResult(name, idx) {
        try {
            const resp = await fetch(`/admin/hosts/${encodeURIComponent(name)}/speedtests.json?limit=1`);
            const data = await resp.json();
            if (data && data.items && data.items.length) {
                const last = data.items[0];
                state.speedtests[name] = last;
                const el = document.getElementById(`node-st-result-${idx}`);
                if (el) {
                    el.classList.add('is-visible');
                    el.innerHTML = speedtestLine(name);
                }
            }
        } catch (e) { /* ignore */ }
    }

    async function runAllSpeedtests() {
        const btn = document.getElementById('node-speedtest-all');
        if (btn) btn.classList.add('is-loading');
        try {
            const resp = await fetch('/node/ssh-targets/speedtests/run-all', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrf() },
            });
            const data = await resp.json();
            if (typeof showToast === 'function') {
                showToast(data.ok ? 'success' : 'warning', `Speedtest: ${data.done || 0}/${data.total || 0}`);
            }
            render();
            prefetchSpeedtests();
        } finally {
            if (btn) btn.classList.remove('is-loading');
        }
    }

    async function prefetchSpeedtests() {
        state.sshTargets.forEach(async (t, i) => {
            const name = t.target_name;
            try {
                const resp = await fetch(`/admin/hosts/${encodeURIComponent(name)}/speedtests.json?limit=1`);
                const data = await resp.json();
                if (data.items && data.items.length) state.speedtests[name] = data.items[0];
            } catch (e) { /* ignore */ }
        });
        render();
    }

    function chartBars(items, field, maxH) {
        if (!items || !items.length) {
            return '<div style="color:rgba(235,235,245,0.35);font-size:0.75rem;padding:0.5rem">Нет истории метрик</div>';
        }
        const vals = items.map((x) => Number(x[field]) || 0);
        const max = Math.max(...vals, 1);
        return vals.map((v) => {
            const h = Math.max(4, Math.round((v / max) * maxH));
            return `<div class="node-chart__bar" style="height:${h}px" title="${v}%"></div>`;
        }).join('');
    }

    async function renderDrawerMetrics(type, name) {
        const scope = type === 'host' ? 'host' : 'target';
        const chartCpu = document.getElementById('node-drawer-chart-cpu');
        const chartRam = document.getElementById('node-drawer-chart-ram');
        const liveEl = document.getElementById('node-drawer-live');
        const key = serverKey(type, name);
        const u = state.uptime[key];
        if (liveEl) liveEl.innerHTML = u ? metricsHtml(u) : skeletonHtml();
        try {
            const resp = await fetch(`/dashboard/monitor/series/${scope}/${encodeURIComponent(name)}.json?hours=24`);
            const data = await resp.json();
            if (data.ok && chartCpu && chartRam) {
                chartCpu.innerHTML = chartBars(data.items, 'cpu_percent', 48);
                chartRam.innerHTML = chartBars(data.items, 'mem_percent', 48).replace(/node-chart__bar/g, 'node-chart__bar node-chart__bar--ram');
            }
        } catch (e) { /* ignore */ }
    }

    function openDrawer(type, name) {
        if (!drawerOverlay) return;
        state.activeDrawer = { type, name };
        const s = filteredServers().find((x) => x.type === type && x.name === name);
        if (drawerTitle) drawerTitle.textContent = name;
        if (drawerSub) drawerSub.textContent = s ? s.addr : '';
        const isSsh = type === 'ssh';
        if (drawerBody) {
            drawerBody.innerHTML = `
                <div class="node-drawer__section">
                    <div class="node-drawer__section-title">Сейчас</div>
                    <div class="node-card__metrics-inner" id="node-drawer-live">${skeletonHtml()}</div>
                </div>
                <div class="node-drawer__section">
                    <div class="node-drawer__section-title">CPU · 24ч</div>
                    <div class="node-chart" id="node-drawer-chart-cpu"></div>
                    <div class="node-drawer__section-title" style="margin-top:0.75rem">RAM · 24ч</div>
                    <div class="node-chart" id="node-drawer-chart-ram"></div>
                    <div class="node-chart-legend"><span class="cpu">CPU</span><span class="ram">RAM</span></div>
                </div>
                <div class="node-drawer__section">
                    <div class="node-drawer__section-title">Действия</div>
                    <div class="node-drawer__actions">
                        <button type="button" class="node-btn" data-drawer="terminal"><span class="material-symbols-outlined text-sm">terminal</span> Терминал</button>
                        <button type="button" class="node-btn" data-drawer="refresh"><span class="material-symbols-outlined text-sm">refresh</span> Обновить</button>
                        <button type="button" class="node-btn" data-drawer="speedtest"><span class="material-symbols-outlined text-sm">speed</span> Speedtest</button>
                        <button type="button" class="node-btn is-danger" data-drawer="reboot" style="color:#fca5a5;border-color:rgba(248,113,113,0.25)"><span class="material-symbols-outlined text-sm">restart_alt</span> Reboot</button>
                        ${isSsh ? `
                        <button type="button" class="node-btn node-btn--primary" data-drawer="deploy"><span class="material-symbols-outlined text-sm">rocket_launch</span> Deploy</button>
                        <button type="button" class="node-btn" data-drawer="warp">WARP</button>
                        <button type="button" class="node-btn" data-drawer="swap">SWAP</button>
                        <button type="button" class="node-btn" data-drawer="scheduler">Планировщик</button>` : ''}
                    </div>
                </div>`;
            drawerBody.querySelectorAll('[data-drawer]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const a = btn.dataset.drawer;
                    closeDrawer();
                    if (a === 'terminal' && window.openExecuteCommandModal) window.openExecuteCommandModal(type, name);
                    else if (a === 'refresh') loadUptime(type, name, 0, true);
                    else if (a === 'speedtest') runSpeedtest(type, name, 0);
                    else if (a === 'reboot' && window.rebootServer) window.rebootServer(type, name);
                    else if (a === 'deploy' && window.deployNodeWizard) window.deployNodeWizard(name);
                    else if (a === 'warp' && window.openWarpWizard) window.openWarpWizard(name);
                    else if (a === 'swap' && window.openSwapModal) window.openSwapModal(name);
                    else if (a === 'scheduler' && window.openSchedulerModal) window.openSchedulerModal(name);
                });
            });
        }
        drawerOverlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const idx = filteredServers().findIndex((x) => x.type === type && x.name === name);
        loadUptime(type, name, idx >= 0 ? idx : 0);
        renderDrawerMetrics(type, name);
    }

    function closeDrawer() {
        drawerOverlay?.classList.remove('is-open');
        document.body.style.overflow = '';
        state.activeDrawer = null;
    }

    function initDragDrop() {
        if (!gridEl) return;
        let dragged = null;
        gridEl.addEventListener('dragstart', (e) => {
            if (!e.target.closest('.node-card__drag')) {
                e.preventDefault();
                return;
            }
            const card = e.target.closest('.node-card');
            if (!card) return;
            dragged = card;
            card.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        gridEl.addEventListener('dragend', () => {
            if (dragged) {
                dragged.classList.remove('is-dragging');
                saveOrder();
                dragged = null;
            }
        });
        gridEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!dragged) return;
            const target = e.target.closest('.node-card');
            if (target && target !== dragged) {
                const rect = target.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                if (after) target.after(dragged);
                else target.before(dragged);
            }
        });
    }

    async function saveOrder() {
        const cards = gridEl.querySelectorAll('.node-card');
        const hostOrder = [];
        const sshOrder = [];
        cards.forEach((c) => {
            if (c.dataset.serverType === 'host') hostOrder.push(c.dataset.serverName);
            else sshOrder.push(c.dataset.serverName);
        });
        try {
            if (hostOrder.length) {
                await fetch('/node/servers/hosts/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
                    body: JSON.stringify({ order: hostOrder }),
                });
            }
            if (sshOrder.length) {
                await fetch('/node/servers/ssh/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() },
                    body: JSON.stringify({ order: sshOrder }),
                });
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('danger', 'Ошибка сохранения порядка');
        }
    }

    function applyData(data, fromCache) {
        state.hosts = data.hosts || [];
        state.sshTargets = data.ssh_targets || [];
        if (typeof window !== 'undefined') window.sshTargetsData = state.sshTargets;
        (state.hosts.concat(state.sshTargets)).forEach((item) => {
            const isHost = item.host_name != null;
            const type = isHost ? 'host' : 'ssh';
            const name = isHost ? item.host_name : item.target_name;
            if (item.uptime_data) state.uptime[serverKey(type, name)] = item.uptime_data;
        });
        render();
        if (!fromCache) {
            setTimeout(refreshAllUptime, 400);
        } else {
            setTimeout(refreshAllUptime, 800);
        }
        prefetchSpeedtests();
    }

    function bindToolbar() {
        searchInput?.addEventListener('input', () => {
            state.search = searchInput.value;
            render();
        });
        document.querySelectorAll('.node-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.filter = btn.dataset.filter || 'all';
                document.querySelectorAll('.node-filter').forEach((b) => b.classList.toggle('is-active', b === btn));
                render();
            });
        });
        document.querySelectorAll('.node-view-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.view = btn.dataset.view || 'grid';
                localStorage.setItem('node_panel_view', state.view);
                document.querySelectorAll('.node-view-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
                render();
            });
        });
        document.getElementById('node-refresh-all')?.addEventListener('click', refreshAllUptime);
        document.getElementById('node-speedtest-all')?.addEventListener('click', runAllSpeedtests);
        drawerClose?.addEventListener('click', closeDrawer);
        drawerOverlay?.addEventListener('click', (e) => {
            if (e.target === drawerOverlay) closeDrawer();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDrawer();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.node-menu-wrap')) closeMenus();
        });
        const view = state.view;
        document.querySelectorAll('.node-view-btn').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.view === view);
        });
    }

    bindToolbar();

    window.NodePanel = {
        applyData,
        render,
        refreshAllUptime,
        openDrawer,
        closeDrawer,
    };

    window.renderHosts = function () { /* unified in NodePanel */ };
    window.renderSshTargets = function () { /* unified in NodePanel */ };
    window.getUptimeHTML = metricsHtml;
})();
