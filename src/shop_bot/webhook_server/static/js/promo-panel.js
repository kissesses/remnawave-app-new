/**
 * Promo Studio — промокоды: vault, spotlight, тексты для продвижения
 */
(function () {
    'use strict';

    const DRAFT_KEY = 'shopbot_broadcast_draft_v1';
    const BOOT = window.PROMO_PANEL_BOOT || {};

    let allPromos = [];
    let filterStatus = 'all';
    let filterType = 'all';
    let viewMode = 'cards';
    let searchQuery = '';
    let sortOrder = 'newest';
    let lastUsages = [];
    let spotlightCode = '';
    let urgentPromos = [];
    let reachSelectedCode = '';

    function $(id) {
        return document.getElementById(id);
    }

    async function fetchJson(url, options = {}) {
        const headers = Object.assign({
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        }, options.headers || {});
        if (options.method && options.method !== 'GET' && window.getCsrfToken) {
            headers['X-CSRFToken'] = window.getCsrfToken();
        }
        const resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, options, { headers }));
        let data = {};
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
            try {
                data = await resp.json();
            } catch (_) {
                data = { ok: false, error: `Ошибка ${resp.status}` };
            }
        } else {
            data = { ok: false, error: `Некорректный ответ (${resp.status})` };
        }
        return { resp, data };
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatReward(promo) {
        const t = promo.promo_type || 'discount';
        if (t === 'universal') return `+${promo.reward_value} дн.`;
        if (t === 'balance') return `+${promo.reward_value} ₽`;
        if (promo.discount_percent) return `${promo.discount_percent}%`;
        if (promo.discount_amount) return `${promo.discount_amount} ₽`;
        return '—';
    }

    function typeLabel(t) {
        if (t === 'universal') return 'Дни';
        if (t === 'balance') return 'Баланс';
        return 'Скидка';
    }

    function promoStatus(promo) {
        if (!promo.is_active) return 'inactive';
        const vu = promo.valid_until;
        if (vu) {
            const end = new Date(String(vu).replace(' ', 'T'));
            if (!isNaN(end.getTime()) && end < new Date()) return 'expired';
        }
        const limit = promo.usage_limit_total;
        const used = promo.used_total || 0;
        if (limit && used >= limit) return 'depleted';
        return 'active';
    }

    function parseDate(s) {
        if (!s) return null;
        const d = new Date(String(s).replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDateRu(s) {
        const d = parseDate(s);
        return d ? d.toLocaleDateString('ru-RU') : null;
    }

    function formatRelativeTime(dateString) {
        if (!dateString) return '—';
        const now = new Date();
        const past = new Date(String(dateString).replace(' ', 'T'));
        let diff = Math.floor((now - past) / 1000);
        if (diff < 0) diff = 0;
        if (diff < 60) return 'только что';
        const mins = Math.floor(diff / 60);
        if (mins < 60) return `${mins} мин назад`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} ч назад`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} дн назад`;
        return past.toLocaleDateString('ru-RU');
    }

    function findPromo(code) {
        return allPromos.find((p) => p.code === code);
    }

    function moveSegIndicator(wrapperId, indicatorId, index) {
        const indicator = $(indicatorId);
        if (indicator) {
            indicator.style.transform = `translateX(${index * 100}%)`;
        }
    }

    window.movePromoIndicator = function (index) {
        moveSegIndicator('promo_mode_switch', 'promo_mode_indicator', index);
        const manual = $('manual-code-field');
        const preview = $('prm-code-preview');
        if (manual) manual.classList.toggle('pms-hidden', index !== 1);
        if (preview) {
            preview.classList.toggle('pms-hidden', index !== 1);
            preview.classList.toggle('is-visible', index === 1);
        }
        updateCodePreview();
        const radios = document.getElementsByName('code_mode');
        if (radios[index]) radios[index].checked = true;
    };

    window.togglePromoType = function (index) {
        const typeInput = document.querySelector('input[name="promo_type"]:checked');
        if (!typeInput) return;
        const type = typeInput.value;
        moveSegIndicator('promo_type_switch', 'promo_type_indicator', index);

        const discountField = $('promo-discount-field');
        const rewardField = $('promo-reward-field');
        const balanceField = $('promo-balance-field');
        const descText = $('promo-type-desc-text');

        if (type === 'universal') {
            if (descText) descText.textContent = 'Дни — активируется в профиле («Ввести промокод»).';
            discountField?.classList.add('pms-hidden');
            rewardField?.classList.remove('pms-hidden');
            balanceField?.classList.add('pms-hidden');
            setRequired(['reward_value'], true);
            setRequired(['balance_value', 'discount_value'], false);
        } else if (type === 'balance') {
            if (descText) descText.textContent = 'Баланс — пополнение через меню промокода в боте.';
            discountField?.classList.add('pms-hidden');
            rewardField?.classList.add('pms-hidden');
            balanceField?.classList.remove('pms-hidden');
            setRequired(['balance_value'], true);
            setRequired(['reward_value', 'discount_value'], false);
        } else {
            if (descText) descText.textContent = 'Скидка — применяется при оплате подписки.';
            discountField?.classList.remove('pms-hidden');
            rewardField?.classList.add('pms-hidden');
            balanceField?.classList.add('pms-hidden');
            setRequired(['discount_value'], true);
            setRequired(['reward_value', 'balance_value'], false);
        }
    };

    function setRequired(names, on) {
        names.forEach((n) => {
            const el = document.querySelector(`[name="${n}"]`);
            if (el) el.required = on;
        });
    }

    function updateCodePreview() {
        const wrap = $('prm-code-preview');
        const codeEl = $('prm-code-preview-text');
        const manual = document.querySelector('input[name="code_mode"][value="manual"]');
        const input = document.querySelector('#manual-code-field input[name="code"]');
        if (!wrap || !codeEl) return;
        if (manual?.checked && input?.value.trim()) {
            codeEl.textContent = input.value.trim().toUpperCase();
            wrap.classList.remove('pms-hidden');
            wrap.classList.add('is-visible');
        } else {
            wrap.classList.add('pms-hidden');
            wrap.classList.remove('is-visible');
            if (!manual?.checked) codeEl.textContent = 'AUTO • 8 символов';
        }
    }

    function syncKpi(stats) {
        const map = {
            'prm-kpi-total': stats.total,
            'prm-kpi-active': stats.active,
            'prm-kpi-redemptions': stats.total_redemptions,
            'prm-kpi-expiring': stats.expiring_soon,
        };
        Object.entries(map).forEach(([id, val]) => {
            const el = $(id);
            if (el) el.textContent = val ?? '0';
        });
        spotlightCode = (stats.spotlight || '').toUpperCase();
        urgentPromos = stats.urgent_promos || [];
        renderSpotlightBanner();
        renderUrgentStrip();
        populateSpotlightSelect();
        syncReachPanel();
    }

    async function loadStats() {
        const { data } = await fetchJson('/settings/promo/stats');
        if (data.ok && data.stats) syncKpi(data.stats);
    }

    function filteredPromos() {
        const q = searchQuery.trim().toLowerCase();
        return allPromos.filter((p) => {
            if (filterType !== 'all' && (p.promo_type || 'discount') !== filterType) return false;
            const st = promoStatus(p);
            if (filterStatus === 'active' && st !== 'active') return false;
            if (filterStatus === 'inactive' && st !== 'inactive') return false;
            if (filterStatus === 'expired' && st !== 'expired') return false;
            if (q) {
                const hay = `${p.code} ${p.description || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function sortedPromos(list) {
        const items = [...list];
        const cmpCode = (a, b) => String(a.code).localeCompare(String(b.code), 'ru');

        if (sortOrder === 'code') {
            items.sort(cmpCode);
        } else if (sortOrder === 'hot') {
            items.sort((a, b) => (b.used_total || 0) - (a.used_total || 0));
        } else if (sortOrder === 'urgent') {
            items.sort((a, b) => {
                const ea = parseDate(a.valid_until);
                const eb = parseDate(b.valid_until);
                if (!ea && !eb) return cmpCode(a, b);
                if (!ea) return 1;
                if (!eb) return -1;
                return ea - eb;
            });
        } else {
            items.sort((a, b) => {
                const ca = parseDate(a.created_at);
                const cb = parseDate(b.created_at);
                if (ca && cb) return cb - ca;
                return cmpCode(b, a);
            });
        }

        if (spotlightCode) {
            const idx = items.findIndex((p) => p.code === spotlightCode);
            if (idx > 0) {
                const [spot] = items.splice(idx, 1);
                items.unshift(spot);
            }
        }
        return items;
    }

    function renderSpotlightBanner() {
        const el = $('pms-spotlight-banner');
        if (!el) return;
        const promo = spotlightCode ? findPromo(spotlightCode) : null;
        if (!promo || promoStatus(promo) !== 'active') {
            el.classList.add('pms-hidden');
            el.innerHTML = '';
            return;
        }
        const until = formatDateRu(promo.valid_until);
        el.classList.remove('pms-hidden');
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0">
                <span class="material-symbols-outlined" style="color:var(--pms-accent)">star</span>
                <div style="min-width:0">
                    <div class="pms-spotlight__code">${escapeHtml(promo.code)}</div>
                    <div class="pms-spotlight__meta">Главная акция · ${escapeHtml(formatReward(promo))}${until ? ` · до ${escapeHtml(until)}` : ''}</div>
                </div>
            </div>
            <button type="button" class="pms-btn pms-btn--ghost pms-btn--sm" data-pms-banner-action="reach">Продвижение</button>`;
        el.querySelector('[data-pms-banner-action="reach"]')?.addEventListener('click', () => {
            reachSelectedCode = promo.code;
            switchPmsTab('reach');
            const sel = $('pms-spotlight-select');
            if (sel) sel.value = promo.code;
            syncReachPanel();
        });
    }

    function renderUrgentStrip() {
        const el = $('pms-urgent-strip');
        if (!el) return;
        if (!urgentPromos.length) {
            el.classList.add('pms-hidden');
            el.innerHTML = '';
            return;
        }
        el.classList.remove('pms-hidden');
        el.innerHTML = urgentPromos
            .map(
                (u) =>
                    `<button type="button" class="pms-urgent__chip" data-pms-urgent="${escapeHtml(u.code)}" title="Открыть продвижение">
                        <span class="material-symbols-outlined" style="font-size:0.95rem">schedule</span>
                        ${escapeHtml(u.code)} · ${escapeHtml(u.reward_label || '')}
                    </button>`
            )
            .join('');
        el.querySelectorAll('[data-pms-urgent]').forEach((chip) => {
            chip.addEventListener('click', () => {
                reachSelectedCode = chip.dataset.pmsUrgent;
                switchPmsTab('reach');
                const sel = $('pms-spotlight-select');
                if (sel) sel.value = reachSelectedCode;
                syncReachPanel();
            });
        });
    }

    function populateSpotlightSelect() {
        const sel = $('pms-spotlight-select');
        if (!sel) return;
        const prev = sel.value || reachSelectedCode || spotlightCode;
        const active = allPromos.filter((p) => promoStatus(p) === 'active');
        sel.innerHTML =
            '<option value="">— Не выбран —</option>' +
            active.map((p) => `<option value="${escapeHtml(p.code)}">${escapeHtml(p.code)} · ${escapeHtml(formatReward(p))}</option>`).join('');
        if (prev && active.some((p) => p.code === prev)) {
            sel.value = prev;
            reachSelectedCode = prev;
        } else if (spotlightCode && active.some((p) => p.code === spotlightCode)) {
            sel.value = spotlightCode;
            reachSelectedCode = spotlightCode;
        }
    }

    function switchPmsTab(tabId) {
        document.querySelectorAll('[data-pms-tab]').forEach((btn) => {
            const on = btn.dataset.pmsTab === tabId;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('[data-pms-panel]').forEach((panel) => {
            const on = panel.dataset.pmsPanel === tabId;
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
        });
        if (tabId === 'reach') syncReachPanel();
    }

    function daysUntilExpiry(promo) {
        const end = parseDate(promo.valid_until);
        if (!end) return null;
        return Math.ceil((end - new Date()) / 86400000);
    }

    function buildMarketingTexts(promo) {
        const code = promo.code;
        const reward = formatReward(promo);
        const until = formatDateRu(promo.valid_until);
        const daysLeft = daysUntilExpiry(promo);
        const urgency =
            daysLeft !== null && daysLeft >= 0 && daysLeft <= 7
                ? `⏳ Осталось ${daysLeft} дн. — успейте активировать!`
                : until
                  ? `📅 Действует до ${until}`
                  : '';
        const botLine = BOOT.botUsername ? `@${BOOT.botUsername}` : 'наш бот';

        return [
            {
                id: 'short',
                label: 'Короткое сообщение',
                text: `🎁 Промокод ${code}\n${reward}${urgency ? `\n${urgency}` : ''}\n\nОткройте ${botLine} → «Ввести промокод»`,
            },
            {
                id: 'channel',
                label: 'Пост для канала',
                text: `🔥 Специальное предложение\n\nКод: ${code}\nВыгода: ${reward}${until ? `\nСрок: до ${until}` : ''}\n\nКак получить:\n1. Откройте бота ${botLine}\n2. Меню → Ввести промокод\n3. Введите ${code}`,
            },
            {
                id: 'broadcast',
                label: 'Для рассылки',
                text: `<b>🎁 Промокод ${code}</b>\n\n${reward}${urgency ? `\n<i>${urgency}</i>` : ''}\n\nВ боте: <b>Ввести промокод</b> → <code>${code}</code>`,
            },
        ];
    }

    function syncReachPanel() {
        const sel = $('pms-spotlight-select');
        const code = (sel?.value || reachSelectedCode || spotlightCode || '').toUpperCase();
        const promo = code ? findPromo(code) : null;
        const bubble = $('pms-tg-bubble');
        const botName = $('pms-tg-bot-name');
        const copyList = $('pms-copy-list');
        const draftBtn = $('pms-broadcast-draft');

        if (botName && BOOT.botUsername) {
            botName.textContent = `@${BOOT.botUsername}`;
        }

        if (!promo) {
            if (bubble) bubble.textContent = 'Выберите промокод в списке слева…';
            if (copyList) copyList.innerHTML = '<p class="pms-hint">Сначала выберите активный промокод.</p>';
            if (draftBtn) draftBtn.disabled = true;
            return;
        }

        reachSelectedCode = promo.code;
        const texts = buildMarketingTexts(promo);
        if (bubble) bubble.textContent = texts[0].text;
        if (copyList) {
            copyList.innerHTML = texts
                .map(
                    (t) => `
                <div class="pms-copy-item" data-copy-id="${t.id}">
                    <div class="pms-copy-item__label">${escapeHtml(t.label)}</div>
                    <div class="pms-copy-item__text">${escapeHtml(t.text)}</div>
                    <button type="button" class="pms-btn pms-btn--ghost pms-btn--sm" data-pms-copy="${t.id}">Копировать</button>
                </div>`
                )
                .join('');
            copyList.querySelectorAll('[data-pms-copy]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const item = texts.find((x) => x.id === btn.dataset.pmsCopy);
                    if (item) copyPlain(item.text.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
                });
            });
        }
        if (draftBtn) {
            draftBtn.disabled = false;
            draftBtn.dataset.promoText = texts.find((t) => t.id === 'broadcast')?.text || texts[0].text;
        }
    }

    async function copyPlain(text) {
        try {
            await navigator.clipboard.writeText(text);
            window.showToast?.('success', 'Текст скопирован');
        } catch (_) {
            window.showToast?.('info', 'Не удалось скопировать автоматически');
        }
    }

    async function setSpotlight(code) {
        const fd = new FormData();
        fd.append('csrf_token', window.getCsrfToken?.() || '');
        fd.append('code', code || '');
        const { data } = await fetchJson('/settings/promo/spotlight', { method: 'POST', body: fd });
        if (data.ok) {
            spotlightCode = (data.spotlight || '').toUpperCase();
            window.showToast?.('success', spotlightCode ? `Закреплён: ${spotlightCode}` : 'Главная акция снята');
            await loadStats();
            renderVault();
        } else {
            window.showToast?.('danger', data.error || 'Не удалось сохранить');
        }
    }

    function pushBroadcastDraft() {
        const btn = $('pms-broadcast-draft');
        const raw = btn?.dataset.promoText;
        if (!raw) return;
        const plain = raw
            .replace(/<b>/gi, '')
            .replace(/<\/b>/gi, '')
            .replace(/<i>/gi, '')
            .replace(/<\/i>/gi, '')
            .replace(/<code>/gi, '')
            .replace(/<\/code>/gi, '');
        try {
            localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify({ text: plain, savedAt: Date.now(), source: 'promo' })
            );
            window.showToast?.('success', 'Черновик рассылки сохранён');
            if (BOOT.broadcastUrl) {
                window.location.href = BOOT.broadcastUrl;
            }
        } catch (_) {
            window.showToast?.('danger', 'Не удалось сохранить черновик');
        }
    }

    function renderVault() {
        const container = $('prm-vault-container');
        if (!container) return;
        const list = sortedPromos(filteredPromos());

        if (list.length === 0) {
            container.innerHTML = '<div class="pms-empty">Промокодов не найдено</div>';
            return;
        }

        if (viewMode === 'table') {
            container.innerHTML = `
                <div class="pms-table-wrap">
                    <table class="pms-table">
                        <thead>
                            <tr>
                                <th>Код</th><th>Тип</th><th>Выгода</th><th>Использ.</th><th>Срок</th><th></th>
                            </tr>
                        </thead>
                        <tbody id="promo-table-body"></tbody>
                    </table>
                </div>`;
            const tbody = $('promo-table-body');
            tbody.innerHTML = list.map((p) => rowHtml(p)).join('');
            bindVaultActions(tbody);
            return;
        }

        container.innerHTML = `<div class="pms-deck" id="prm-cards-grid">${list.map((p) => cardHtml(p)).join('')}</div>`;
        bindVaultActions($('prm-cards-grid'));
    }

    function usagePct(promo) {
        const limit = promo.usage_limit_total;
        const used = promo.used_total || 0;
        if (!limit) return null;
        return Math.min(100, Math.round((used / limit) * 100));
    }

    function cardHtml(promo) {
        const st = promoStatus(promo);
        const pct = usagePct(promo);
        const used = promo.used_total || 0;
        const totalLimit = promo.usage_limit_total || '∞';
        const validUntil = promo.valid_until ? formatDateRu(promo.valid_until) : 'без срока';
        const type = promo.promo_type || 'discount';
        const isSpot = spotlightCode && promo.code === spotlightCode;

        return `
            <article class="pms-card-item ${st === 'inactive' ? 'is-off' : ''} ${isSpot ? 'is-spotlight' : ''}" data-code="${escapeHtml(promo.code)}">
                <div class="pms-card-item__head">
                    <span class="pms-card-item__code">${escapeHtml(promo.code)}</span>
                    <span class="pms-tag">${typeLabel(type)}</span>
                </div>
                <div class="pms-card-item__reward">${escapeHtml(formatReward(promo))}</div>
                <div class="pms-card-item__meta">
                    ${used} / ${totalLimit} · ${escapeHtml(validUntil || 'без срока')}
                    ${promo.description ? `<br>${escapeHtml(promo.description)}` : ''}
                </div>
                ${pct !== null ? `<div class="pms-bar"><span style="width:${pct}%"></span></div>` : ''}
                <div class="pms-acts">
                    ${actionButtons(promo, st)}
                </div>
            </article>`;
    }

    function rowHtml(promo) {
        const st = promoStatus(promo);
        const validFrom = formatDateRu(promo.valid_from) || '—';
        const validUntil = formatDateRu(promo.valid_until) || '—';
        const statusText = st === 'active' ? 'Активен' : st === 'expired' ? 'Истёк' : st === 'depleted' ? 'Исчерпан' : 'Выкл';
        return `
            <tr data-code="${escapeHtml(promo.code)}">
                <td class="font-mono font-bold">${escapeHtml(promo.code)}</td>
                <td>${typeLabel(promo.promo_type || 'discount')}</td>
                <td>${escapeHtml(formatReward(promo))}</td>
                <td>${promo.used_total || 0} / ${promo.usage_limit_total || '∞'}</td>
                <td>${validFrom} — ${validUntil}</td>
                <td>
                    <div class="pms-acts">${actionButtons(promo, st)}</div>
                    <span class="pms-tag">${statusText}</span>
                </td>
            </tr>`;
    }

    function actionButtons(promo, st) {
        const active = st === 'active';
        const toggleIcon = active ? 'toggle_on' : 'toggle_off';
        const isSpot = spotlightCode && promo.code === spotlightCode;
        return `
            <button type="button" class="pms-act ${isSpot ? 'is-on' : ''}" data-prm-action="spotlight" data-code="${escapeHtml(promo.code)}" title="Главная акция">
                <span class="material-symbols-outlined">star</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="reach" data-code="${escapeHtml(promo.code)}" title="Продвижение">
                <span class="material-symbols-outlined">campaign</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="copy" data-code="${escapeHtml(promo.code)}" title="Копировать код">
                <span class="material-symbols-outlined">content_copy</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="usages" data-code="${escapeHtml(promo.code)}" title="Активации">
                <span class="material-symbols-outlined">analytics</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="duplicate" data-code="${escapeHtml(promo.code)}" title="Дублировать">
                <span class="material-symbols-outlined">control_point_duplicate</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="toggle" data-code="${escapeHtml(promo.code)}" title="Вкл/выкл">
                <span class="material-symbols-outlined">${toggleIcon}</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="edit" data-code="${escapeHtml(promo.code)}" title="Изменить">
                <span class="material-symbols-outlined">edit</span>
            </button>
            <button type="button" class="pms-act" data-prm-action="delete" data-code="${escapeHtml(promo.code)}" title="Удалить">
                <span class="material-symbols-outlined">delete</span>
            </button>`;
    }

    function bindVaultActions(root) {
        if (!root) return;
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-prm-action]');
            if (!btn) return;
            const code = btn.dataset.code;
            const action = btn.dataset.prmAction;
            if (action === 'copy') copyCode(code);
            else if (action === 'usages') window.showPromoUsages(code);
            else if (action === 'duplicate') duplicatePromo(code);
            else if (action === 'toggle') window.togglePromo(code);
            else if (action === 'edit') window.editPromo(code);
            else if (action === 'delete') window.deletePromo(code);
            else if (action === 'spotlight') setSpotlight(spotlightCode === code ? '' : code);
            else if (action === 'reach') {
                reachSelectedCode = code;
                switchPmsTab('reach');
                const sel = $('pms-spotlight-select');
                if (sel) sel.value = code;
                syncReachPanel();
            }
        });
    }

    async function copyCode(code) {
        try {
            await navigator.clipboard.writeText(code);
            window.showToast?.('success', `Скопировано: ${code}`);
        } catch (_) {
            window.showToast?.('info', code);
        }
    }

    async function duplicatePromo(code) {
        const fd = new FormData();
        fd.append('csrf_token', window.getCsrfToken?.() || '');
        const { data } = await fetchJson(`/settings/promo/duplicate/${encodeURIComponent(code)}`, {
            method: 'POST',
            body: fd,
        });
        if (data.ok) {
            window.showToast?.('success', `Создана копия: ${data.code}`);
            await loadPromos();
        } else {
            window.showToast?.('danger', data.error || 'Не удалось дублировать');
        }
    }

    async function loadPromos() {
        const container = $('prm-vault-container');
        if (container) {
            container.innerHTML = '<div class="pms-empty">Загрузка…</div>';
        }
        const { data } = await fetchJson('/settings/promo/list');
        if (!data.ok) {
            if (container) {
                container.innerHTML = `<div class="pms-empty" style="color:#f87171">${escapeHtml(data.error || 'Ошибка загрузки')}</div>`;
            }
            return;
        }
        allPromos = data.promos || [];
        renderVault();
        loadStats();
    }

    window.showPromoUsages = async function (code) {
        const tableBody = $('usage-promo-table-body');
        const promoName = $('usage-promo-name');
        if (promoName) promoName.textContent = code;
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-white/50">Загрузка…</td></tr>';
        }
        window.openModal?.('usagePromoModal');

        const { data } = await fetchJson(`/settings/promo/usages/${encodeURIComponent(code)}`);
        if (!data.ok || !tableBody) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-red-400">${escapeHtml(data.error || 'Ошибка')}</td></tr>`;
            }
            return;
        }
        lastUsages = data.usages || [];
        if (lastUsages.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-white/50">Активаций пока нет</td></tr>';
            return;
        }
        tableBody.innerHTML = lastUsages
            .map((u) => {
                const userLabel = u.username ? `@${escapeHtml(u.username)}` : 'Юзер';
                let rewardDisplay = '—';
                if (u.promo_type === 'universal') rewardDisplay = `+${u.reward_value} дн.`;
                else if (u.promo_type === 'balance') rewardDisplay = `+${u.reward_value} ₽`;
                else {
                    const val = u.discount_percent ? `${u.discount_percent}%` : `${u.discount_amount} ₽`;
                    rewardDisplay = val;
                }
                return `
                <tr class="border-b border-white/5 hover:bg-white/5">
                    <td class="px-4 py-3 text-white font-medium">${userLabel}</td>
                    <td class="px-4 py-3 text-white/50 font-mono text-xs">${u.user_id}</td>
                    <td class="px-4 py-3 text-white">${rewardDisplay}</td>
                    <td class="px-4 py-3 text-white/50 text-xs">${formatRelativeTime(u.used_at)}</td>
                </tr>`;
            })
            .join('');
    };

    function exportUsagesCsv() {
        if (!lastUsages.length) {
            window.showToast?.('info', 'Нет данных для экспорта');
            return;
        }
        const code = $('usage-promo-name')?.textContent || 'promo';
        const rows = [['user', 'user_id', 'reward', 'used_at']];
        lastUsages.forEach((u) => {
            let reward = '';
            if (u.promo_type === 'universal') reward = `+${u.reward_value}d`;
            else if (u.promo_type === 'balance') reward = `+${u.reward_value}`;
            else reward = u.discount_percent ? `${u.discount_percent}%` : `${u.discount_amount}`;
            rows.push([u.username || '', u.user_id, reward, u.used_at || '']);
        });
        const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `promo-${code}-usages.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    window.togglePromo = async function (code) {
        const { data } = await fetchJson(`/settings/promo/toggle/${encodeURIComponent(code)}`, { method: 'POST' });
        if (data.ok) {
            window.showToast?.('success', data.is_active ? 'Промокод активирован' : 'Промокод выключен');
            await loadPromos();
        } else {
            window.showToast?.('danger', data.error || 'Ошибка статуса');
        }
    };

    window.editPromo = async function (code) {
        const { data } = await fetchJson('/settings/promo/list');
        if (!data.ok) return;
        const promo = (data.promos || []).find((p) => p.code === code);
        if (!promo) return;

        $('edit-promo-code').value = promo.code;
        $('edit-code-display').value = promo.code;

        if (promo.promo_type === 'universal') {
            $('edit-discount-type-container')?.classList.add('hidden');
            $('edit-discount-value-container')?.classList.add('hidden');
            $('edit-reward-value-container')?.classList.remove('hidden');
            $('edit-balance-value-container')?.classList.add('hidden');
            document.querySelector('input[name="edit_reward_value"]').value = promo.reward_value || '';
        } else if (promo.promo_type === 'balance') {
            $('edit-discount-type-container')?.classList.add('hidden');
            $('edit-discount-value-container')?.classList.add('hidden');
            $('edit-reward-value-container')?.classList.add('hidden');
            $('edit-balance-value-container')?.classList.remove('hidden');
            const bal = document.querySelector('input[name="edit_balance_value"]');
            if (bal) bal.value = promo.reward_value || '';
        } else {
            $('edit-discount-type-container')?.classList.remove('hidden');
            $('edit-discount-value-container')?.classList.remove('hidden');
            $('edit-reward-value-container')?.classList.add('hidden');
            $('edit-balance-value-container')?.classList.add('hidden');
            const discountType = promo.discount_percent ? 'percent' : 'fixed';
            const radio = document.querySelector(`input[name="edit_discount_type"][value="${discountType}"]`);
            if (radio) radio.checked = true;
            document.querySelector('input[name="edit_discount_value"]').value =
                promo.discount_percent || promo.discount_amount || '';
        }

        document.querySelector('input[name="edit_usage_limit_total"]').value = promo.usage_limit_total || '';
        document.querySelector('input[name="edit_usage_limit_per_user"]').value = promo.usage_limit_per_user || '';
        document.querySelector('input[name="edit_valid_from"]').value = promo.valid_from ? promo.valid_from.slice(0, 16) : '';
        document.querySelector('input[name="edit_valid_until"]').value = promo.valid_until ? promo.valid_until.slice(0, 16) : '';
        document.querySelector('textarea[name="edit_description"]').value = promo.description || '';
        window.openModal?.('editPromoModal');
    };

    window.deletePromo = async function (code) {
        const confirmed = await window.showConfirm?.({
            title: 'Удаление промокода',
            message: `Удалить промокод «${code}»?`,
            type: 'danger',
            confirmText: 'Удалить',
            cancelText: 'Отмена',
        });
        if (!confirmed) return;
        const { data } = await fetchJson(`/settings/promo/delete/${encodeURIComponent(code)}`, { method: 'DELETE' });
        if (data.ok) {
            window.showToast?.('success', 'Промокод удалён');
            await loadPromos();
        } else {
            window.showToast?.('danger', data.error || 'Ошибка удаления');
        }
    };

    function applyPreset(preset) {
        const map = {
            discount10: { type: 0, discount: 10, discount_type: 'percent' },
            balance100: { type: 2, balance: 100 },
            days7: { type: 1, reward: 7 },
        };
        const cfg = map[preset];
        if (!cfg) return;
        if (cfg.type !== undefined) {
            const radios = document.querySelectorAll('input[name="promo_type"]');
            if (radios[cfg.type]) {
                radios[cfg.type].checked = true;
                window.togglePromoType(cfg.type);
            }
        }
        if (cfg.discount !== undefined) {
            const inp = document.querySelector('input[name="discount_value"]');
            if (inp) inp.value = cfg.discount;
            const sel = $('discount_type_select');
            if (sel) sel.value = cfg.discount_type || 'percent';
            if (window.initSoftSelect) window.initSoftSelect('discount_type_select', cfg.discount_type === 'fixed' ? '₽' : '%');
        }
        if (cfg.reward !== undefined) {
            const inp = document.querySelector('input[name="reward_value"]');
            if (inp) inp.value = cfg.reward;
        }
        if (cfg.balance !== undefined) {
            const inp = document.querySelector('input[name="balance_value"]');
            if (inp) inp.value = cfg.balance;
        }
    }

    function setInitialDates() {
        const from = $('promo_valid_from');
        if (!from || from.value) return;
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        from.value = `${y}-${m}-${d}T00:01`;
    }

    function initTabs() {
        document.querySelectorAll('[data-pms-tab]').forEach((btn) => {
            btn.addEventListener('click', () => switchPmsTab(btn.dataset.pmsTab));
        });
        $('pms-spotlight-select')?.addEventListener('change', syncReachPanel);
        $('pms-spotlight-save')?.addEventListener('click', () => {
            const code = $('pms-spotlight-select')?.value || '';
            setSpotlight(code);
        });
        $('pms-spotlight-clear')?.addEventListener('click', () => setSpotlight(''));
        $('pms-broadcast-draft')?.addEventListener('click', pushBroadcastDraft);
    }

    function initForm() {
        const form = $('promo-create-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            formData.append('csrf_token', window.getCsrfToken?.() || '');
            if (formData.get('code_mode') === 'auto') formData.delete('code');
            formData.delete('code_mode');

            const { data } = await fetchJson('/settings/promo/create', { method: 'POST', body: formData });
            if (data.ok) {
                window.showToast?.('success', `Промокод ${data.code} создан`);
                form.reset();
                setInitialDates();
                window.togglePromoType(0);
                window.movePromoIndicator(0);
                await loadPromos();
                switchPmsTab('vault');
            } else {
                window.showToast?.('danger', data.error || 'Ошибка создания');
            }
        });

        const editForm = $('promo-edit-form');
        if (editForm) {
            editForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = $('edit-promo-code')?.value;
                const formData = new FormData();
                formData.append('csrf_token', window.getCsrfToken?.() || '');

                const isUniversal = !$('edit-reward-value-container')?.classList.contains('hidden');
                const isBalance = !$('edit-balance-value-container')?.classList.contains('hidden');
                let promoType = 'discount';
                if (isUniversal) promoType = 'universal';
                else if (isBalance) promoType = 'balance';
                formData.append('promo_type', promoType);

                if (isUniversal) {
                    formData.append('reward_value', document.querySelector('input[name="edit_reward_value"]').value);
                } else if (isBalance) {
                    formData.append('balance_value', document.querySelector('input[name="edit_balance_value"]').value);
                } else {
                    const checked = document.querySelector('input[name="edit_discount_type"]:checked');
                    formData.append('discount_type', checked ? checked.value : 'percent');
                    formData.append('discount_value', document.querySelector('input[name="edit_discount_value"]').value);
                }

                formData.append('usage_limit_total', document.querySelector('input[name="edit_usage_limit_total"]').value);
                formData.append('usage_limit_per_user', document.querySelector('input[name="edit_usage_limit_per_user"]').value);
                formData.append('valid_from', document.querySelector('input[name="edit_valid_from"]').value);
                formData.append('valid_until', document.querySelector('input[name="edit_valid_until"]').value);
                formData.append('description', document.querySelector('textarea[name="edit_description"]').value);

                const { data } = await fetchJson(`/settings/promo/update/${encodeURIComponent(code)}`, {
                    method: 'POST',
                    body: formData,
                });
                if (data.ok) {
                    window.showToast?.('success', 'Промокод обновлён');
                    window.closeModal?.('editPromoModal');
                    await loadPromos();
                } else {
                    window.showToast?.('danger', data.error || 'Ошибка обновления');
                }
            });
        }

        document.querySelectorAll('[data-prm-preset]').forEach((btn) => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.prmPreset));
        });

        const manualInput = document.querySelector('#manual-code-field input[name="code"]');
        manualInput?.addEventListener('input', updateCodePreview);

        const daysInput = $('promo_days_input');
        const validFrom = $('promo_valid_from');
        const validUntil = $('promo_valid_until');
        daysInput?.addEventListener('input', function () {
            const days = parseInt(this.value, 10);
            if (isNaN(days) || days <= 0 || !validFrom?.value) return;
            const fromDate = new Date(validFrom.value);
            if (isNaN(fromDate.getTime())) return;
            const untilDate = new Date(fromDate.getTime() + days * 86400000);
            const y = untilDate.getFullYear();
            const m = String(untilDate.getMonth() + 1).padStart(2, '0');
            const d = String(untilDate.getDate()).padStart(2, '0');
            const hh = String(untilDate.getHours()).padStart(2, '0');
            const mm = String(untilDate.getMinutes()).padStart(2, '0');
            if (validUntil) validUntil.value = `${y}-${m}-${d}T${hh}:${mm}`;
        });

        $('prm-search')?.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderVault();
        });

        $('pms-sort')?.addEventListener('change', (e) => {
            sortOrder = e.target.value;
            renderVault();
        });

        document.querySelectorAll('[data-prm-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-prm-filter]').forEach((b) => b.classList.remove('is-on', 'is-active'));
                btn.classList.add('is-on');
                filterStatus = btn.dataset.prmFilter;
                renderVault();
            });
        });

        document.querySelectorAll('[data-prm-type-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-prm-type-filter]').forEach((b) => b.classList.remove('is-on', 'is-active'));
                btn.classList.add('is-on');
                filterType = btn.dataset.prmTypeFilter;
                renderVault();
            });
        });

        document.querySelectorAll('[data-prm-view]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-prm-view]').forEach((b) => b.classList.remove('is-on', 'is-active'));
                btn.classList.add('is-on');
                viewMode = btn.dataset.prmView;
                renderVault();
            });
        });

        $('prm-refresh')?.addEventListener('click', () => loadPromos());
        $('prm-usage-export')?.addEventListener('click', exportUsagesCsv);

        document.querySelectorAll('[data-pms-days]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.pmsDays, 10);
                const inp = $('promo_days_input');
                if (!inp || isNaN(days)) return;
                inp.value = String(days);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    function initFlatpickr() {
        if (!window.flatpickr) return;
        const cfg = {
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            minuteIncrement: 5,
            locale: flatpickr.l10ns.ru || 'ru',
            disableMobile: 'true',
        };
        if ($('promo_valid_from')) flatpickr('#promo_valid_from', cfg);
        if ($('promo_valid_until')) flatpickr('#promo_valid_until', cfg);
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('tab-promo')) return;
        initTabs();
        initForm();
        initFlatpickr();
        setInitialDates();
        if (window.initSoftSelect) window.initSoftSelect('discount_type_select', '%');
        window.togglePromoType(0);
        window.movePromoIndicator(0);
        loadPromos();
    });
})();
