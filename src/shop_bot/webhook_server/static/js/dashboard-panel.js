/**
 * Dashboard panel — charts, tables, speedtest, user groups.
 */
(function () {
    'use strict';

    const routes = window.__DASHBOARD_ROUTES__ || {};

    function applyToggleStat(mode) {
        const hView = document.getElementById('view-stat-heleket');
        const tView = document.getElementById('view-stat-ton');
        const icon = document.getElementById('toggle-stat-icon');
        if (!hView || !tView) return;
        if (mode === 'heleket') {
            hView.classList.remove('hidden');
            tView.classList.add('hidden');
            if (icon) icon.textContent = 'payments';
        } else {
            hView.classList.add('hidden');
            tView.classList.remove('hidden');
            if (icon) icon.textContent = 'account_balance_wallet';
        }
    }

    window.toggleStat = function (event) {
        if (event) event.stopPropagation();
        const current = localStorage.getItem('dashboard_toggle_stat') || 'heleket';
        const next = current === 'heleket' ? 'ton' : 'heleket';
        localStorage.setItem('dashboard_toggle_stat', next);
        applyToggleStat(next);
    };

    window.togglePaymentStats = function () {
        const statsCont = document.getElementById('dash-stats');
        const icon = document.getElementById('icon-toggle-payments');
        if (!statsCont) return;
        const isHidden = statsCont.classList.toggle('hide-payments');
        localStorage.setItem('hide_payment_stats', isHidden);
        if (icon) icon.textContent = isHidden ? 'visibility_off' : 'visibility';
        if (typeof window.refreshDashboardSection === 'function') {
            window.refreshDashboardSection('dash-stats');
        }
    };

    (function initPaymentVisibility() {
        const isHidden = localStorage.getItem('hide_payment_stats') === 'true';
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('[data-fetch-url]').forEach((el) => {
                [...el.childNodes].forEach((n) => { if (n.nodeType === 3) n.remove(); });
            });
            if (isHidden) {
                document.getElementById('dash-stats')?.classList.add('hide-payments');
                const icon = document.getElementById('icon-toggle-payments');
                if (icon) icon.textContent = 'visibility_off';
            }
            applyToggleStat(localStorage.getItem('dashboard_toggle_stat') || 'heleket');
        });
    })();

    document.addEventListener('DOMContentLoaded', () => {
window.dashCharts = {};
        window.topChart = null;
        window.detailChart = null;

        // ===== НАСТРОЙКИ: Графики =====
        const getChartColors = () => {
            const isDark = document.documentElement.classList.contains('dark');
            return {
                bg: isDark ? 'rgba(11, 15, 14, 0.95)' : 'rgba(167, 243, 208, 0.98)',
                text: isDark ? '#e0e0e0' : '#0a0612',
                border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 77, 48, 0.2)'
            };
        };

        const getDashChartTheme = () => {
            const isDark = document.documentElement.classList.contains('dark');
            return {
                tick: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(60, 60, 67, 0.55)',
                grid: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.06)',
                border: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.08)',
                legend: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(60, 60, 67, 0.65)',
                tooltip: {
                    backgroundColor: isDark ? 'rgba(8, 12, 11, 0.92)' : 'rgba(255, 255, 255, 0.98)',
                    titleColor: isDark ? 'rgba(255, 255, 255, 0.9)' : '#1c1c1e',
                    bodyColor: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(60, 60, 67, 0.78)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
                    footerColor: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(60, 60, 67, 0.45)',
                }
            };
        };

        const buildChartConfig = () => {
            const theme = getDashChartTheme();
            return {
                type: 'line',
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { intersect: false, mode: 'index' },
                    layout: { padding: { top: 4, bottom: 4, left: 0, right: 4 } },
                    plugins: {
                        legend: { display: true, position: 'top', align: 'end', labels: { color: theme.legend, boxWidth: 8, boxHeight: 8, padding: 16, usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 10, weight: '600' } } },
                        tooltip: {
                            backgroundColor: theme.tooltip.backgroundColor,
                            titleColor: theme.tooltip.titleColor,
                            bodyColor: theme.tooltip.bodyColor,
                            borderColor: theme.tooltip.borderColor,
                            borderWidth: 1,
                            padding: { top: 10, bottom: 10, left: 14, right: 14 },
                            cornerRadius: 12,
                            usePointStyle: true,
                            boxPadding: 8,
                            titleFont: { family: 'Inter', size: 11, weight: '700' },
                            bodyFont: { family: 'Inter', size: 11, weight: '500' },
                            footerFont: { family: 'Inter', size: 10, weight: '700' },
                            footerColor: theme.tooltip.footerColor,
                            titleMarginBottom: 8,
                            footerMarginTop: 8,
                            displayColors: true,
                            caretSize: 5,
                            caretPadding: 10,
                            multiKeyBackground: 'transparent',
                            titleAlign: 'left',
                            bodyAlign: 'left',
                            bodySpacing: 6
                        }
                    },
                    scales: {
                        x: { ticks: { color: theme.tick, font: { family: 'Inter', size: 9, weight: '600' }, maxRotation: 0, padding: 6 }, grid: { color: theme.grid, drawOnChartArea: true, lineWidth: 1 }, border: { color: theme.border, dash: [3, 3] } },
                        y: { ticks: { color: theme.tick, font: { family: 'Inter', size: 9, weight: '600' }, padding: 8 }, grid: { color: theme.grid, lineWidth: 1, borderDash: [3, 4] }, border: { display: false }, beginAtZero: true }
                    }
                }
            };
        };

        let chartConfig = buildChartConfig();

        const applyDashboardChartTheme = (chart) => {
            if (!chart?.options) return;
            const theme = getDashChartTheme();
            chartConfig = buildChartConfig();
            ['x', 'y'].forEach(axis => {
                if (chart.options.scales?.[axis]) {
                    chart.options.scales[axis].ticks.color = theme.tick;
                    chart.options.scales[axis].grid.color = theme.grid;
                    if (chart.options.scales[axis].border) {
                        chart.options.scales[axis].border.color = theme.border;
                    }
                }
            });
            if (chart.options.plugins?.legend?.labels) {
                chart.options.plugins.legend.labels.color = theme.legend;
            }
            if (chart.options.plugins?.tooltip) {
                Object.assign(chart.options.plugins.tooltip, theme.tooltip);
            }
            chart.update('none');
        };

        // Слушатель для обновления графиков при смене темы
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    Object.values(window.dashCharts).forEach(chart => {
                        if (chart) applyDashboardChartTheme(chart);
                    });
                    if (window.topChart) applyDashboardChartTheme(window.topChart);
                    if (window.detailChart) applyDashboardChartTheme(window.detailChart);
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });

        // ===== ФУНКЦИЯ: Загрузка JSON =====
        const fetchJSON = async (url, params = {}) => {
            const query = new URLSearchParams(params).toString();
            try {
                const data = await apiRequest(url + (query ? '?' + query : ''), { headers: { 'Accept': 'application/json' } });
                return typeof data === 'string' ? JSON.parse(data) : data;
            } catch (e) { return null; }
        };

        // ===== ФУНКЦИЯ: Градиент =====
        const createGrad = (ctx, col, topAlpha = 0.2, midAlpha = 0.06) => {
            const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
            g.addColorStop(0, col.replace('1)', `${topAlpha})`));
            g.addColorStop(0.6, col.replace('1)', `${midAlpha})`));
            g.addColorStop(1, col.replace('1)', '0)'));
            return g;
        };

        // ===== ФУНКЦИЯ: UI Пагинации =====
        const updatePagUI = (type, cp, tp) => {
            const el = document.getElementById(`${type}-pagination`);
            if (!el) return;
            if (tp <= 1) { el.innerHTML = ''; return; }

            const url = new URL(window.location.href); const key = type === 'transactions' ? 'page' : 'trials_page';
            let html = `<div class="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 shadow-lg backdrop-blur-sm">`;

            if (cp > 1) {
                url.searchParams.set(key, cp - 1);
                html += `<a href="${url.toString()}" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all transform hover:-translate-x-0.5"><span class="material-symbols-outlined text-sm">chevron_left</span></a>`;
            }

            html += `<span class="px-3 py-1 flex items-center text-white/50 text-xs font-bold">${cp} <span class="mx-1 opacity-50">/</span> ${tp}</span>`;

            if (cp < tp) {
                url.searchParams.set(key, cp + 1);
                html += `<a href="${url.toString()}" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all transform hover:translate-x-0.5"><span class="material-symbols-outlined text-sm">chevron_right</span></a>`;
            }

            html += `</div>`;
            el.innerHTML = html;
        };

        // ===== СИСТЕМА АВТООБНОВЛЕНИЯ РАЗДЕЛОВ =====
        const autoRefreshRegistry = {};

        const refreshSection = async (id) => {
            const el = document.getElementById(id);
            if (!el || !el.dataset.fetchUrl) return;

            let fetchUrl = el.dataset.fetchUrl;
            if (id === 'dash-stats') {
                const isHidden = localStorage.getItem('hide_payment_stats') === 'true';
                const urlObj = new URL(fetchUrl, window.location.origin);
                urlObj.searchParams.set('hide_payments', isHidden);
                fetchUrl = urlObj.toString();
            }

            try {
                const res = await fetch(fetchUrl, { headers: { 'Accept': 'text/html' } });
                if (res.ok) {
                    const html = await res.text();
                    if (isLoginPage(html)) { window.location.reload(); return; }

                    const trimmedHtml = html.trim();
                    if (el.innerHTML !== trimmedHtml) {
                        el.style.opacity = '0.5';
                        setTimeout(() => {
                            el.innerHTML = trimmedHtml;
                            // Удалить текстовые узлы (BOM, пробелы) из grid-контейнеров
                            [...el.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
                            el.style.opacity = '1';
                        }, 150);
                    }
                }
            } catch (e) { console.error(`Refresh error (${id}):`, e); }
        };

        window.refreshDashboardSection = refreshSection;

        const initAutoRefresh = () => {
            document.querySelectorAll('[data-fetch-url][data-fetch-interval]').forEach(el => {
                const id = el.id;
                const interval = parseInt(el.dataset.fetchInterval);
                if (!id || !interval || autoRefreshRegistry[id]) return;

                autoRefreshRegistry[id] = setInterval(() => refreshSection(id), interval);

                if (id === 'dash-stats') {
                    setTimeout(() => refreshSection(id), 100);
                }
            });
        };

        // ===== ФУНКЦИЯ: Загрузка таблиц (Транзакции, Триалы) =====
        const loadTableData = async (type) => {
            const cont = document.getElementById(`dash-${type}`);
            const wrapper = document.getElementById(`${type}-wrapper`);
            const emptyEl = document.getElementById(`${type}-empty`);
            if (!cont) return;

            const urlObj = new URL(window.location.href);
            const pageParam = type === 'transactions' ? 'page' : 'trials_page';
            const page = urlObj.searchParams.get(pageParam) || 1;
            const baseUrl = cont.dataset.fetchUrl;

            try {
                const data = await fetchJSON(baseUrl, { page, lazy_load: 1 });
                if (data && data.html && data.html.trim().length > 0) {
                    cont.innerHTML = data.html;
                    wrapper.style.display = 'block';
                    if (emptyEl) emptyEl.style.display = 'none';
                    updatePagUI(type, parseInt(data.current_page), parseInt(data.total_pages));

                    if (!autoRefreshRegistry[`dash-${type}`] && cont.dataset.fetchInterval) {
                        autoRefreshRegistry[`dash-${type}`] = setInterval(() => refreshSection(`dash-${type}`), parseInt(cont.dataset.fetchInterval));
                    }
                } else {
                    wrapper.style.display = 'none';
                    if (emptyEl) emptyEl.classList.remove('hidden');
                    if (emptyEl) emptyEl.style.display = 'flex';
                    updatePagUI(type, 1, 1);
                }
            } catch (e) {
                console.error(`Load error (${type}):`, e);
                cont.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-400">Ошибка загрузки</td></tr>`;
            }
        };


        // ===== ОБРАБОТКА ПАГИНАЦИИ (AJAX) =====
        const handlePag = async (e, type) => {
            const link = e.target.closest('a');
            if (!link) return;

            e.preventDefault();
            const urlObj = new URL(link.href);
            const page = urlObj.searchParams.get(type === 'transactions' ? 'page' : 'trials_page');
            const cont = document.getElementById(`dash-${type}`);
            const url = type === 'transactions' ? routes.transactions : routes.trials;

            cont.style.opacity = '0.5';
            const data = await fetchJSON(url, { page, ajax_pagination: 1 });

            if (data) {
                cont.innerHTML = data.html;
                cont.dataset.fetchUrl = `${url}?page=${page}`;
                updatePagUI(type, parseInt(data.current_page), parseInt(data.total_pages));
                history.pushState({}, '', link.href);
            }
            cont.style.opacity = '1';
        };

        ['transactions', 'trials'].forEach(t => {
            const pag = document.getElementById(`${t}-pagination`);
            if (pag) {
                pag.addEventListener('click', e => handlePag(e, t));
            }
            loadTableData(t);
        });

        // ===== УПРАВЛЕНИЕ ГРАФИКАМИ =====
        window.dashCharts = {};

        const initMainChart = (id, label, obj) => {
            const ctx = document.getElementById(id)?.getContext('2d');
            if (!ctx) return;
            const dates = Object.keys(obj || {}).sort();
            const color = id === 'newUsersChart' ? '#22d3ee' : '#3b82f6';
            const colorRgba = id === 'newUsersChart' ? 'rgba(34, 211, 238, 1)' : 'rgba(59, 130, 246, 1)';
            const dataLen = dates.length;

            window.dashCharts[id] = new Chart(ctx, {
                ...chartConfig,
                data: {
                    labels: dates.map(d => d.slice(5, 10).replace(/-/g, '.')),
                    datasets: [{
                        label,
                        data: dates.map(d => obj[d] || 0),
                        borderColor: color,
                        backgroundColor: createGrad(ctx, colorRgba, 0.18, 0.04),
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: color,
                        pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                        pointBorderWidth: 2,
                        pointRadius: dataLen > 40 ? 0 : dataLen > 20 ? 2 : 3,
                        pointHoverRadius: 6,
                        pointHoverBorderWidth: 2,
                        pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)',
                        borderWidth: 2.5
                    }]
                },
                options: { ...chartConfig.options, plugins: { ...chartConfig.options.plugins, legend: { display: false } } }
            });
        };

        let currentIncomePeriod = '30d';
        const incomePeriodLabels = {
            today: 'Сегодня',
            '7d': '7 дней',
            '30d': '30 дней',
            '3m': '3 месяца',
            '6m': '6 месяцев',
            '12m': '1 год',
            all: 'Все время'
        };
        const formatRub = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
        const formatCount = (value) => `${Number(value || 0).toLocaleString('ru-RU')} шт.`;
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        const updateFinanceStats = (finance) => {
            const topups = finance?.topups || {};
            const subscriptions = finance?.subscriptions || {};
            const total = finance?.total || {};
            const totalAmount = Number(total.amount || 0);
            const topupsPercent = totalAmount > 0 ? Math.min(100, Math.max(0, Number(topups.amount || 0) / totalAmount * 100)) : 0;
            const subscriptionsPercent = totalAmount > 0 ? Math.min(100, Math.max(0, Number(subscriptions.amount || 0) / totalAmount * 100)) : 0;
            setText('finance-topups-amount', formatRub(topups.amount));
            setText('finance-topups-count', formatCount(topups.count));
            setText('finance-subscriptions-amount', formatRub(subscriptions.amount));
            setText('finance-subscriptions-count', formatCount(subscriptions.count));
            setText('finance-total-count', formatCount(total.count));
            setText('finance-total-amount', formatRub(total.amount));
            setText('period-total', formatRub(total.amount));
            const topupsBar = document.getElementById('finance-topups-bar');
            const subscriptionsBar = document.getElementById('finance-subscriptions-bar');
            if (topupsBar) topupsBar.style.width = `${topupsPercent}%`;
            if (subscriptionsBar) subscriptionsBar.style.width = `${subscriptionsPercent}%`;
        };

        window.setIncomePeriod = function (period, btn) {
            currentIncomePeriod = period;
            document.querySelectorAll('.dash-period-btn').forEach(b => {
                b.classList.remove('is-active');
            });
            btn.classList.add('is-active');
            refreshCharts();
        };

        const refreshCharts = async () => {
            const data = await fetchJSON(`${routes.charts}?period=${currentIncomePeriod}`);
            if (!data) return;

            if (!window.dashCharts['newUsersChart']) {
                initMainChart('newUsersChart', 'Новые пользователи', data.users);
                initMainChart('newKeysChart', 'Новые ключи', data.keys);
                initIncomeChart(data.income);
            } else {
                const update = (id, obj) => {
                    const chart = window.dashCharts[id];
                    if (!chart) return;
                    const dates = Object.keys(obj || {}).sort();
                    chart.data.labels = dates.map(d => {
                        if (currentIncomePeriod === 'today') return d.slice(11, 16);
                        return d.slice(5, 10).replace(/-/g, '.');
                    });
                    if (chart.data.datasets[0]) {
                        chart.data.datasets[0].data = dates.map(d => obj[d] || 0);
                    }
                    chart.update('none');
                };
                update('newUsersChart', data.users);
                update('newKeysChart', data.keys);
                updateIncomeChart(data.income);
            }
            updateFinanceStats(data.finance);
        };

        const methodColors = {
            'YooKassa': '#6366f1',
            'Platega': '#06b6d4',
            'Telegram Stars': '#f59e0b',
            'CryptoBot': '#8b5cf6',
            'Heleket': '#10b981',
            'TON Connect': '#00bfff',
            'Other': '#94a3b8'
        };

        const hexToRgba = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const getRelativeTimeJS = (dateStr, isHourly = false) => {
            if (isHourly) {
                const target = new Date(dateStr.replace(' ', 'T'));
                if (isNaN(target.getTime())) return "";
                const now = new Date();
                let diffHours = Math.floor((now - target) / 3600000);
                if (diffHours <= 0) return "менее 1 ч. назад";
                return `${diffHours} ч. назад`;
            }

            const parts = dateStr.split(' ')[0].split('-');
            const y = parts[0], m = parts[1], d = parts[2];
            if (!y || !m || !d) return "";

            const target = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            const diffTime = Math.max(0, now - target);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 0) return "сегодня";
            if (diffDays === 1) return "вчера";

            if (diffDays < 30) {
                return `${diffDays} д. назад`;
            }

            const diffMonths = Math.floor(diffDays / 30);
            if (diffMonths < 12) {
                return `${diffMonths} м. назад`;
            }

            const diffYears = Math.floor(diffDays / 365);
            return `${diffYears} г. назад`;
        };

        const initIncomeChart = (incomeData) => {
            const canvas = document.getElementById('incomeChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const dates = Object.keys(incomeData || {}).sort();

            const methods = new Set();
            Object.values(incomeData || {}).forEach(day => {
                Object.keys(day).forEach(m => methods.add(m));
            });
            if (!methods.size) ['YooKassa', 'Platega', 'Telegram Stars', 'CryptoBot', 'Heleket', 'TON Connect'].forEach(m => methods.add(m));

            const dataLen = dates.length;
            const datasets = Array.from(methods).map(method => ({
                label: method,
                data: dates.map(d => (incomeData[d] && incomeData[d][method]) || 0),
                borderColor: methodColors[method] || '#94a3b8',
                backgroundColor: createGrad(ctx, hexToRgba(methodColors[method] || '#94a3b8', 1), 0.15, 0.03),
                fill: true,
                tension: 0.4,
                pointRadius: (ctx) => {
                    const val = ctx.dataset.data[ctx.dataIndex];
                    return val > 0 ? (dataLen > 50 ? 0 : dataLen > 25 ? 2 : 3) : 0;
                },
                borderWidth: 2.5,
                pointHoverRadius: 6,
                pointHoverBorderWidth: 2,
                pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)',
                pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                pointBorderWidth: 2,
                pointBackgroundColor: methodColors[method] || '#94a3b8'
            }));

            let total = 0;
            Object.values(incomeData || {}).forEach(day => {
                Object.values(day).forEach(amt => total += amt);
            });
            document.getElementById('period-total').textContent = total.toLocaleString('ru-RU') + ' ₽';

            window.dashCharts['incomeChart'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates.map(d => {
                        if (currentIncomePeriod === 'today') return d.slice(11, 16);
                        return d.slice(5, 10).replace(/-/g, '.');
                    }),
                    fullDates: dates,
                    datasets: datasets
                },
                options: {
                    ...chartConfig.options,
                    plugins: {
                        ...chartConfig.options.plugins,
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: { color: getDashChartTheme().legend, usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, font: { family: 'Inter', size: 9, weight: '700' }, padding: 16 }
                        },
                        tooltip: {
                            ...chartConfig.options.plugins.tooltip,
                            mode: 'index',
                            intersect: false,
                            filter: function (tooltipItem) {
                                return tooltipItem.raw > 0;
                            },
                            callbacks: {
                                title: function (context) {
                                    if (!context || !context.length) return '';
                                    let chart = context[0].chart;
                                    let idx = context[0].dataIndex;
                                    let rawDate = chart.config.data.fullDates ? chart.config.data.fullDates[idx] : null;
                                    let displayTitle = context[0].label;
                                    if (rawDate) {
                                        let isHourly = currentIncomePeriod === 'today';
                                        let relTime = getRelativeTimeJS(rawDate, isHourly);

                                        let parts = rawDate.split(' ')[0].split('-');
                                        if (parts.length >= 3) {
                                            let dateFmt = `${parts[2]}.${parts[1]}.${parts[0].slice(-2)}`;
                                            if (isHourly) {
                                                displayTitle = `${dateFmt} ${context[0].label}`;
                                            } else {
                                                displayTitle = dateFmt;
                                            }
                                        }

                                        if (relTime) {
                                            return `${displayTitle}  ·  ${relTime}`;
                                        }
                                    }
                                    return displayTitle;
                                },
                                label: function (context) {
                                    const val = context.parsed.y;
                                    return `  ${context.dataset.label}:  ${val.toLocaleString('ru-RU')} ₽`;
                                },
                                footer: function (tooltipItems) {
                                    if (!tooltipItems || tooltipItems.length <= 1) return '';
                                    let sum = 0;
                                    tooltipItems.forEach(item => { sum += item.parsed.y; });
                                    return `──────────────\n  Итого:  ${sum.toLocaleString('ru-RU')} ₽`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ...chartConfig.options.scales.x, stacked: false },
                        y: { ...chartConfig.options.scales.y, stacked: false }
                    }
                }
            });
        };

        const updateIncomeChart = (incomeData) => {
            const chart = window.dashCharts['incomeChart'];
            if (!chart) return;
            const dates = Object.keys(incomeData || {}).sort();

            const methods = new Set();
            Object.values(incomeData).forEach(day => {
                Object.keys(day).forEach(m => methods.add(m));
            });

            const dataLen2 = dates.length;
            const datasets = Array.from(methods).map(method => ({
                label: method,
                data: dates.map(d => (incomeData[d] && incomeData[d][method]) || 0),
                borderColor: methodColors[method] || '#94a3b8',
                backgroundColor: createGrad(chart.ctx, hexToRgba(methodColors[method] || '#94a3b8', 1), 0.15, 0.03),
                fill: true,
                tension: 0.4,
                pointRadius: (ctx) => {
                    const val = ctx.dataset.data[ctx.dataIndex];
                    return val > 0 ? (dataLen2 > 50 ? 0 : dataLen2 > 25 ? 2 : 3) : 0;
                },
                borderWidth: 2.5,
                pointHoverRadius: 6,
                pointHoverBorderWidth: 2,
                pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)',
                pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                pointBorderWidth: 2,
                pointBackgroundColor: methodColors[method] || '#94a3b8'
            }));

            let total = 0;
            Object.values(incomeData).forEach(day => {
                Object.values(day).forEach(amt => total += amt);
            });
            document.getElementById('period-total').textContent = total.toLocaleString('ru-RU') + ' ₽';

            chart.data.labels = dates.map(d => {
                if (currentIncomePeriod === 'today') return d.slice(11, 16);
                return d.slice(5, 10).replace(/-/g, '.');
            });
            chart.data.fullDates = dates;
            chart.data.datasets = datasets;
            chart.update('none');
        };

        refreshCharts();

        // Автообновление графиков раз в 2 минуты
        setInterval(refreshCharts, 120000);

        // ===== ФУНКЦИЯ: Загрузка SSH данных =====
        const targetSelect = document.getElementById('st-target');
        const latestBox = document.getElementById('st-latest');
        const topCanvas = document.getElementById('st-top-canvas');

        let sshTargetsData = [];

        const loadSSHTargets = async () => {
            const data = await fetchJSON(routes.sshTargets);
            if (data && data.targets) {
                sshTargetsData = data.targets;
                targetSelect.innerHTML = data.targets.map(t => `<option value="${t.target_name}">${t.target_name}</option>`).join('');

                const cache = localStorage.getItem('st_target_cache');
                if (cache && Array.from(targetSelect.options).some(o => o.value === cache)) {
                    targetSelect.value = cache;
                }

                window.initSoftSelect('st-target', 'Выберите SSH цель...');

                targetSelect.addEventListener('change', () => {
                    localStorage.setItem('st_target_cache', targetSelect.value);
                    localStorage.setItem('st_target_time', Date.now());

                    const selected = sshTargetsData.find(t => t.target_name === targetSelect.value);
                    const ipSpan = document.getElementById('st-target-ip');
                    if (ipSpan) {
                        ipSpan.textContent = selected && selected.ssh_host ? `IP: ${selected.ssh_host}` : 'IP: —';
                    }

                    loadTop();
                });

                if (targetSelect.value) {
                    const selected = sshTargetsData.find(t => t.target_name === targetSelect.value);
                    const ipSpan = document.getElementById('st-target-ip');
                    if (ipSpan) {
                        ipSpan.textContent = selected && selected.ssh_host ? `IP: ${selected.ssh_host}` : 'IP: —';
                    }
                    loadTop();
                } else {
                    latestBox.textContent = 'Нет целей';
                }
            }
        };

        const loadTop = async () => {
            if (!targetSelect?.value || !topCanvas) return;
            const data = await fetchJSON(`${routes.hostSpeedtests.replace("__H__", encodeURIComponent(targetSelect.value))}`, { limit: 60 });
            if (!data?.ok) return;
            const items = (data.items || []).slice().reverse();
            if (latestBox) {
                const dateEl = document.getElementById('st-latest-date');
                if (items.length) {
                    const last = items[items.length - 1];
                    if (dateEl) dateEl.textContent = last.created_at;
                    const method = last.method ? `<span class='px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-primary text-[8px] font-black uppercase tracking-[0.18em]'>${last.method.toUpperCase()}</span>` : '';
                    const ping = `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[12px] text-white/40">timer</span><span class="text-white/60 font-bold">${last.ping_ms ?? '—'}</span><span class="text-white/25 text-[9px]">ms</span></span>`;
                    const down = `<span class="whitespace-nowrap flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#22d3ee] shadow-sm shadow-[#22d3ee]/50"></span><span class="text-white/60 font-bold">${last.download_mbps ?? '—'}</span><span class="text-white/25 text-[9px]">Mbps</span></span>`;
                    const up = `<span class="whitespace-nowrap flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#00bfff] shadow-sm shadow-[#00bfff]/50"></span><span class="text-white/60 font-bold">${last.upload_mbps ?? '—'}</span><span class="text-white/25 text-[9px]">Mbps</span></span>`;

                    latestBox.innerHTML = `
                        <div class="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1">
                            ${method}
                            <span class="text-white/10">·</span>
                            ${ping}
                            <span class="text-white/10">·</span>
                            ${down}
                            <span class="text-white/10">·</span>
                            ${up}
                        </div>
                    `;
                } else {
                    latestBox.textContent = 'Нет данных';
                    if (dateEl) dateEl.textContent = '—';
                }
            }
            const ctx = topCanvas.getContext('2d'); if (topChart) topChart.destroy();
            const stLen = items.length;
            topChart = new Chart(ctx, {
                ...chartConfig,
                data: {
                    labels: items.map(it => it.created_at.slice(5, 16).replace(/-/g, '.')),
                    datasets: [
                        {
                            label: 'Загрузка',
                            data: items.map(it => parseFloat(it.download_mbps) || 0),
                            borderColor: '#22d3ee',
                            backgroundColor: createGrad(ctx, 'rgba(34, 211, 238, 1)', 0.18, 0.04),
                            fill: true, tension: 0.4,
                            pointRadius: stLen > 40 ? 0 : stLen > 20 ? 2 : 3,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#22d3ee',
                            pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                            pointBorderWidth: 2,
                            pointHoverBorderWidth: 2,
                            pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)',
                            borderWidth: 2.5
                        },
                        {
                            label: 'Отдача',
                            data: items.map(it => parseFloat(it.upload_mbps) || 0),
                            borderColor: '#00bfff',
                            backgroundColor: createGrad(ctx, 'rgba(0, 191, 255, 1)', 0.15, 0.03),
                            fill: true, tension: 0.4,
                            pointRadius: stLen > 40 ? 0 : stLen > 20 ? 2 : 3,
                            pointHoverRadius: 6,
                            pointBackgroundColor: '#00bfff',
                            pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                            pointBorderWidth: 2,
                            pointHoverBorderWidth: 2,
                            pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)',
                            borderWidth: 2.5
                        }
                    ]
                },
                options: {
                    ...chartConfig.options,
                    plugins: {
                        ...chartConfig.options.plugins,
                        tooltip: {
                            ...chartConfig.options.plugins.tooltip,
                            callbacks: {
                                label: (ctx) => `  ${ctx.dataset.label}:  ${ctx.parsed.y.toFixed(1)} Mbps`
                            }
                        }
                    }
                }
            });
        };

        if (targetSelect) loadSSHTargets();


        // ===== ФУНКЦИЯ: Формы Speedtest =====
        const handleForm = (id, getUrl, delay) => {
            const form = document.getElementById(id);
            form?.addEventListener('submit', async (e) => {
                e.preventDefault(); openModal('speedtestRunningModal');
                try {
                    await fetch(getUrl(), { method: 'POST', body: new FormData(form), credentials: 'same-origin' });
                    setTimeout(() => { loadTop(); closeModal('speedtestRunningModal'); }, delay);
                } catch (e) { closeModal('speedtestRunningModal'); }
            });
        };
        handleForm('st-run-form', () => `${routes.speedtestRun.replace("__T__", encodeURIComponent(targetSelect.value))}`, 800);
        handleForm('st-run-all-form', () => document.getElementById('st-run-all-form').action, 1200);

        // ===== МОДАЛЬНЫЕ ОКНА =====
        let detailUrl = null;
        window.openSpeedtestModal = (host, url) => {
            detailUrl = url; const title = document.getElementById('st-modal-host');
            if (title) title.textContent = host; openModal('speedtestModal'); drawDetail();
        };
        const drawDetail = async () => {
            const canvas = document.getElementById('st-detail-canvas'); if (!canvas || !detailUrl) return;
            const metric = document.getElementById('st-metric')?.value || 'download_mbps';
            const data = await fetchJSON(detailUrl, { limit: document.getElementById('st-range')?.value || 60 });
            if (!data?.ok) return;
            const items = data.items.slice().reverse();
            const ctx = canvas.getContext('2d'); if (detailChart) detailChart.destroy();
            const metricColor = metric === 'ping_ms' ? '#f59e0b' : (metric === 'upload_mbps' ? '#00bfff' : '#22d3ee');
            const metricColorRgba = metric === 'ping_ms' ? 'rgba(245, 158, 11, 1)' : (metric === 'upload_mbps' ? 'rgba(0, 191, 255, 1)' : 'rgba(34, 211, 238, 1)');
            const metricUnit = metric === 'ping_ms' ? 'ms' : 'Mbps';
            const metricLabel = metric === 'ping_ms' ? 'Пинг' : (metric === 'upload_mbps' ? 'Отдача' : 'Загрузка');
            const dtLen = items.length;
            detailChart = new Chart(ctx, {
                ...chartConfig,
                data: {
                    labels: items.map(it => it.created_at),
                    datasets: [{
                        label: metricLabel,
                        data: items.map(it => Number(it[metric] || 0)),
                        borderColor: metricColor,
                        backgroundColor: createGrad(ctx, metricColorRgba, 0.18, 0.04),
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.4,
                        pointRadius: dtLen > 40 ? 0 : dtLen > 20 ? 2 : 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: metricColor,
                        pointBorderColor: 'rgba(11, 15, 14, 0.8)',
                        pointBorderWidth: 2,
                        pointHoverBorderWidth: 2,
                        pointHoverBorderColor: 'rgba(11, 15, 14, 0.9)'
                    }]
                },
                options: {
                    ...chartConfig.options,
                    plugins: {
                        ...chartConfig.options.plugins,
                        legend: { display: false },
                        tooltip: {
                            ...chartConfig.options.plugins.tooltip,
                            callbacks: {
                                label: (ctx) => `  ${metricLabel}:  ${ctx.parsed.y.toFixed(1)} ${metricUnit}`
                            }
                        }
                    }
                }
            });
        };
        ['st-metric', 'st-range', 'st-refresh'].forEach(id => {
            const el = document.getElementById(id); el?.addEventListener(el.tagName === 'BUTTON' ? 'click' : 'change', drawDetail);
        });

        // ===== МОДАЛЬНОЕ ОКНО ГРУПП ПОЛЬЗОВАТЕЛЕЙ =====
        window.currentUserGroupIds = [];
        window.copySingleId = function(event, id) {
            event.stopPropagation();
            const el = event.currentTarget;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(id).then(() => {
                    const original = el.textContent;
                    el.textContent = 'Скопировано!';
                    el.classList.add('text-primary');
                    setTimeout(() => {
                        el.textContent = original;
                        el.classList.remove('text-primary');
                    }, 1000);
                }).catch(err => console.error(err));
            }
        };

        window.copyUserGroupIds = function() {
            if (!window.currentUserGroupIds || window.currentUserGroupIds.length === 0) return;
            const uniqueIds = [...new Set(window.currentUserGroupIds)];
            const text = uniqueIds.join('\n');
            
            const btn = document.querySelector('#userGroupModal button[onclick="copyUserGroupIds()"]');
            const icon = btn ? btn.querySelector('.material-symbols-outlined') : null;
            
            const setSuccess = () => {
                if (icon) {
                    const oldText = icon.textContent;
                    icon.textContent = 'check';
                    icon.classList.add('text-primary');
                    setTimeout(() => {
                        icon.textContent = oldText;
                        icon.classList.remove('text-primary');
                    }, 2000);
                }
            };

            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(setSuccess).catch(err => {
                    console.error('Ошибка копирования:', err);
                });
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setSuccess();
            }
        };

        const escapeGroupHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));

        const formatGroupRub = (value) => `${(Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

        // ===== ВСПОМОГАТЕЛЬНЫЕ ДАННЫЕ ДЛЯ ЛЕНИВОЙ ЗАГРУЗКИ =====
        let _ugmAllItems = [];
        let _ugmRenderedCount = 0;
        let _ugmShowMonths = false;
        let _ugmColCount = 3;
        let _ugmObserver = null;
        const UGM_INITIAL = 15;
        const UGM_BATCH = 10;

        function _ugmBuildRow(item) {
            const uid = item.telegram_id || item.user_id;
            let username = item.username ? '@' + item.username : 'User #' + uid;
            let curBal = item.balance !== undefined ? parseFloat(item.balance) : 0;
            let totSp = item.total_spent !== undefined && item.total_spent !== null ? parseFloat(item.total_spent) : 0;

            let balanceHTML = `
                <div class="flex flex-col gap-1 min-w-[135px]">
                    <span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-primary text-[10px] font-bold cursor-help" title="Текущий баланс пользователя в боте">
                        <span class="material-symbols-outlined text-[13px]">account_balance_wallet</span>${formatGroupRub(curBal)}
                    </span>
                    <span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/45 text-[10px] font-bold cursor-help" title="Общая сумма всех успешных платежей пользователя">
                        <span class="material-symbols-outlined text-[13px]">payments</span>${formatGroupRub(totSp)}
                    </span>
                </div>`;

            let keyInfo = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/35 text-[10px] font-bold cursor-help" title="У пользователя нет ключа в этом сегменте"><span class="material-symbols-outlined text-[14px]">vpn_key_off</span>Нет ключа</span>`;
            if (item.key_id || item.host_name) {
                if (item.host_name && !item.telegram_id) {
                    username = item.username ? '@' + item.username : 'User #' + item.user_id;
                    balanceHTML = `<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/15 text-primary text-[10px] font-black cursor-help" title="Хост или сервер, на котором находится этот активный ключ"><span class="material-symbols-outlined text-[14px]">dns</span>${escapeGroupHtml(item.host_name)}</span>`;
                }
                let expText = '';
                let expClass = 'bg-cyan-500/10 border-cyan-500/15 text-emerald-300';
                let hostBadge = item.host_name ? `<span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/45 text-[10px] font-bold cursor-help" title="Хост или сервер, на котором находится этот ключ"><span class="material-symbols-outlined text-[13px]">dns</span>${escapeGroupHtml(item.host_name)}</span>` : '';
                if (item.expire_at) {
                    let expDate = new Date(item.expire_at.replace(' ', 'T'));
                    let diffTime = expDate - new Date();
                    if (diffTime > 0) {
                        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        expText = `осталось ${diffDays} дн.`;
                        if (diffDays <= 3) expClass = 'bg-orange-500/10 border-orange-500/15 text-orange-300';
                    } else {
                        expText = 'истёк'; expClass = 'bg-red-500/10 border-red-500/15 text-red-300';
                    }
                    keyInfo = `<div class="flex flex-col gap-1 min-w-[190px]"><span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-primary text-[10px] font-mono font-bold cursor-help" title="Это ID ключа в боте"><span class="material-symbols-outlined text-[13px] text-primary">vpn_key</span>id ${escapeGroupHtml(item.key_id)}</span>${hostBadge}<span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold cursor-help ${expClass}" title="Дата окончания ключа и сколько дней осталось до истечения"><span class="material-symbols-outlined text-[13px]">schedule</span>${escapeGroupHtml(expText)} · ${escapeGroupHtml(item.expire_at)}</span></div>`;
                } else {
                    keyInfo = `<div class="flex flex-col gap-1 min-w-[190px]"><span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-primary text-[10px] font-mono font-bold cursor-help" title="Это ID ключа в боте"><span class="material-symbols-outlined text-[13px] text-primary">vpn_key</span>id ${escapeGroupHtml(item.key_id)}</span>${hostBadge}<span class="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/15 text-primary text-[10px] font-bold cursor-help" title="У ключа не указана дата окончания, поэтому он считается безлимитным"><span class="material-symbols-outlined text-[13px]">all_inclusive</span>Безлимит</span></div>`;
                }
            }

            let charLetter = (username.startsWith('@') ? username.charAt(1) : username.charAt(0)) || '?';
            let monthsTd = '';
            if (_ugmShowMonths) {
                let monthsBought = item.months_bought || 0;
                monthsTd = `<td class="px-4 py-2 text-center"><span class="inline-flex items-center justify-center min-w-9 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/15 text-primary text-[10px] font-black tabular-nums cursor-help" title="Сколько месяцев подписки пользователь суммарно купил по успешным платежам">${escapeGroupHtml(monthsBought)}</span></td>`;
            }

            const profileUrl = `/users?q=${escapeGroupHtml(uid)}`;
            const actionsTd = `<td class="px-4 py-2 text-center"><a href="${profileUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/15 text-primary hover:bg-primary/20 text-[10px] font-bold transition-all" title="Открыть профиль пользователя в разделе управления пользователями"><span class="material-symbols-outlined text-[14px]">open_in_new</span>Профиль</a></td>`;

            return `<tr class="hover:bg-white/[0.035] transition-colors group">
                <td class="px-4 py-2"><div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-white/5 text-primary border border-primary/15 flex items-center justify-center font-black text-[11px] uppercase shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform cursor-help" title="Аватар пользователя: первая буква username или ID">${escapeGroupHtml(charLetter)}</div><div class="flex flex-col min-w-0"><span class="text-xs font-bold text-white truncate cursor-help demo-blur-username" title="Username пользователя в Telegram или fallback по ID">${escapeGroupHtml(username)}</span><button type="button" class="text-left text-[9px] text-white/35 hover:text-primary transition-colors font-mono cursor-help" title="Telegram ID пользователя. Нажмите, чтобы скопировать" onclick="copySingleId(event, '${escapeGroupHtml(uid)}')">tg id: ${escapeGroupHtml(uid)}</button></div></div></td>
                <td class="px-4 py-2">${balanceHTML}</td>
                <td class="px-4 py-2">${keyInfo}</td>
                ${monthsTd}
                ${actionsTd}
            </tr>`;
        }

        function _ugmRenderBatch(items, count) {
            const bodyEl = document.getElementById('userGroupModalBody');
            if (!bodyEl) return;
            const sentinel = document.getElementById('ugm-sentinel');
            if (sentinel) sentinel.remove();
            const slice = items.slice(_ugmRenderedCount, _ugmRenderedCount + count);
            slice.forEach(item => {
                const tr = document.createElement('tbody');
                tr.innerHTML = _ugmBuildRow(item);
                bodyEl.appendChild(tr.firstElementChild);
            });
            _ugmRenderedCount += slice.length;
            const remaining = items.length - _ugmRenderedCount;
            if (remaining > 0) {
                const sentinelRow = document.createElement('tr');
                sentinelRow.id = 'ugm-sentinel';
                sentinelRow.innerHTML = `<td colspan="${_ugmColCount + 1}" class="px-4 py-3 text-center"><div class="inline-flex items-center gap-2 text-white/30 text-[10px] font-bold"><span class="material-symbols-outlined text-[14px] animate-bounce">expand_more</span>Ещё ${remaining} · прокрутите вниз</div></td>`;
                bodyEl.appendChild(sentinelRow);
                if (_ugmObserver) _ugmObserver.observe(sentinelRow);
            }
        }

        window.loadAllUserGroup = function() {
            if (!_ugmAllItems.length) return;
            const remaining = _ugmAllItems.length - _ugmRenderedCount;
            if (remaining <= 0) return;
            if (_ugmObserver) _ugmObserver.disconnect();
            const sentinel = document.getElementById('ugm-sentinel');
            if (sentinel) sentinel.remove();
            _ugmRenderBatch(_ugmAllItems, remaining + UGM_INITIAL);
        };

        window.openUserGroupModal = async function(groupKey, title) {
            const modal = document.getElementById('userGroupModal');
            const titleEl = document.getElementById('userGroupModalTitle');
            const descEl = document.getElementById('userGroupModalDesc');
            const bodyEl = document.getElementById('userGroupModalBody');
            const thMonths = document.getElementById('th_months_bought');
            const countEl = document.getElementById('userGroupModalCount');
            const iconWrap = document.getElementById('userGroupModalIcon');
            const scrollEl = document.getElementById('userGroupModalContent');

            if (!modal || !titleEl || !bodyEl) return;

            _ugmAllItems = [];
            _ugmRenderedCount = 0;
            if (_ugmObserver) { _ugmObserver.disconnect(); _ugmObserver = null; }

            const groupDescriptions = {
                'no_purchases': 'Пользователи, которые зарегистрировались, но ни разу не покупали подписку.',
                'inactive_buyers': 'Пользователи, которые когда-то покупали ключ, но сейчас у них нет активных подписок.',
                'trials': 'Пользователи, которые в данный момент используют бесплатный пробный период.',
                'active_buyers': 'Пользователи с активной купленной подпиской.',
                'active_keys': 'Все действующие ключи в системе, включая триалы и купленные.'
            };
            const groupVisuals = {
                'no_purchases': { icon: 'person_off', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' },
                'inactive_buyers': { icon: 'history', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' },
                'trials': { icon: 'card_giftcard', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' },
                'active_buyers': { icon: 'verified_user', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' },
                'active_keys': { icon: 'vpn_key', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' }
            };
            const visual = groupVisuals[groupKey] || { icon: 'group', cls: 'w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-lg shadow-primary/10 shrink-0' };

            titleEl.textContent = title;
            if (descEl) descEl.textContent = groupDescriptions[groupKey] || '';
            if (countEl) countEl.textContent = 'загрузка';
            if (iconWrap) {
                iconWrap.className = visual.cls;
                iconWrap.innerHTML = `<span class="material-symbols-outlined text-xl">${visual.icon}</span>`;
            }

            _ugmShowMonths = ['inactive_buyers', 'active_buyers', 'active_keys'].includes(groupKey);
            _ugmColCount = _ugmShowMonths ? 4 : 3;
            if (_ugmShowMonths && thMonths) thMonths.classList.remove('hidden');
            else if (thMonths) thMonths.classList.add('hidden');

            bodyEl.innerHTML = `<tr><td colspan="${_ugmColCount + 1}" class="p-8 text-center"><div class="flex flex-col items-center gap-2"><div class="relative w-8 h-8"><div class="absolute inset-0 rounded-full border border-primary/20"></div><div class="absolute inset-1 rounded-full border-2 border-white/10 border-t-primary animate-spin"></div></div><span class="text-[9px] text-white/35 font-black uppercase tracking-[0.22em]">Загрузка сегмента</span></div></td></tr>`;

            window.currentUserGroupIds = [];
            openModal('userGroupModal');

            try {
                const data = await fetchJSON(
                    `${routes.userGroups}?group=${encodeURIComponent(groupKey)}&limit=500`
                );
                if (data && data.ok && Array.isArray(data.items)) {
                    const list = data.items;
                    _ugmAllItems = list;
                    list.forEach(item => { if (item.telegram_id) window.currentUserGroupIds.push(item.telegram_id); });
                    const total = typeof data.total === 'number' ? data.total : list.length;
                    if (countEl) countEl.textContent = `${total} шт.`;

                    if (list.length === 0) {
                        bodyEl.innerHTML = `<tr><td colspan="${_ugmColCount + 1}" class="p-8 text-center"><div class="inline-flex flex-col items-center gap-2"><div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30"><span class="material-symbols-outlined text-lg">inbox</span></div><span class="text-xs text-white/35 font-bold">Список пуст</span></div></td></tr>`;
                        return;
                    }

                    bodyEl.innerHTML = '';

                    _ugmObserver = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                _ugmRenderBatch(_ugmAllItems, UGM_BATCH);
                            }
                        });
                    }, { root: scrollEl, threshold: 0.1 });

                    _ugmRenderBatch(list, UGM_INITIAL);
                } else {
                    if (countEl) countEl.textContent = 'ошибка';
                    bodyEl.innerHTML = `<tr><td colspan="${_ugmColCount + 1}" class="p-8 text-center text-red-300 text-xs font-bold">Ошибка загрузки данных или нет доступа</td></tr>`;
                }
            } catch (e) {
                console.error(e);
                if (countEl) countEl.textContent = 'ошибка';
                bodyEl.innerHTML = `<tr><td colspan="${_ugmColCount + 1}" class="p-8 text-center text-red-300 text-xs font-bold">Ошибка сети</td></tr>`;
            }
        };

        window.restartDashboardAutoRefresh = () => {
            Object.values(autoRefreshRegistry).forEach((timerId) => clearInterval(timerId));
            Object.keys(autoRefreshRegistry).forEach((key) => delete autoRefreshRegistry[key]);
            initAutoRefresh();
        };

        initAutoRefresh();

        (function initDashTabs() {
            const tabs = document.querySelectorAll('#dash-tabs .dash-tab');
            const panels = document.querySelectorAll('.dash-tab-panel');
            function showTab(name) {
                tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
                panels.forEach(p => p.classList.toggle('hidden', p.dataset.tabPanel !== name));
                const path = location.pathname;
                history.replaceState(null, '', name === 'overview' ? path : `${path}#${name}`);
            }
            window.switchDashTab = showTab;

            tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
            const hash = (location.hash || '').replace('#', '');
            if (hash && document.querySelector(`[data-tab-panel="${hash}"]`)) {
                showTab(hash);
            }
        })();
    });
})();
