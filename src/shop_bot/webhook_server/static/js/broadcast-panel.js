/**
 * Signal Desk — рассылки: превью, черновик, навигация, история
 */
(function () {
    'use strict';

    const DRAFT_KEY = 'shopbot_broadcast_draft_v1';
    const MAX_LEN = 4096;
    const DEBOUNCE_MS = 450;

    function $(id) {
        return document.getElementById(id);
    }

    function initNav() {
        const nav = document.querySelector('[data-bc-nav]');
        if (!nav) return;

        nav.querySelectorAll('[data-bc-target]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-bc-target');
                nav.querySelectorAll('.brc-steps__item, .bc-nav__btn').forEach((b) => {
                    b.classList.toggle('is-active', b === btn);
                    b.removeAttribute('aria-current');
                });
                btn.setAttribute('aria-current', 'page');

                document.querySelectorAll('[data-bc-section], .brc-panel').forEach((section) => {
                    const id = section.getAttribute('data-bc-section');
                    if (id) section.classList.toggle('is-active', id === target);
                });
            });
        });
    }

    function stripTelegramHtml(html) {
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    function telegramHtmlToPreview(html) {
        if (!html) return '';
        let safe = html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        safe = safe
            .replace(/&lt;b&gt;([\s\S]*?)&lt;\/b&gt;/gi, '<b>$1</b>')
            .replace(/&lt;strong&gt;([\s\S]*?)&lt;\/strong&gt;/gi, '<strong>$1</strong>')
            .replace(/&lt;i&gt;([\s\S]*?)&lt;\/i&gt;/gi, '<i>$1</i>')
            .replace(/&lt;em&gt;([\s\S]*?)&lt;\/em&gt;/gi, '<em>$1</em>')
            .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/gi, '<u>$1</u>')
            .replace(/&lt;s&gt;([\s\S]*?)&lt;\/s&gt;/gi, '<s>$1</s>')
            .replace(/&lt;strike&gt;([\s\S]*?)&lt;\/strike&gt;/gi, '<strike>$1</strike>')
            .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/gi, '<code>$1</code>')
            .replace(/&lt;tg-spoiler&gt;([\s\S]*?)&lt;\/tg-spoiler&gt;/gi, '<span class="tg-spoiler">$1</span>')
            .replace(/&lt;a href=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi, '<a href="$1" target="_blank" rel="noopener">$2</a>')
            .replace(/&lt;blockquote&gt;([\s\S]*?)&lt;\/blockquote&gt;/gi, '<blockquote style="border-left:3px solid rgba(255,255,255,.2);padding-left:.5rem;margin:.25rem 0">$1</blockquote>')
            .replace(/\n/g, '<br>');
        return safe;
    }

    function updateCharCount() {
        const ta = $('broadcast-text');
        const el = $('bc-char-count');
        if (!ta || !el) return;
        const len = ta.value.length;
        el.textContent = `${len} / ${MAX_LEN}`;
        el.classList.toggle('is-warn', len > 3500 && len <= MAX_LEN);
        el.classList.toggle('is-over', len > MAX_LEN);
    }

    function updateLivePreview() {
        const ta = $('broadcast-text');
        const bubble = $('bc-preview-bubble');
        const keysEl = $('bc-preview-keyboard');
        const mediaEl = $('bc-preview-media');
        if (!ta || !bubble) return;

        const raw = ta.value.trim();
        bubble.innerHTML = raw ? telegramHtmlToPreview(raw) : '';

        if (keysEl) {
            keysEl.innerHTML = '';
            const list = document.getElementById('buttons-list');
            if (list) {
                list.querySelectorAll('input[data-field="text"]').forEach((inp) => {
                    const t = inp.value.trim();
                    if (!t) return;
                    const key = document.createElement('div');
                    key.className = 'brc-tg-key';
                    key.textContent = t;
                    keysEl.appendChild(key);
                });
            }
        }

        if (mediaEl) {
            const img = $('media-preview-img');
            const vid = $('media-preview-video');
            let src = '';
            if (img && !img.classList.contains('hidden') && img.src) src = img.src;
            if (vid && !vid.classList.contains('hidden') && vid.src) src = vid.src;
            if (src) {
                mediaEl.src = src;
                mediaEl.classList.add('is-visible');
            } else {
                mediaEl.removeAttribute('src');
                mediaEl.classList.remove('is-visible');
            }
        }
    }

    let draftTimer = null;
    function saveDraft() {
        const ta = $('broadcast-text');
        if (!ta) return;
        try {
            const payload = {
                text: ta.value,
                savedAt: Date.now(),
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
            $('bc-draft-badge')?.classList.add('is-visible');
            document.querySelector('.brc-draft')?.classList.add('is-visible');
        } catch (_) { /* ignore quota */ }
    }

    function loadDraft() {
        const ta = $('broadcast-text');
        if (!ta) return;
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data?.text || ta.value.trim()) return;
            ta.value = data.text;
            $('bc-draft-badge')?.classList.add('is-visible');
            document.querySelector('.brc-draft')?.classList.add('is-visible');
            updateCharCount();
            updateLivePreview();
        } catch (_) { /* ignore */ }
    }

    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (_) { /* ignore */ }
        $('bc-draft-badge')?.classList.remove('is-visible');
        document.querySelector('.brc-draft')?.classList.remove('is-visible');
    }

    function bindComposer() {
        const ta = $('broadcast-text');
        if (!ta) return;

        ta.addEventListener('input', () => {
            updateCharCount();
            updateLivePreview();
            clearTimeout(draftTimer);
            draftTimer = setTimeout(saveDraft, DEBOUNCE_MS);
        });

        document.querySelectorAll('[data-bc-insert]').forEach((chip) => {
            chip.addEventListener('click', () => {
                const token = chip.getAttribute('data-bc-insert');
                if (!token) return;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const before = ta.value.slice(0, start);
                const after = ta.value.slice(end);
                ta.value = before + token + after;
                ta.selectionStart = ta.selectionEnd = start + token.length;
                ta.focus();
                ta.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        const list = $('buttons-list');
        if (list) {
            const obs = new MutationObserver(() => updateLivePreview());
            obs.observe(list, { childList: true, subtree: true, characterData: true });
        }

        const mediaPreview = $('media-preview');
        if (mediaPreview) {
            const obs = new MutationObserver(() => updateLivePreview());
            obs.observe(mediaPreview, { attributes: true, attributeFilter: ['class'] });
        }

            loadDraft();
            if ($('broadcast-text')?.value.trim()) {
                window.BroadcastTemplates?.switchComposeTab?.('editor');
            }
            updateCharCount();
        updateLivePreview();
    }

    function syncRailSummary() {
        const main = $('broadcast-recipient-summary-text');
        const rail = $('broadcast-recipient-summary-rail');
        const kpiRecipients = $('brc-kpi-recipients');
        if (!main) return;
        const apply = () => {
            const text = main.textContent || 'Загрузка…';
            if (rail) rail.textContent = text;
            if (kpiRecipients) {
                const short = text.length > 42 ? `${text.slice(0, 40)}…` : text;
                kpiRecipients.textContent = short;
            }
        };
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(main, { childList: true, characterData: true, subtree: true });
    }

    function syncKpiFromDom() {
        const map = [
            ['brc-kpi-total', 'stat-total'],
            ['brc-kpi-keys', 'stat-with-keys'],
            ['brc-kpi-sent', 'result-sent'],
        ];
        map.forEach(([kpiId, srcId]) => {
            const src = $(srcId);
            const kpi = $(kpiId);
            if (src && kpi && src.textContent) kpi.textContent = src.textContent;
        });
    }

    window.bcSyncKpi = syncKpiFromDom;

    async function loadRecentHistory() {
        const wrap = $('bc-recent-history');
        if (!wrap) return;
        try {
            const resp = await fetch('/settings/broadcast/history?limit=5', {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await resp.json();
            if (!data.ok || !data.items?.length) {
                wrap.innerHTML = '<p class="brc-recent-empty">Пока нет рассылок</p>';
                return;
            }
            wrap.innerHTML = data.items.slice(0, 5).map((item) => {
                const preview = stripTelegramHtml(item.text_preview || '').slice(0, 48);
                const label = item.mode_label || item.mode || 'Рассылка';
                const date = item.started_at ? new Date(item.started_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                return `<button type="button" class="brc-recent-item" data-bc-reuse="${encodeURIComponent(item.text_preview || '')}">
                    <span class="material-symbols-outlined">history</span>
                    <span><strong>${label}</strong> · ${date}<br>${preview || '—'}${(item.text_preview || '').length > 48 ? '…' : ''}</span>
                </button>`;
            }).join('');

            wrap.querySelectorAll('[data-bc-reuse]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const text = decodeURIComponent(btn.getAttribute('data-bc-reuse') || '');
                    const ta = $('broadcast-text');
                    if (!ta || !text) return;
                    ta.value = text;
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                    document.querySelector('[data-bc-target="compose"]')?.click();
                    window.showToast?.('info', 'Текст подставлен из истории');
                });
            });
        } catch (e) {
            console.warn('Recent broadcast history', e);
            wrap.innerHTML = '<p class="brc-recent-empty">Не удалось загрузить</p>';
        }
    }

    window.bcClearBroadcastDraft = clearDraft;
    window.bcReloadRecentHistory = loadRecentHistory;

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('tab-broadcast')) return;
        initNav();
        bindComposer();
        syncRailSummary();
        loadRecentHistory();
        syncKpiFromDom();
        const statsObs = ['stat-total', 'stat-with-keys', 'result-sent'];
        statsObs.forEach((id) => {
            const el = $(id);
            if (!el) return;
            new MutationObserver(syncKpiFromDom).observe(el, { childList: true, characterData: true, subtree: true });
        });
    });
})();
