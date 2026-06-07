/**
 * Anti-Fraud Studio — signal cards + detail modal
 */
(function () {
    'use strict';

    const LIVE_MS = 60000;

    let liveTimer = null;

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
    }

    async function loadSignals() {
        const grid = $('af-signals-grid');
        if (!grid) return;
        grid.innerHTML = '<p class="af-empty">Загрузка…</p>';
        const { resp, data } = await fetchJson('/settings/anti-fraud/signals');
        if (!resp.ok || !data.ok) {
            grid.innerHTML = `<p class="af-empty">${escapeHtml(data.error || 'Ошибка загрузки')}</p>`;
            toast('error', data.error || 'Не удалось загрузить сигналы');
            return;
        }
        const signals = data.signals || [];
        if (!signals.length) {
            grid.innerHTML = '<p class="af-empty">Нет данных</p>';
            return;
        }
        grid.innerHTML = signals.map(renderSignalCard).join('');
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
        const { resp, data } = await fetchJson(`/settings/anti-fraud/signal/${encodeURIComponent(key)}?limit=100`);
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

    function init() {
        if (!$('tab-anti-fraud')) return;
        bindEvents();
        loadSignals();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
