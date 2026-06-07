(function () {
    'use strict';

    const INSTALL_CMD_FALLBACK =
        'cd /opt/remnawave-app && docker compose pull && docker compose up -d --force-recreate';

    let resultDismissTimer = null;
    let lastInstallCmd = INSTALL_CMD_FALLBACK;
    let lastUpgradeCaps = null;
    let lastUpdates = null;
    let upgradePollTimer = null;
    let upgradeHealthWatchActive = false;
    let upgradeWatchAbort = false;
    const RING_LEN = 326.73;
    const STABILIZE_SEC = 90;
    const STABILIZE_MIN_SEC = 20;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
            }).format(new Date(iso));
        } catch {
            return '—';
        }
    }

    function fmtStars(n) {
        if (n == null) return '—';
        return new Intl.NumberFormat('ru-RU').format(n);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function applyGithubData(data) {
        const gh = data?.github || {};
        const project = data?.project || {};
        const repo = gh.repo || {};
        const user = gh.user || {};

        if (project.tagline) setText('about-mac-tagline', project.tagline);
        if (project.brand) setText('about-mac-brand', project.brand);

        const license = project.license || repo.license;
        if (license) setText('about-spec-license', license);

        if (repo.stars != null) {
            const starsEl = document.getElementById('about-spec-stars');
            if (starsEl) {
                starsEl.innerHTML = repo.html_url
                    ? `<a href="${repo.html_url}/stargazers" target="_blank" rel="noopener" class="about-mac-stars-link">${fmtStars(repo.stars)} ★</a>`
                    : fmtStars(repo.stars);
            }
        }

        if (repo.pushed_at) setText('about-spec-updated', fmtDate(repo.pushed_at));

        const avatar = document.getElementById('about-dev-avatar');
        const avatarPh = document.getElementById('about-dev-avatar-ph');
        if (avatar && user.avatar_url) {
            avatar.src = user.avatar_url;
            avatar.alt = user.name || user.login || 'Developer';
            avatar.hidden = false;
            if (avatarPh) avatarPh.hidden = true;
        }

        const devName = document.getElementById('about-dev-name');
        if (devName) {
            devName.textContent = user.login || user.name || project.author || devName.textContent;
            if (user.html_url) devName.href = user.html_url;
        }

        const bio = document.getElementById('about-dev-bio');
        if (bio && user.bio) bio.textContent = user.bio;
    }

    function applyUpdateState(updates, installCmd) {
        const banner = document.getElementById('about-update-banner');
        const installBlock = document.getElementById('about-install-block');
        const aboutBtn = document.getElementById('about-info-btn');
        const badge = document.getElementById('about-new-badge');
        const infoIcon = document.getElementById('about-info-icon');

        if (!updates) return;

        if (updates.latest_version) {
            setText('about-update-version', `v${updates.latest_version}`);
        }

        const panelBtn = document.getElementById('about-update-apply');
        const extLink = document.getElementById('about-update-link');

        if (updates.update_available) {
            banner?.classList.remove('hidden');
            installBlock?.classList.remove('hidden');
            aboutBtn?.classList.add('panel-topbar__btn--update');
            aboutBtn?.setAttribute('title', 'Доступно обновление');
            badge?.classList.remove('hidden');
            if (infoIcon) {
                infoIcon.textContent = 'system_update';
                infoIcon.classList.add('panel-topbar__update-icon');
                infoIcon.classList.remove('hidden');
            }

            const cmdEl = document.getElementById('about-install-cmd');
            const cmd = installCmd || lastInstallCmd || INSTALL_CMD_FALLBACK;
            lastInstallCmd = cmd;
            if (cmdEl) cmdEl.textContent = cmd;

            if (lastUpgradeCaps?.panel_upgrade_available) {
                panelBtn?.classList.remove('hidden');
                extLink?.classList.add('about-mac-update__btn--secondary');
                if (extLink) extLink.textContent = 'Релизы';
            } else {
                panelBtn?.classList.add('hidden');
                extLink?.classList.remove('about-mac-update__btn--secondary');
                if (extLink) extLink.textContent = 'Обновить';
            }
        } else {
            panelBtn?.classList.add('hidden');
            banner?.classList.add('hidden');
            installBlock?.classList.add('hidden');
            aboutBtn?.classList.remove('panel-topbar__btn--update');
            aboutBtn?.setAttribute('title', 'О проекте');
            badge?.classList.add('hidden');
            if (infoIcon) {
                infoIcon.textContent = 'info';
                infoIcon.classList.remove('panel-topbar__update-icon');
                infoIcon.classList.remove('hidden');
            }
        }
    }

    function hideUpdateResult() {
        const el = document.getElementById('about-update-result');
        if (!el || el.classList.contains('hidden')) return;

        if (resultDismissTimer) {
            clearTimeout(resultDismissTimer);
            resultDismissTimer = null;
        }

        el.classList.add('is-hiding');
        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('is-hiding');
            el.innerHTML = '';
            el.className = 'about-mac-result hidden';
        }, 280);
    }

    function showUpdateResult(type, title, desc, autoDismissMs) {
        const el = document.getElementById('about-update-result');
        if (!el) return;

        if (resultDismissTimer) {
            clearTimeout(resultDismissTimer);
            resultDismissTimer = null;
        }

        const icons = {
            checking: 'sync',
            uptodate: 'check_circle',
            available: 'arrow_circle_up',
            error: 'cloud_off',
        };

        const spinClass = type === 'checking' ? ' about-mac-spin is-spinning' : '';

        el.className = `about-mac-result about-mac-result--${type}`;
        el.innerHTML = `
            <div class="about-mac-result__icon">
                <span class="material-symbols-outlined${spinClass}">${icons[type] || 'info'}</span>
            </div>
            <div class="about-mac-result__body">
                <strong class="about-mac-result__title">${title}</strong>
                <p class="about-mac-result__desc">${desc}</p>
            </div>
            <button type="button" class="about-mac-result__dismiss" aria-label="Закрыть">×</button>
        `;

        el.classList.remove('hidden');
        el.querySelector('.about-mac-result__dismiss')?.addEventListener('click', hideUpdateResult);

        if (autoDismissMs > 0) {
            resultDismissTimer = setTimeout(hideUpdateResult, autoDismissMs);
        }
    }

    function showCheckResult(data) {
        const updates = data?.updates;
        const project = data?.project || {};
        const name = project.brand || project.name || 'ReSTEAL v3 RW';
        const current = updates?.current_version || project.version || '—';

        if (!updates || updates.error) {
            showUpdateResult(
                'error',
                'Не удалось проверить обновления',
                'Проверьте подключение к интернету и попробуйте снова.',
                6000,
            );
            return;
        }

        if (updates.update_available) {
            const latest = updates.latest_version || '—';
            showUpdateResult(
                'available',
                'Доступно обновление ПО',
                `${name} v${current} → v${latest}. Новая версия готова к установке.`,
                0,
            );
            return;
        }

        showUpdateResult(
            'uptodate',
            'У вас установлена последняя версия',
            `${name} v${current} — актуален. Обновления не требуются.`,
            5500,
        );
    }

    async function loadProjectInfo(options = {}) {
        const { showCheckResult: notify = false } = options;
        const spin = document.getElementById('about-check-spin');
        spin?.classList.add('is-spinning');

        if (notify) {
            showUpdateResult(
                'checking',
                'Проверка обновлений…',
                'Подключение к серверу обновлений GitHub',
                0,
            );
        }

        try {
            const data = await apiRequest('/update/info');
            if (!data) {
                if (notify) {
                    showUpdateResult(
                        'error',
                        'Не удалось проверить обновления',
                        'Сервер не вернул данные. Попробуйте позже.',
                        6000,
                    );
                }
                return null;
            }

            if (data.project?.version) {
                setText('about-mac-version', `v${data.project.version}`);
                setText('about-spec-version', data.project.version);
            }

            if (data.project?.image_tag) {
                setText('about-spec-image-tag', data.project.image_tag);
            }

            if (data.install_command) lastInstallCmd = data.install_command;
            lastUpgradeCaps = data.upgrade || data.panel_upgrade_available != null
                ? (data.upgrade || { panel_upgrade_available: !!data.panel_upgrade_available })
                : null;
            lastUpdates = data.updates || null;
            applyGithubData(data);
            applyUpdateState(data.updates, data.install_command);

            if (notify) showCheckResult(data);
            return data;
        } catch (e) {
            console.error('About modal info load failed:', e);
            if (notify) {
                showUpdateResult(
                    'error',
                    'Не удалось проверить обновления',
                    'Проверьте подключение к интернету и попробуйте снова.',
                    6000,
                );
            }
            return null;
        } finally {
            spin?.classList.remove('is-spinning');
        }
    }

    async function checkUpdatesManual() {
        await loadProjectInfo({ showCheckResult: true });
    }

    function formatCountdown(sec) {
        const s = Math.max(0, Math.ceil(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    function setHeroDisplay(mode, value) {
        const pctEl = document.getElementById('panel-update-pct');
        const countdownEl = document.getElementById('panel-update-countdown');
        const hero = document.getElementById('panel-update-hero');
        if (mode === 'countdown') {
            pctEl?.classList.add('hidden');
            countdownEl?.classList.remove('hidden');
            hero?.classList.add('is-stabilizing');
            hero?.classList.remove('is-ready');
            if (countdownEl) countdownEl.textContent = value;
            return;
        }
        countdownEl?.classList.add('hidden');
        pctEl?.classList.remove('hidden');
        hero?.classList.remove('is-stabilizing');
        if (pctEl) pctEl.textContent = value;
    }

    function setCountdownRing(remaining, total) {
        const done = total > 0 ? (total - remaining) / total : 1;
        const ring = document.getElementById('panel-update-ring-progress');
        if (ring) ring.style.strokeDashoffset = String(RING_LEN * (1 - done));
    }

    function stopUpgradeWatch() {
        upgradeWatchAbort = true;
        upgradeHealthWatchActive = false;
    }

    function resetUpgradeWatchUi() {
        stopUpgradeWatch();
        setHeroDisplay('progress', '0%');
        document.getElementById('panel-update-hero')?.classList.remove('is-ready', 'is-stabilizing');
    }

    function setUpgradeProgress(pct) {
        const n = Math.max(0, Math.min(100, Math.round(pct)));
        const bar = document.getElementById('panel-update-bar');
        const pctEl = document.getElementById('panel-update-pct');
        const ring = document.getElementById('panel-update-ring-progress');
        const hero = document.getElementById('panel-update-hero');
        if (bar) bar.style.width = `${n}%`;
        if (!hero?.classList.contains('is-stabilizing')) {
            if (pctEl) pctEl.textContent = `${n}%`;
            if (ring) ring.style.strokeDashoffset = String(RING_LEN * (1 - n / 100));
        }
    }

    function setUpgradeStepActive(step) {
        const order = ['validate', 'pull', 'recreate', 'health'];
        const idx = order.indexOf(step);
        document.querySelectorAll('.about-update-step').forEach((el) => {
            const s = el.getAttribute('data-step');
            const si = order.indexOf(s);
            el.classList.remove('is-active', 'is-done');
            if (si < 0) return;
            if (si < idx) el.classList.add('is-done');
            else if (si === idx) el.classList.add('is-active');
        });
    }

    function appendUpgradeLog(lines) {
        const logEl = document.getElementById('panel-update-log');
        if (!logEl || !lines?.length) return;
        logEl.textContent = lines.slice(-80).join('\n');
        logEl.scrollTop = logEl.scrollHeight;
    }

    function closeUpdateWizard() {
        if (upgradePollTimer) {
            clearInterval(upgradePollTimer);
            upgradePollTimer = null;
        }
        resetUpgradeWatchUi();
        const wizard = document.getElementById('panelUpdateModal');
        wizard?.classList.remove('open', 'is-morphing-in');
        wizard?.classList.add('hidden');
        wizard?.setAttribute('aria-hidden', 'true');
    }

    function openUpdateWizard() {
        const about = document.getElementById('aboutModal');
        const wizard = document.getElementById('panelUpdateModal');
        if (!wizard) return;

        const current = lastUpdates?.current_version || '—';
        const latest = lastUpdates?.latest_version || '—';
        setText('panel-update-version-line', `v${current} → v${latest}`);
        setText('panel-update-status', 'Подготовка…');
        setUpgradeProgress(0);
        setUpgradeStepActive('validate');
        appendUpgradeLog([]);
        resetUpgradeWatchUi();
        document.getElementById('panel-update-error-actions')?.classList.add('hidden');

        about?.classList.add('is-morphing-out');
        setTimeout(() => {
            if (typeof closeModal === 'function') closeModal('aboutModal');
            about?.classList.remove('is-morphing-out');

            wizard.classList.remove('hidden');
            wizard.setAttribute('aria-hidden', 'false');
            wizard.classList.add('is-morphing-in', 'open');
            setTimeout(() => wizard.classList.remove('is-morphing-in'), 450);
        }, 260);
    }

    async function postJson(url, body) {
        const token = typeof getCsrfToken === 'function' ? getCsrfToken() : '';
        const resp = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': token,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || resp.statusText);
        return data;
    }

    async function fetchUpgradeJob(jobId) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
            const resp = await fetch(`/update/job/${jobId}`, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: ctrl.signal,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function probePanelHealth() {
        try {
            const r = await fetch('/login', {
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'manual',
            });
            return r.ok || r.status === 302;
        } catch (_) {
            return false;
        }
    }

    function showUpgradeHealthTimeout() {
        document.getElementById('panel-update-error-actions')?.classList.remove('hidden');
        setText('panel-update-status', 'Таймаут ожидания панели — обновите страницу вручную');
    }

    async function watchPanelAfterUpgrade(jobId) {
        if (upgradeHealthWatchActive) return;
        upgradeHealthWatchActive = true;
        upgradeWatchAbort = false;

        setUpgradeStepActive('health');
        setText('panel-update-status', 'Ожидание запуска панели…');

        const bootStart = Date.now();
        const bootDeadline = bootStart + 120_000;
        let booted = false;
        while (Date.now() < bootDeadline && !upgradeWatchAbort) {
            if (await probePanelHealth()) {
                if (jobId) {
                    try {
                        await postJson(`/update/job/${jobId}/health`, {});
                    } catch (_) {
                        /* job мог пропасть после рестарта */
                    }
                }
                booted = true;
                break;
            }
            const elapsed = (Date.now() - bootStart) / 1000;
            setUpgradeProgress(90 + Math.min(9, Math.floor(elapsed / 120 * 10)));
            await sleep(2000);
        }

        if (!booted || upgradeWatchAbort) {
            upgradeHealthWatchActive = false;
            if (!upgradeWatchAbort) showUpgradeHealthTimeout();
            return;
        }

        let remaining = STABILIZE_SEC;
        let okStreak = 0;
        setHeroDisplay('countdown', formatCountdown(remaining));
        setCountdownRing(remaining, STABILIZE_SEC);
        setUpgradeProgress(92);
        setText(
            'panel-update-status',
            'Панель запущена — страница обновится автоматически. Не закрывайте окно.',
        );

        while (!upgradeWatchAbort) {
            await sleep(1000);
            if (upgradeWatchAbort) break;

            const ok = await probePanelHealth();
            if (ok) {
                okStreak += 1;
                if (okStreak >= 3 && remaining > STABILIZE_MIN_SEC) {
                    remaining = Math.max(STABILIZE_MIN_SEC, remaining - 5);
                }
            } else {
                okStreak = 0;
                remaining = Math.min(STABILIZE_SEC + 15, remaining + 2);
                setText('panel-update-status', 'Сервер ещё поднимается — не обновляйте страницу вручную');
            }

            remaining -= 1;
            if (remaining <= 0) {
                if (ok) break;
                remaining = 1;
                continue;
            }

            setHeroDisplay('countdown', formatCountdown(remaining));
            setCountdownRing(remaining, STABILIZE_SEC);
            setUpgradeProgress(92 + Math.round((1 - remaining / STABILIZE_SEC) * 8));
        }

        if (upgradeWatchAbort) {
            upgradeHealthWatchActive = false;
            return;
        }

        for (let attempt = 0; attempt < 5 && !upgradeWatchAbort; attempt += 1) {
            if (await probePanelHealth()) {
                setUpgradeProgress(100);
                setText('panel-update-status', 'Обновление страницы…');
                document.getElementById('panel-update-hero')?.classList.add('is-ready');
                setHeroDisplay('progress', '100%');
                if (typeof showToast === 'function') showToast('success', 'Обновление завершено');
                await sleep(400);
                window.location.reload();
                return;
            }
            await sleep(2000);
        }

        upgradeHealthWatchActive = false;
        showUpgradeHealthTimeout();
    }

    function shouldStartHealthWatch(job) {
        if (!job) return false;
        if (job.await_client_health) return true;
        if (job.step === 'health') return true;
        return job.step === 'recreate' && (job.progress || 0) >= 72;
    }

    async function runPanelUpgrade() {
        if (!lastUpgradeCaps?.panel_upgrade_available) {
            if (typeof showToast === 'function') {
                showToast('warning', lastUpgradeCaps?.reason || 'Обновление из панели недоступно');
            }
            return;
        }

        const ok = typeof showCustomConfirm === 'function'
            ? await showCustomConfirm(
                `Будет загружен образ (тег ${lastUpgradeCaps.image_tag || 'latest'}) и перезапущен контейнер. Панель на 1–2 минуты может быть недоступна.`,
                'Обновить Remnawave App?',
            )
            : window.confirm('Обновить Remnawave App? Панель будет недоступна 1–2 минуты.');

        if (!ok) return;

        openUpdateWizard();
        stopUpgradeWatch();

        try {
            const start = await postJson('/update/apply', { confirm: true });
            const jobId = start.job_id;
            if (!jobId) throw new Error('Не получен идентификатор задачи');

            let finished = false;

            const handleJobSnapshot = async (job) => {
                setUpgradeProgress(job.progress || 0);
                setText('panel-update-status', job.message || '…');
                if (job.step) setUpgradeStepActive(job.step);
                appendUpgradeLog(job.log);

                if (job.status === 'done') {
                    finished = true;
                    if (upgradePollTimer) {
                        clearInterval(upgradePollTimer);
                        upgradePollTimer = null;
                    }
                    await watchPanelAfterUpgrade(jobId);
                    return true;
                }
                if (job.status === 'error') {
                    finished = true;
                    if (upgradePollTimer) {
                        clearInterval(upgradePollTimer);
                        upgradePollTimer = null;
                    }
                    document.getElementById('panel-update-error-actions')?.classList.remove('hidden');
                    if (typeof showToast === 'function') showToast('danger', job.message || 'Ошибка обновления');
                    return true;
                }
                if (shouldStartHealthWatch(job)) {
                    finished = true;
                    if (upgradePollTimer) {
                        clearInterval(upgradePollTimer);
                        upgradePollTimer = null;
                    }
                    await watchPanelAfterUpgrade(jobId);
                    return true;
                }
                return false;
            };

            upgradePollTimer = setInterval(async () => {
                if (finished || upgradeHealthWatchActive) return;
                try {
                    const st = await fetchUpgradeJob(jobId);
                    if (!st?.job) return;
                    await handleJobSnapshot(st.job);
                } catch (_) {
                    if (!finished && !upgradeHealthWatchActive) {
                        finished = true;
                        if (upgradePollTimer) {
                            clearInterval(upgradePollTimer);
                            upgradePollTimer = null;
                        }
                        setUpgradeStepActive('health');
                        setText('panel-update-status', 'Соединение потеряно — ожидание перезапуска…');
                        await watchPanelAfterUpgrade(jobId);
                    }
                }
            }, 1200);
        } catch (e) {
            console.error('Panel upgrade failed:', e);
            document.getElementById('panel-update-error-actions')?.classList.remove('hidden');
            setText('panel-update-status', e.message || 'Ошибка');
            if (typeof showToast === 'function') showToast('danger', e.message || 'Не удалось запустить обновление');
        }
    }

    function copyText(text, toastMsg) {
        navigator.clipboard.writeText(text).then(() => {
            if (typeof showToast === 'function') showToast('success', toastMsg);
        }).catch(() => {
            if (typeof showToast === 'function') showToast('danger', 'Не удалось скопировать');
        });
    }

    function init() {
        const aboutBtn = document.getElementById('about-info-btn');
        if (!aboutBtn) return;

        loadProjectInfo();

        aboutBtn.addEventListener('click', async () => {
            hideUpdateResult();
            if (typeof openModal === 'function') openModal('aboutModal');
            await loadProjectInfo();
        });

        document.getElementById('about-check-updates')?.addEventListener('click', checkUpdatesManual);

        document.getElementById('about-update-apply')?.addEventListener('click', runPanelUpgrade);

        document.getElementById('panel-update-back-about')?.addEventListener('click', () => {
            closeUpdateWizard();
            if (typeof openModal === 'function') openModal('aboutModal');
        });

        document.getElementById('panel-update-copy-cmd')?.addEventListener('click', () => {
            copyText(lastInstallCmd, 'Команда скопирована');
        });

        document.getElementById('panel-update-close')?.addEventListener('click', () => {
            if (upgradePollTimer || upgradeHealthWatchActive) {
                if (!window.confirm('Обновление ещё выполняется. Закрыть окно?')) return;
            }
            closeUpdateWizard();
        });

        document.getElementById('about-copy-version')?.addEventListener('click', () => {
            const v = document.getElementById('about-spec-version')?.textContent?.trim();
            if (v) copyText(v, `Версия ${v} скопирована`);
        });

        document.getElementById('about-copy-donate')?.addEventListener('click', () => {
            const addr = document.getElementById('about-donate-addr')?.textContent?.trim();
            if (addr) copyText(addr, 'Адрес для перевода скопирован');
        });

        document.getElementById('about-copy-install')?.addEventListener('click', () => {
            const cmd = document.getElementById('about-install-cmd')?.textContent?.trim() || lastInstallCmd;
            copyText(cmd, 'Команда установки скопирована');
        });

        document.querySelectorAll('.about-mac-close').forEach((btn) => {
            btn.addEventListener('click', () => {
                hideUpdateResult();
                if (typeof closeModal === 'function') closeModal('aboutModal');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
