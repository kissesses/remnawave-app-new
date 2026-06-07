(function () {
    'use strict';

    const root = document.getElementById('user-timeline-app');
    if (!root) return;

    const userId = parseInt(root.dataset.userId, 10);
    const escapeHtml = window.panelEscapeHtml || ((v) => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'));

    const ACCENT_CLASS = {
        green: 'ut-accent-green',
        orange: 'ut-accent-orange',
        blue: 'ut-accent-blue',
        purple: 'ut-accent-purple',
        cyan: 'ut-accent-cyan',
        red: 'ut-accent-red',
        yellow: 'ut-accent-yellow',
        pink: 'ut-accent-pink',
        violet: 'ut-accent-violet',
        gray: 'ut-accent-gray',
    };

    const state = {
        category: 'all',
        q: '',
        from: '',
        to: '',
        offset: 0,
        limit: 50,
        groupDays: true,
        events: [],
        days: [],
        hasMore: false,
        loading: false,
        categories: [],
        categoryCounts: {},
    };

    const els = {
        stats: document.getElementById('ut-stats'),
        chips: document.getElementById('ut-status-chips'),
        categories: document.getElementById('ut-categories'),
        timeline: document.getElementById('ut-timeline'),
        loading: document.getElementById('ut-loading'),
        empty: document.getElementById('ut-empty'),
        count: document.getElementById('ut-result-count'),
        loadMoreWrap: document.getElementById('ut-load-more-wrap'),
        loadMore: document.getElementById('ut-load-more'),
        search: document.getElementById('ut-search'),
        dateFrom: document.getElementById('ut-date-from'),
        dateTo: document.getElementById('ut-date-to'),
        groupDays: document.getElementById('ut-group-days'),
        insights: document.getElementById('ut-insights'),
        sparkline: document.getElementById('ut-sparkline'),
        presets: document.getElementById('ut-presets'),
    };

    function formatMoney(amount, signed) {
        if (amount == null || Number.isNaN(Number(amount))) return '';
        const n = Number(amount);
        const abs = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (signed) {
            const cls = n >= 0 ? 'ut-amount--pos' : 'ut-amount--neg';
            const sign = n >= 0 ? '+' : '−';
            return `<span class="ut-amount ${cls}">${sign}${abs} ₽</span>`;
        }
        return `<span class="ut-amount">${abs} ₽</span>`;
    }

    function formatTime(ts) {
        if (!ts) return '—';
        const d = new Date(String(ts).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return ts;
        return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function formatDayLabel(day) {
        if (!day || day === '—') return 'Без даты';
        const d = new Date(day + 'T12:00:00');
        if (Number.isNaN(d.getTime())) return day;
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        if (sameDay(d, today)) return 'Сегодня';
        if (sameDay(d, yesterday)) return 'Вчера';
        return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function statusBadge(status, label) {
        const s = (status || '').toLowerCase();
        const ok = ['paid', 'completed', 'success', 'sent', 'info', 'open'].includes(s);
        const fail = ['failed', 'expired', 'banned', 'cancelled'].includes(s);
        const cls = ok ? 'ut-badge--status-ok' : (fail ? 'ut-badge--status-fail' : '');
        const text = label || status || '';
        if (!text) return '';
        return `<span class="ut-badge ${cls}">${escapeHtml(text)}</span>`;
    }

    function renderEvent(evt, index) {
        const accent = ACCENT_CLASS[evt.accent] || ACCENT_CLASS.blue;
        const amountHtml = evt.amount != null && evt.kind !== 'support_message'
            ? formatMoney(evt.amount, evt.amount_signed)
            : '';
        const badges = (evt.badges || []).map((b) => `<span class="ut-badge">${escapeHtml(b)}</span>`).join('');
        const links = (evt.links || []).map((l) =>
            `<a href="${escapeHtml(l.href)}" class="ut-event__link">${escapeHtml(l.label)}</a>`
        ).join('');
        const metaJson = evt.meta && Object.keys(evt.meta).length
            ? JSON.stringify(evt.meta, null, 2)
            : '';
        const expandBlock = metaJson
            ? `<div class="ut-event__expand hidden" data-expand>
                <pre class="ut-event__meta">${escapeHtml(metaJson)}</pre>
               </div>
               <button type="button" class="ut-event__toggle" data-toggle-meta>Подробнее</button>`
            : '';

        return `
        <article class="ut-event ${accent}" style="animation-delay:${Math.min(index * 0.03, 0.45)}s">
            <span class="ut-event__dot"></span>
            <div class="ut-event__card" data-event-id="${escapeHtml(evt.id)}">
                <div class="ut-event__head">
                    <div class="ut-event__icon">
                        <span class="material-symbols-outlined">${escapeHtml(evt.icon || 'info')}</span>
                    </div>
                    <div class="ut-event__body">
                        <div class="ut-event__title-row">
                            <h3 class="ut-event__title">${escapeHtml(evt.title)}</h3>
                            <time class="ut-event__time">${formatTime(evt.ts)}</time>
                        </div>
                        ${evt.subtitle ? `<p class="ut-event__subtitle">${escapeHtml(evt.subtitle)}</p>` : ''}
                        ${evt.description ? `<p class="ut-event__desc">${escapeHtml(evt.description)}</p>` : ''}
                        <div class="ut-event__footer">
                            ${statusBadge(evt.status, evt.status_label)}
                            ${badges}
                            ${amountHtml}
                            ${links}
                        </div>
                        ${expandBlock}
                    </div>
                </div>
            </div>
        </article>`;
    }

    function renderTimeline(append, batchDays, batchEvents) {
        const sourceDays = append
            ? (batchDays || [])
            : (state.groupDays && state.days.length ? state.days : [{ day: '', events: state.events }]);

        if (!append) els.timeline.innerHTML = '';

        if (!sourceDays.length && !(batchEvents || []).length && !state.events.length) {
            els.timeline.classList.add('hidden');
            els.empty.classList.remove('hidden');
            return;
        }

        const groups = append
            ? (state.groupDays && sourceDays.length
                ? sourceDays
                : [{ day: '', events: batchEvents || [] }])
            : (state.groupDays && state.days.length
                ? state.days
                : [{ day: '', events: state.events }]);

        const html = groups.map((group) => {
            const eventsHtml = (group.events || []).map((evt, i) => renderEvent(evt, i)).join('');
            if (!eventsHtml) return '';
            if (state.groupDays && group.day) {
                return `
                <section class="ut-day" data-day="${escapeHtml(group.day)}">
                    <div class="ut-day__label">
                        <span class="material-symbols-outlined" style="font-size:1rem">calendar_today</span>
                        ${escapeHtml(formatDayLabel(group.day))}
                    </div>
                    <div class="ut-day__events">${eventsHtml}</div>
                </section>`;
            }
            return `<div class="ut-day"><div class="ut-day__events">${eventsHtml}</div></div>`;
        }).join('');

        if (append && html) {
            if (state.groupDays && batchDays?.length) {
                batchDays.forEach((group) => {
                    const existing = els.timeline.querySelector(`[data-day="${group.day}"]`);
                    if (existing) {
                        existing.querySelector('.ut-day__events')?.insertAdjacentHTML(
                            'beforeend',
                            (group.events || []).map((evt, i) => renderEvent(evt, i)).join('')
                        );
                    } else {
                        els.timeline.insertAdjacentHTML('beforeend', `
                        <section class="ut-day" data-day="${escapeHtml(group.day)}">
                            <div class="ut-day__label">
                                <span class="material-symbols-outlined" style="font-size:1rem">calendar_today</span>
                                ${escapeHtml(formatDayLabel(group.day))}
                            </div>
                            <div class="ut-day__events">${(group.events || []).map((evt, i) => renderEvent(evt, i)).join('')}</div>
                        </section>`);
                    }
                });
            } else {
                els.timeline.querySelector('.ut-day__events')?.insertAdjacentHTML(
                    'beforeend',
                    (batchEvents || []).map((evt, i) => renderEvent(evt, i)).join('')
                );
            }
        } else if (html) {
            els.timeline.innerHTML = html;
        }

        els.timeline.classList.toggle('hidden', !state.events.length);
        els.empty.classList.toggle('hidden', !!state.events.length);
        els.loadMoreWrap.classList.toggle('hidden', !state.hasMore);
    }

    function renderStats(stats, user) {
        if (!stats) return;
        els.stats.innerHTML = `
            <div class="ut-stat">
                <span class="ut-stat__label">События</span>
                <span class="ut-stat__value">${stats.total_events || 0}</span>
                <span class="ut-stat__sub">в ленте</span>
            </div>
            <div class="ut-stat">
                <span class="ut-stat__label">Платежи</span>
                <span class="ut-stat__value">${(stats.payments_sum || 0).toLocaleString('ru-RU')} ₽</span>
                <span class="ut-stat__sub">${stats.payments_count || 0} операций</span>
            </div>
            <div class="ut-stat">
                <span class="ut-stat__label">Поддержка</span>
                <span class="ut-stat__value">${stats.support_tickets || 0}</span>
                <span class="ut-stat__sub">тикетов</span>
            </div>
            <div class="ut-stat">
                <span class="ut-stat__label">Баланс</span>
                <span class="ut-stat__value">${(stats.balance || 0).toLocaleString('ru-RU')} ₽</span>
                <span class="ut-stat__sub">потрачено ${(stats.total_spent || 0).toLocaleString('ru-RU')} ₽</span>
            </div>`;

        const chips = [];
        if (user?.is_banned) chips.push('<span class="ut-chip ut-chip--ban">Заблокирован</span>');
        if (user?.trial_used) chips.push('<span class="ut-chip ut-chip--trial">Trial использован</span>');
        if (user?.is_pinned) chips.push('<span class="ut-chip ut-chip--pin">Закреплён</span>');
        if (user?.referral_count) chips.push(`<span class="ut-chip">Рефералов: ${user.referral_count}</span>`);
        els.chips.innerHTML = chips.join('');
    }

    function renderInsights(stats) {
        if (!els.insights || !stats?.insights) return;
        const ins = stats.insights;
        const items = [];
        if (ins.days_since_registration != null) {
            items.push({ icon: 'calendar_month', label: 'С нами', value: `${ins.days_since_registration} дн.` });
        }
        if (ins.ltv != null) {
            items.push({ icon: 'payments', label: 'LTV', value: `${Number(ins.ltv).toLocaleString('ru-RU')} ₽` });
        }
        if (ins.avg_payment > 0) {
            items.push({ icon: 'avg_pace', label: 'Средний чек', value: `${Number(ins.avg_payment).toLocaleString('ru-RU')} ₽` });
        }
        if (ins.first_payment_at) {
            items.push({ icon: 'first_page', label: 'Первый платёж', value: formatTime(ins.first_payment_at) });
        }
        if (ins.last_payment_at) {
            items.push({ icon: 'schedule', label: 'Последний платёж', value: formatTime(ins.last_payment_at) });
        }
        if (stats.last_activity_ms) {
            items.push({ icon: 'bolt', label: 'Последняя активность', value: formatTime(new Date(stats.last_activity_ms).toISOString().slice(0, 19).replace('T', ' ')) });
        }
        els.insights.innerHTML = items.slice(0, 6).map((it) => `
            <li class="ut-insights__item">
                <span class="material-symbols-outlined">${escapeHtml(it.icon)}</span>
                <div>
                    <span class="ut-insights__label">${escapeHtml(it.label)}</span>
                    <span class="ut-insights__value">${escapeHtml(it.value)}</span>
                </div>
            </li>`).join('') || '<li class="ut-insights__empty">Нет данных</li>';
    }

    function renderSparkline(sparkline) {
        if (!els.sparkline || !sparkline?.length) return;
        const max = Math.max(...sparkline.map((d) => d.count || 0), 1);
        els.sparkline.innerHTML = sparkline.map((d) => {
            const h = Math.round(((d.count || 0) / max) * 100);
            const title = `${d.day}: ${d.count} событ.`;
            return `<span class="ut-sparkline__bar" style="height:${Math.max(h, 4)}%" title="${escapeHtml(title)}"></span>`;
        }).join('');
    }

    function applyDatePreset(days) {
        document.querySelectorAll('.ut-preset').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.preset === String(days));
        });
        if (days === 'all') {
            state.from = '';
            state.to = '';
            if (els.dateFrom) els.dateFrom.value = '';
            if (els.dateTo) els.dateTo.value = '';
            resetAndLoad();
            return;
        }
        const n = parseInt(days, 10);
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - (n - 1));
        const fmt = (d) => d.toISOString().slice(0, 10);
        state.from = fmt(from);
        state.to = fmt(to);
        if (els.dateFrom) els.dateFrom.value = state.from;
        if (els.dateTo) els.dateTo.value = state.to;
        resetAndLoad();
    }

    function renderCategories(categories, counts) {
        if (!categories?.length) return;
        els.categories.innerHTML = categories.map((cat) => {
            const cnt = counts?.[cat.id] ?? 0;
            return `
            <li>
                <button type="button" class="ut-cat${state.category === cat.id ? ' is-active' : ''}" data-category="${escapeHtml(cat.id)}">
                    <span class="material-symbols-outlined" style="font-size:1.1rem">${escapeHtml(cat.icon)}</span>
                    ${escapeHtml(cat.label)}
                    <span class="ut-cat__count">${cnt}</span>
                </button>
            </li>`;
        }).join('');
    }

    async function fetchTimeline(append) {
        if (state.loading) return;
        state.loading = true;
        if (!append) {
            els.loading.classList.remove('hidden');
            els.timeline.classList.add('hidden');
            els.empty.classList.add('hidden');
        }

        const params = new URLSearchParams({
            category: state.category,
            limit: String(state.limit),
            offset: String(append ? state.offset : 0),
        });
        if (state.q) params.set('q', state.q);
        if (state.from) params.set('from', state.from);
        if (state.to) params.set('to', state.to);

        try {
            const res = await fetch(`/users/${userId}/timeline.json?${params}`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'load failed');

            if (!append) {
                state.events = [];
                state.days = [];
                state.offset = 0;
            }

            state.events = state.events.concat(data.events || []);
            if (state.groupDays) {
                (data.days || []).forEach((dayGroup) => {
                    const existing = state.days.find((d) => d.day === dayGroup.day);
                    if (existing) {
                        existing.events.push(...(dayGroup.events || []));
                    } else {
                        state.days.push({ day: dayGroup.day, events: [...(dayGroup.events || [])] });
                    }
                });
            } else {
                state.days = [{ day: '', events: state.events }];
            }

            state.offset = state.events.length;
            state.hasMore = !!data.has_more;
            state.categories = data.categories || state.categories;
            state.categoryCounts = data.category_counts || {};

            renderStats(data.stats, data.user);
            renderInsights(data.stats);
            renderSparkline(data.stats?.activity_sparkline);
            renderCategories(state.categories, state.categoryCounts);
            renderTimeline(append, data.days, data.events);

            const shown = state.events.length;
            const total = data.total ?? shown;
            els.count.textContent = `Показано ${shown} из ${total} событий`;

            if (data.user?.avatar_url) {
                const wrap = document.getElementById('ut-avatar-wrap');
                let img = document.getElementById('ut-avatar');
                if (wrap && !img) {
                    img = document.createElement('img');
                    img.id = 'ut-avatar';
                    img.className = 'ut-profile__avatar-img';
                    img.alt = '';
                    wrap.appendChild(img);
                }
                if (img) {
                    img.src = data.user.avatar_url;
                    wrap?.classList.add('has-photo');
                }
            }
        } catch (err) {
            console.error(err);
            if (!append) {
                els.empty.classList.remove('hidden');
                els.count.textContent = 'Ошибка загрузки';
            }
            if (typeof window.showToast === 'function') {
                window.showToast('danger', 'Не удалось загрузить ленту');
            }
        } finally {
            state.loading = false;
            els.loading.classList.add('hidden');
        }
    }

    function resetAndLoad() {
        state.offset = 0;
        state.events = [];
        state.days = [];
        fetchTimeline(false);
    }

    let searchDebounce = null;
    els.search?.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            state.q = els.search.value.trim();
            resetAndLoad();
        }, 350);
    });

    els.dateFrom?.addEventListener('change', () => {
        state.from = els.dateFrom.value;
        resetAndLoad();
    });
    els.dateTo?.addEventListener('change', () => {
        state.to = els.dateTo.value;
        resetAndLoad();
    });

    els.groupDays?.addEventListener('change', () => {
        state.groupDays = els.groupDays.checked;
        resetAndLoad();
    });

    document.getElementById('ut-reset-filters')?.addEventListener('click', () => {
        state.category = 'all';
        state.q = '';
        state.from = '';
        state.to = '';
        if (els.search) els.search.value = '';
        if (els.dateFrom) els.dateFrom.value = '';
        if (els.dateTo) els.dateTo.value = '';
        document.querySelectorAll('.ut-preset').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.preset === 'all');
        });
        resetAndLoad();
    });

    els.presets?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-preset]');
        if (!btn) return;
        applyDatePreset(btn.dataset.preset || 'all');
    });

    document.getElementById('ut-export-csv')?.addEventListener('click', () => {
        window.location.href = `/users/${userId}/timeline/export.csv`;
        if (typeof window.showToast === 'function') {
            window.showToast('success', 'CSV загружается…');
        }
    });

    document.getElementById('ut-copy-link')?.addEventListener('click', async () => {
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            if (typeof window.showToast === 'function') {
                window.showToast('success', 'Ссылка скопирована');
            }
        } catch (_) {
            if (typeof window.showToast === 'function') {
                window.showToast('warning', 'Не удалось скопировать');
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
            e.preventDefault();
            els.search?.focus();
        }
    });

    document.getElementById('ut-empty-reset')?.addEventListener('click', () => {
        document.getElementById('ut-reset-filters')?.click();
    });

    els.categories?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-category]');
        if (!btn) return;
        state.category = btn.dataset.category || 'all';
        resetAndLoad();
    });

    els.loadMore?.addEventListener('click', () => fetchTimeline(true));

    els.timeline?.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-toggle-meta]');
        if (!toggle) return;
        const card = toggle.closest('.ut-event__card');
        const expand = card?.querySelector('[data-expand]');
        if (!expand) return;
        const open = expand.classList.toggle('hidden');
        toggle.textContent = open ? 'Подробнее' : 'Скрыть';
        card?.classList.toggle('is-expanded', !open);
    });

    document.getElementById('ut-export')?.addEventListener('click', async () => {
        try {
            const res = await fetch(`/users/${userId}/timeline/export.json`, { credentials: 'same-origin' });
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `client-${userId}-timeline.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            if (typeof window.showToast === 'function') {
                window.showToast('success', 'Экспорт готов');
            }
        } catch (_) {
            if (typeof window.showToast === 'function') {
                window.showToast('danger', 'Ошибка экспорта');
            }
        }
    });

    document.getElementById('ut-open-modal')?.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        const btn = document.querySelector(`.btn-user-details[data-uid="${uid}"]`);
        if (btn) {
            btn.click();
            return;
        }
        window.location.href = `/users?q=${uid}`;
    });

    fetchTimeline(false);
})();
