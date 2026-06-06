/**
 * Settings page shared utilities: toast, confirm, submit pipeline, loading states.
 */
(function (window) {
    'use strict';

    const TOAST_TYPES = new Set(['success', 'danger', 'error', 'warning', 'info']);

    function normalizeToastArgs(a, b) {
        if (TOAST_TYPES.has(a)) return { type: a, message: b };
        if (TOAST_TYPES.has(b)) return { type: b, message: a };
        return { type: 'info', message: a || b || '' };
    }

    function toast(type, message, duration) {
        const normalized = normalizeToastArgs(type, message);
        const mapped = normalized.type === 'error' ? 'danger' : normalized.type;
        if (typeof window.showToast === 'function') {
            window.showToast(mapped, normalized.message, duration);
        }
    }

    async function confirmDialog(messageOrOptions, maybeMessage) {
        if (typeof messageOrOptions === 'object' && messageOrOptions !== null) {
            const opts = messageOrOptions;
            if (typeof window.showConfirm === 'function') {
                return window.showConfirm({
                    title: opts.title || 'Подтверждение',
                    message: opts.message || opts.text || '',
                    confirmText: opts.confirmText || 'Да',
                    cancelText: opts.cancelText || 'Отмена',
                    type: opts.type || 'warning',
                });
            }
            return window.showCustomConfirm(opts.message || opts.text || '');
        }
        const message = maybeMessage ? String(messageOrOptions) : String(messageOrOptions);
        const title = maybeMessage ? String(maybeMessage) : null;
        if (title && typeof window.showConfirmModal === 'function') {
            return new Promise((resolve) => {
                window.showConfirmModal(title, message, () => resolve(true));
                const modal = document.getElementById('confirm-modal');
                if (modal) {
                    const cancelBtn = modal.querySelector('[data-confirm-cancel]');
                    if (cancelBtn) {
                        const prev = cancelBtn.onclick;
                        cancelBtn.onclick = () => { if (prev) prev(); resolve(false); };
                    }
                }
            });
        }
        if (typeof window.showCustomConfirm === 'function') {
            return window.showCustomConfirm(message);
        }
        return window.confirm(message);
    }

    function setButtonLoading(button, loading, loadingText) {
        if (!button) return;
        if (loading) {
            if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = loadingText || '<span class="settings-btn-spinner"></span>';
        } else {
            button.disabled = false;
            if (button.dataset.originalHtml) {
                button.innerHTML = button.dataset.originalHtml;
                delete button.dataset.originalHtml;
            }
        }
    }

    async function sendRequest(url, method, body, isJson) {
        try {
            const csrfToken = window.getCsrfToken ? window.getCsrfToken() : document.querySelector('input[name="csrf_token"]')?.value;
            const headers = {
                'X-CSRFToken': csrfToken || '',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            };
            if (isJson) headers['Content-Type'] = 'application/json';
            const options = { method: method || 'POST', headers };
            if (body) options.body = isJson ? JSON.stringify(body) : body;
            const res = await fetch(url, options);
            if (res.redirected) return { ok: true, redirected: true, url: res.url };
            try { return await res.json(); } catch { return { ok: res.ok }; }
        } catch (e) {
            console.error(e);
            return { ok: false, error: e.message };
        }
    }

    function getSubmitMode(form) {
        const mode = form.getAttribute('data-submit-mode');
        if (form.hasAttribute('data-native-submit') || mode === 'native') {
            return 'native';
        }
        if (mode === 'custom') {
            return 'custom';
        }
        if (mode === 'ajax') return 'ajax';
        if (['settings-tab-form'].includes(form.id)) return 'ajax';
        if (['broadcast-form', 'promo-create-form', 'promo-edit-form', 'webapp-settings-form', 'acc-invite-form'].includes(form.id)) {
            return 'custom';
        }
        return 'ajax';
    }

    function initSubmitPipeline(options) {
        const handleFormSubmit = options?.handleFormSubmit;
        const onNativeForm = options?.onNativeForm;

        document.querySelectorAll('form').forEach((form) => {
            if (form.dataset.processedSubmit) return;
            form.dataset.processedSubmit = 'true';

            const mode = getSubmitMode(form);
            if (mode === 'native') {
                if (typeof onNativeForm === 'function') onNativeForm(form);
                return;
            }
            if (mode === 'custom') {
                return;
            }
            if (mode === 'bulk') return;

            form.addEventListener('submit', async (e) => {
                if (form.getAttribute('data-submit-mode') === 'native') return;
                e.preventDefault();
                e.stopPropagation();

                const confirmMsg = form.getAttribute('data-confirm');
                if (confirmMsg) {
                    const ok = await confirmDialog(confirmMsg);
                    if (!ok) return;
                }

                if (e.submitter && e.submitter.hasAttribute('formaction')) return;

                const submitBtn = e.submitter || form.querySelector('[type="submit"]');
                setButtonLoading(submitBtn, true, '...');

                const successMsg = form.getAttribute('data-success-msg') || 'Сохранено';
                try {
                    if (typeof handleFormSubmit === 'function') {
                        await handleFormSubmit(form, successMsg, true);
                    }
                } finally {
                    setButtonLoading(submitBtn, false);
                }
            });
        });

        document.querySelectorAll('button[formaction]').forEach((btn) => {
            if (btn.dataset.processedFormaction) return;
            btn.dataset.processedFormaction = 'true';
            if ((btn.getAttribute('formaction') || '').match(/backup|restore/)) return;
            const form = btn.closest('form');
            if (!form || getSubmitMode(form) === 'native') return;

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const confirmMsg = btn.getAttribute('data-confirm');
                if (confirmMsg) {
                    const ok = await confirmDialog(confirmMsg);
                    if (!ok) return;
                }
                const originalAction = form.action;
                form.action = btn.getAttribute('formaction');
                setButtonLoading(btn, true, '...');
                try {
                    if (typeof handleFormSubmit === 'function') {
                        await handleFormSubmit(form, 'Выполнено', false);
                    }
                } finally {
                    form.action = originalAction;
                    setButtonLoading(btn, false);
                }
            });
        });
    }

    async function addDeviceTier(hostName, sendFn) {
        const countEl = document.getElementById('tier-count-' + hostName);
        const priceEl = document.getElementById('tier-price-' + hostName);
        const count = parseInt(countEl?.value, 10);
        const price = parseFloat(priceEl?.value || '0');
        if (!count || count < 2 || isNaN(price) || price < 0) {
            toast('danger', 'Укажите корректные значения (от 2 устройств)');
            return;
        }
        const fd = new FormData();
        fd.append('host_name', hostName);
        fd.append('device_count', count);
        fd.append('price', price);
        const res = await (sendFn || sendRequest)('/add-device-tier', 'POST', fd);
        if (res && res.ok) {
            toast('success', 'Тир добавлен');
            setTimeout(() => window.location.reload(), 400);
        } else {
            toast('danger', res?.error || 'Ошибка');
        }
    }

    async function deleteDeviceTier(tierId, hostName, sendFn) {
        const res = await (sendFn || sendRequest)('/delete-device-tier/' + tierId, 'POST', new FormData());
        if (res && res.ok) {
            const row = document.getElementById('tier-row-' + tierId);
            if (row) row.remove();
            const displayRow = document.getElementById('tier-display-' + tierId);
            const editRow = document.getElementById('tier-edit-' + tierId);
            if (displayRow) displayRow.remove();
            if (editRow) editRow.remove();
            toast('success', 'Тир удалён');
        } else {
            toast('danger', res?.error || 'Ошибка');
        }
    }

    window.SettingsPage = {
        toast,
        confirmDialog,
        setButtonLoading,
        sendRequest,
        initSubmitPipeline,
        addDeviceTier,
        deleteDeviceTier,
        normalizeToastArgs,
        initSectionNav,
    };

    window.settingsToast = toast;
    window.settingsConfirm = confirmDialog;

    function isWorkspaceEmbed() {
        return document.body.classList.contains('workspace-embed');
    }

    function isMacosV2Design() {
        const root = document.documentElement;
        return root.getAttribute('data-design') === 'macos-v2'
            || root.dataset.design === 'macos-v2'
            || document.body.classList.contains('design-macos-v2');
    }

    function isMacosSettingsPanelMode() {
        const root = document.documentElement;
        const design = root.getAttribute('data-design') || root.dataset.design || '';
        if (design === 'macos-v2' || design === 'macos') return true;
        return document.body.classList.contains('design-macos-v2')
            || document.body.classList.contains('design-macos');
    }

    function getSettingsScrollRoot() {
        const main = document.querySelector('.settings-page .settings-main');
        if (!main) return null;
        if (isWorkspaceEmbed()) return main;
        if (main.scrollHeight > main.clientHeight + 1) return main;
        return null;
    }

    function resolveSettingsSection(node) {
        if (!node) return null;
        if (node.classList.contains('settings-form-section')) return node;
        return node.closest('.settings-form-section');
    }

    function scrollToSettingsSection(target, nav) {
        const section = resolveSettingsSection(target) || target;
        const navHeight = nav?.offsetHeight || 0;
        const root = getSettingsScrollRoot();
        if (!root) {
            const targetRect = section.getBoundingClientRect();
            const offset = window.scrollY + targetRect.top - navHeight - 10;
            window.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
            return;
        }
        const rootRect = root.getBoundingClientRect();
        const targetRect = section.getBoundingClientRect();
        const offset = root.scrollTop + (targetRect.top - rootRect.top) - navHeight - 10;
        root.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    }

    function initSectionNav() {
        const nav = document.querySelector('.settings-section-nav');
        if (!nav) return;

        const links = nav.querySelectorAll('[data-section-nav]');
        const tabContent = nav.closest('.tab-content');
        const sections = tabContent
            ? Array.from(tabContent.querySelectorAll('.settings-form-section'))
            : Array.from(links)
                .map((link) => resolveSettingsSection(document.getElementById(link.dataset.sectionNav || '')))
                .filter(Boolean);

        if (tabContent && sections.length > 0) {
            tabContent.classList.add('settings-tab-sectioned');
        }

        const panelMode = Boolean(tabContent?.classList.contains('settings-tab-sectioned')) && sections.length > 0;

        const setActive = (id) => {
            links.forEach((link) => {
                link.classList.toggle('is-active', link.dataset.sectionNav === id);
            });
        };

        const showSection = (id) => {
            if (!id) return;
            setActive(id);
            if (!panelMode) return;
            if (tabContent) tabContent.classList.add('settings-macos-sections--panel');
            sections.forEach((section) => {
                section.classList.toggle('is-section-visible', section.id === id);
            });
            const root = getSettingsScrollRoot();
            if (root) root.scrollTop = 0;
            else window.scrollTo({ top: 0, behavior: 'auto' });
        };

        links.forEach((link) => {
            link.addEventListener('click', (e) => {
                const id = link.getAttribute('href')?.slice(1);
                const target = id ? document.getElementById(id) : null;
                if (!target) return;
                e.preventDefault();
                if (panelMode) {
                    showSection(id);
                } else {
                    scrollToSettingsSection(target, nav);
                    setActive(id);
                }
                if (history.replaceState) {
                    history.replaceState(null, '', '#' + id);
                }
            });
        });

        const scrollRoot = getSettingsScrollRoot();

        if (!panelMode && 'IntersectionObserver' in window && sections.length) {
            const observer = new IntersectionObserver((entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) setActive(visible.target.id);
            }, {
                root: scrollRoot,
                rootMargin: scrollRoot ? '-12% 0px -62% 0px' : '-18% 0px -58% 0px',
                threshold: [0, 0.2, 0.45, 0.7],
            });
            sections.forEach((section) => observer.observe(section));
        }

        const onScroll = () => {
            const top = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
            nav.classList.toggle('is-scrolled', top > 8);
        };

        (scrollRoot || window).addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash && document.getElementById(hash)) {
            if (panelMode) showSection(hash);
            else setActive(hash);
        } else if (sections[0]) {
            if (panelMode) showSection(sections[0].id);
            else setActive(sections[0].id);
        }
    }

    function initMacosNavRail() {
        if (!isMacosV2Design()) return;
        const rail = document.getElementById('settings-macos-nav-rail');
        if (!rail) return;
        const active = rail.querySelector('.tab-link.settings-tab-active');
        if (!active) return;
        const railRect = rail.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        if (activeRect.left < railRect.left || activeRect.right > railRect.right) {
            const offset = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
            rail.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initSectionNav();
            initMacosNavRail();
        });
    } else {
        initSectionNav();
        initMacosNavRail();
    }
})(window);
