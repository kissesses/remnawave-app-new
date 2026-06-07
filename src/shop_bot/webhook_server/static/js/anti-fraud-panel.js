/**
 * Anti-Fraud Studio — Access-style tabs, signals, blocklist
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'af-studio-tab';
    const LIVE_MS = 60000;
    const boot = window.AF_PANEL_BOOT || {};

    let liveTimer = null;
    let lastPayload = null;

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(kind, msg) {
        window.showToast?.(kind, msg);
    }

    async function fetchJson(url) {
        const resp = await fetch(url, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        });
        const data = await resp.json().catch(() => ({ ok: false, error: `HTTP ${resp.status}` }));
        return { resp, data };
    }

    function formatTime(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('ru-RU', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (_) {
            return iso;
        }
    }

    function previewItem(item) {
        if (!item || typeof item !== 'object') return '—';
        const parts = [];
        for (const key of ['email', 'code', 'telegramId', 'emailDomain', 'username', 'referrerId']) {
            if (item[key] != null && item[key] !== '') {
                parts.push(`${key}: ${item[key]}`);
            }
        }
        return parts.slice(0, 2).join(' · ') || JSON.stringify(item).slice(0, 80);
    }

    function setTab(tabId) {
        const root = $('tab-anti-fraud');
        if (!root) return;

        root.querySelectorAll('.af-tab').forEach((btn) => {
            const active = btn.dataset.afTab === tabId;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        root.querySelectorAll('.af-pane').forEach((pane) => {
            pane.hidden = pane.dataset.afPane !== tabId;
        });

        try {
            localStorage.setItem(STORAGE_KEY, tabId);
        } catch (_) { /* ignore */ }

        if (history.replaceState) {
            history.replaceState(null, '', `#${tabId}`);
        }
    }

    function resolveInitialTab() {
        const root = $('tab-anti-fraud');
        if (!root) return 'overview';

        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash && root.querySelector(`.af-pane[data-af-pane="${hash}"]`)) {
            return hash;
        }

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && root.querySelector(`.af-pane[data-af-pane="${stored}"]`)) {
                return stored;
            }
        } catch (_) { /* ignore */ }

        return root.dataset.afDefaultTab || 'overview';
    }

    function initTabs() {
        const root = $('tab-anti-fraud');
        if (!root) return;

        root.querySelectorAll('.af-tab').forEach((btn) => {
            btn.addEventListener('click', () => setTab(btn.dataset.afTab || 'overview'));
        });

        root.querySelectorAll('[data-af-goto]').forEach((el) => {
            el.addEventListener('click', () => setTab(el.dataset.afGoto || 'overview'));
        });

        setTab(resolveInitialTab());
    }

    function renderSignalCard(signal) {
        const sev = signal.severity || 'info';
        const count = signal.count || 0;
        const preview = (signal.topItems || []).map(previewItem).filter(Boolean).slice(0, 2);
        return `
            <article class="af-signal" data-signal-key="${escapeHtml(signal.key)}">
                <div class="af-signal__head">
                    <div>
                        <h4 class="af-signal__title">${escapeHtml(signal.label)}</h4>
                        <p class="af-signal__desc">${escapeHtml(signal.description)}</p>
                    </div>
                    <span class="af-badge af-badge--${escapeHtml(sev)}">${escapeHtml(sev)}</span>
                </div>
                <div class="af-signal__count">${count}</div>
                ${preview.map((p) => `<div class="af-signal__preview">${escapeHtml(p)}</div>`).join('')}
                <div class="af-signal__actions">
                    <button type="button" class="af-detail-btn" data-key="${escapeHtml(signal.key)}" ${count ? '' : 'disabled'}>
                        Подробнее
                    </button>
                </div>
            </article>
        `;
    }

    function updateStats(payload) {
        const signals = payload.signals || [];
        const warn = signals.filter((s) => s.severity === 'warn' && s.count > 0).length;
        const err = signals.filter((s) => s.severity === 'error' && s.count > 0).length;
        const active = signals.filter((s) => s.count > 0).length;

        if ($('af-stat-total')) $('af-stat-total').textContent = String(active);
        if ($('af-stat-warn')) $('af-stat-warn').textContent = String(warn);
        if ($('af-stat-error')) $('af-stat-error').textContent = String(err);
        if ($('af-stat-generated')) $('af-stat-generated').textContent = formatTime(payload.generatedAt);

        const hubActive = $('af-hub-active');
        if (hubActive) {
            hubActive.classList.toggle('af-stat--ok', active > 0);
            hubActive.querySelector('span:last-child').textContent = `${active} активных`;
        }
        const hubWarn = $('af-hub-warn');
        if (hubWarn) {
            hubWarn.querySelector('span:last-child').textContent = `${warn} warn`;
        }
        const hubError = $('af-hub-error');
        if (hubError) {
            hubError.querySelector('span:last-child').textContent = `${err} critical`;
        }

        renderOverviewAlerts(signals);
    }

    function renderOverviewAlerts(signals) {
        const box = $('af-overview-alerts');
        if (!box) return;

        const active = (signals || []).filter((s) => s.count > 0);
        if (!active.length) {
            box.innerHTML = '<p class="af-empty">Активных сигналов нет — всё чисто</p>';
            return;
        }

        box.innerHTML = active.slice(0, 6).map((s) => `
            <button type="button" class="af-alert-row" data-af-open-signal="${escapeHtml(s.key)}">
                <span class="af-badge af-badge--${escapeHtml(s.severity || 'info')}">${escapeHtml(s.severity || 'info')}</span>
                <span class="af-alert-row__title">${escapeHtml(s.label)}</span>
                <span class="af-badge af-badge--info">${s.count}</span>
                <span class="af-alert-row__meta">${escapeHtml(s.description || '')}</span>
            </button>
        `).join('');
    }

    async function loadSignals() {
        const grid = $('af-signals-grid');
        if (grid) grid.innerHTML = '<p class="af-empty">Загрузка…</p>';

        const url = boot.signalsUrl || '/settings/anti-fraud/signals';
        const { resp, data } = await fetchJson(url);
        if (!resp.ok || !data.ok) {
            const err = data.error || 'Ошибка загрузки';
            if (grid) grid.innerHTML = `<p class="af-empty">${escapeHtml(err)}</p>`;
            toast('danger', err);
            return;
        }

        lastPayload = data;
        const signals = data.signals || [];
        if (grid) {
            grid.innerHTML = signals.length
                ? signals.map(renderSignalCard).join('')
                : '<p class="af-empty">Нет данных</p>';
        }
        updateStats(data);
    }

    async function openDetail(key) {
        const modal = $('af-detail-modal');
        const title = $('af-detail-title');
        const pre = $('af-detail-json');
        if (!modal || !pre) return;

        pre.textContent = 'Загрузка…';
        if (title) title.textContent = key;
        modal.showModal();

        const base = boot.signalsUrl || '/settings/anti-fraud/signals';
        const { resp, data } = await fetchJson(`${base.replace(/\/signals\/?$/, `/signal/${encodeURIComponent(key)}`)}?limit=100`);
        if (!resp.ok || !data.ok) {
            pre.textContent = data.error || 'Ошибка';
            return;
        }
        pre.textContent = JSON.stringify(data.items || [], null, 2);
    }

    function bindEvents() {
        $('af-refresh')?.addEventListener('click', () => loadSignals());
        $('af-detail-close')?.addEventListener('click', () => $('af-detail-modal')?.close());
        $('af-signals-grid')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.af-detail-btn');
            if (!btn || btn.disabled) return;
            openDetail(btn.dataset.key);
        });
        $('af-overview-alerts')?.addEventListener('click', (e) => {
            const row = e.target.closest('[data-af-open-signal]');
            if (!row) return;
            setTab('signals');
            openDetail(row.dataset.afOpenSignal);
        });
        $('af-live')?.addEventListener('change', (e) => {
            if (liveTimer) {
                clearInterval(liveTimer);
                liveTimer = null;
            }
            if (e.target.checked) {
                liveTimer = setInterval(loadSignals, LIVE_MS);
            }
        });
    }

    function initAntiFraudPanel() {
        if (!$('tab-anti-fraud')) return;
        if (liveTimer) {
            clearInterval(liveTimer);
            liveTimer = null;
        }
        const liveEl = $('af-live');
        if (liveEl) liveEl.checked = false;

        initTabs();
        bindEvents();
        loadSignals();
    }

    window.reinitAntiFraudPanel = initAntiFraudPanel;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAntiFraudPanel);
    } else {
        initAntiFraudPanel();
    }
})();
