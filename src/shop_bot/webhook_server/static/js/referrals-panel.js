/**
 * Referrals Studio — tabs, calculator, analytics
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'ref-studio-tab';

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

    function fmtRub(n) {
        const v = Number(n) || 0;
        return `${v.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
    }

    function resolveInitialTab() {
        const root = $('tab-referrals');
        if (!root) return 'overview';
        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash && root.querySelector(`[data-section-nav="${hash}"]`)) {
            return hash;
        }
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && root.querySelector(`[data-section-nav="${stored}"]`)) {
                return stored;
            }
        } catch (_) { /* ignore */ }
        return root.dataset.refDefaultTab || 'overview';
    }

    function initSectionHooks() {
        const root = $('tab-referrals');
        if (!root) return;

        root.querySelectorAll('[data-section-nav]').forEach((link) => {
            link.addEventListener('click', () => {
                const id = link.dataset.sectionNav || 'overview';
                try {
                    localStorage.setItem(STORAGE_KEY, id);
                } catch (_) { /* ignore */ }
                if (id === 'analytics') {
                    loadAnalytics();
                }
            });
        });

        root.querySelectorAll('[data-ref-goto]').forEach((el) => {
            el.addEventListener('click', () => {
                const id = el.dataset.refGoto || 'overview';
                root.querySelector(`[data-section-nav="${id}"]`)?.click();
            });
        });

        const initial = resolveInitialTab();
        const current = root.querySelector('[data-section-nav].is-active')?.dataset.sectionNav;
        if (initial !== current) {
            root.querySelector(`[data-section-nav="${initial}"]`)?.click();
        } else if (initial === 'analytics') {
            loadAnalytics();
        }
    }

    function readRewardType() {
        const checked = document.querySelector('input[name="referral_reward_type"]:checked');
        return checked ? checked.value : 'percent_purchase';
    }

    function syncRewardPanes() {
        const type = readRewardType();
        document.querySelectorAll('.ref-type-card').forEach((card) => {
            card.classList.toggle('is-active', card.dataset.refType === type);
        });
        document.querySelectorAll('.ref-reward-pane').forEach((pane) => {
            pane.hidden = pane.dataset.refReward !== type;
        });
        updateCalculator();
        updateSharePreview();
    }

    function initRewardTypes() {
        document.querySelectorAll('.ref-type-card').forEach((card) => {
            card.addEventListener('click', () => {
                const input = card.querySelector('input[type="radio"]');
                if (input) {
                    input.checked = true;
                    syncRewardPanes();
                }
            });
        });
        syncRewardPanes();
    }

    function initPayoutMode() {
        const hidden = $('referral_payout_mode');
        if (!hidden) return;
        document.querySelectorAll('[data-ref-payout]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.refPayout || 'main_balance';
                hidden.value = mode;
                document.querySelectorAll('[data-ref-payout]').forEach((b) => {
                    b.classList.toggle('is-active', b.dataset.refPayout === mode);
                });
            });
        });
    }

    function updateCalculator() {
        const amountEl = $('ref-calc-amount');
        const outRef = $('ref-calc-referrer');
        const outFriend = $('ref-calc-friend');
        if (!amountEl || !outRef || !outFriend) return;

        const amount = parseFloat(amountEl.value) || 0;
        const type = readRewardType();
        let referrer = 0;
        if (type === 'percent_purchase') {
            referrer = amount * (parseFloat(document.querySelector('[name="referral_percentage"]')?.value) || 0) / 100;
        } else if (type === 'fixed_purchase') {
            referrer = parseFloat(document.querySelector('[name="fixed_referral_bonus_amount"]')?.value) || 0;
        } else {
            referrer = parseFloat(document.querySelector('[name="referral_on_start_referrer_amount"]')?.value) || 0;
        }
        const discount = parseFloat(document.querySelector('[name="referral_discount"]')?.value) || 0;
        const friendSave = amount * discount / 100;

        outRef.textContent = type === 'fixed_start_referrer'
            ? fmtRub(referrer) + ' за регистрацию'
            : fmtRub(referrer);
        outFriend.textContent = discount > 0 ? `−${fmtRub(friendSave)} (${discount}%)` : '—';
    }

    function initCalculator() {
        ['ref-calc-amount', 'referral_percentage', 'fixed_referral_bonus_amount', 'referral_on_start_referrer_amount', 'referral_discount'].forEach((id) => {
            const el = id.startsWith('ref-') ? $(id) : document.querySelector(`[name="${id}"]`);
            el?.addEventListener('input', updateCalculator);
        });
        updateCalculator();
    }

    function updateSharePreview() {
        const preview = $('ref-share-preview');
        const textarea = document.querySelector('[name="referral_share_message"]');
        if (!preview) return;
        const discount = document.querySelector('[name="referral_discount"]')?.value || '0';
        const template = (textarea?.value || '').trim() || window.REF_PANEL_BOOT?.defaultShare || '';
        preview.textContent = template.replace(/\{discount\}/g, discount) || `Скидка ${discount}% для друга`;
    }

    function initSharePreview() {
        document.querySelector('[name="referral_share_message"]')?.addEventListener('input', updateSharePreview);
        document.querySelector('[name="referral_discount"]')?.addEventListener('input', updateSharePreview);
        updateSharePreview();
    }

    function updateEnablePill() {
        const cb = $('enable_referrals');
        const pill = $('ref-status-pill');
        if (!cb || !pill) return;
        const on = cb.checked;
        pill.classList.toggle('ref-stat--ok', on);
        pill.classList.toggle('ref-stat--warn', !on);
        const text = pill.querySelector('.ref-stat__text');
        if (text) text.textContent = on ? 'Активна' : 'Выключена';
    }

    function initEnableToggle() {
        $('enable_referrals')?.addEventListener('change', updateEnablePill);
        updateEnablePill();
    }

    async function loadAnalytics() {
        const lb = $('ref-leaderboard-body');
        const signups = $('ref-signups-body');
        const bonuses = $('ref-bonuses-body');
        if (!lb) return;

        lb.innerHTML = '<tr><td colspan="5" class="ref-empty">Загрузка…</td></tr>';
        if (signups) signups.innerHTML = '<tr><td colspan="4" class="ref-empty">Загрузка…</td></tr>';
        if (bonuses) bonuses.innerHTML = '<tr><td colspan="4" class="ref-empty">Загрузка…</td></tr>';

        try {
            const [lbResp, recentResp] = await Promise.all([
                fetch('/settings/referrals/leaderboard?limit=15', { credentials: 'same-origin' }),
                fetch('/settings/referrals/recent?limit=15', { credentials: 'same-origin' }),
            ]);
            const lbData = await lbResp.json();
            const recentData = await recentResp.json();

            if (lbData.ok && lbData.items?.length) {
                lb.innerHTML = lbData.items.map((row, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td><a href="/users?user_id=${row.telegram_id}">${escapeHtml(row.username ? '@' + row.username : row.telegram_id)}</a></td>
                        <td>${row.ref_count}</td>
                        <td>${fmtRub(row.earned)}</td>
                        <td>${fmtRub(row.ref_revenue)}</td>
                    </tr>`).join('');
            } else {
                lb.innerHTML = '<tr><td colspan="5" class="ref-empty">Пока нет рефереров</td></tr>';
            }

            if (signups && recentData.ok) {
                const rows = recentData.signups || [];
                signups.innerHTML = rows.length
                    ? rows.map((r) => `
                        <tr>
                            <td>${escapeHtml(r.registration_date || '—')}</td>
                            <td>${escapeHtml(r.username ? '@' + r.username : r.telegram_id)}</td>
                            <td>${escapeHtml(r.referrer_username ? '@' + r.referrer_username : r.referred_by)}</td>
                            <td>${fmtRub(r.total_spent)}</td>
                        </tr>`).join('')
                    : '<tr><td colspan="4" class="ref-empty">Нет регистраций</td></tr>';
            }

            if (bonuses && recentData.ok) {
                const rows = recentData.bonuses || [];
                bonuses.innerHTML = rows.length
                    ? rows.map((r) => `
                        <tr>
                            <td>${escapeHtml(r.created_date || '—')}</td>
                            <td>${escapeHtml(r.username || r.user_id)}</td>
                            <td>${fmtRub(r.amount_rub)}</td>
                            <td>${escapeHtml((r.metadata || '').slice(0, 40))}</td>
                        </tr>`).join('')
                    : '<tr><td colspan="4" class="ref-empty">Нет начислений</td></tr>';
            }
        } catch (_) {
            lb.innerHTML = '<tr><td colspan="5" class="ref-empty">Ошибка загрузки</td></tr>';
        }
    }

    function init() {
        if (!$('tab-referrals')?.classList.contains('ref-panel')) return;
        initSectionHooks();
        initRewardTypes();
        initPayoutMode();
        initCalculator();
        initSharePreview();
        initEnableToggle();
    }

    window.reinitReferralsPanel = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
