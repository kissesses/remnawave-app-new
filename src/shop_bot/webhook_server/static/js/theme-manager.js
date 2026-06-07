(function () {
    'use strict';

    const DESIGN_KEY = 'design-theme';
    const BRIGHTNESS_KEY = 'theme';
    const ACCENT_KEY = 'panel-accent';

    const ACCENTS = {
        blue: { label: 'Синий', color: '#0a84ff', rgb: '10, 132, 255' },
        violet: { label: 'Фиолетовый', color: '#8b5cf6', rgb: '139, 92, 246' },
        rose: { label: 'Розовый', color: '#f43f5e', rgb: '244, 63, 94' },
        emerald: { label: 'Изумрудный', color: '#10b981', rgb: '16, 185, 129' },
        cyan: { label: 'Голубой', color: '#06b6d4', rgb: '6, 182, 212' },
        amber: { label: 'Янтарный', color: '#f59e0b', rgb: '245, 158, 11' },
        red: { label: 'Красный', color: '#ef4444', rgb: '239, 68, 68' },
    };

    let savedDesign = 'classic';
    let savedBrightness = 'dark';
    let savedAccent = 'blue';
    let pendingDesign = 'classic';
    let pendingBrightness = 'dark';
    let pendingAccent = 'blue';
    let modalCommitted = false;
    let skipCloseRevert = false;

    function normalizeDesign(value) {
        if (value === 'macos-v2') return 'macos-v2';
        if (value === 'macos') return 'macos';
        if (value === 'glass') return 'glass';
        if (value === 'stealth-admin') return 'stealth-admin';
        return 'classic';
    }

    function normalizeAccent(value) {
        return ACCENTS[value] ? value : 'blue';
    }

    function isMacosFamily(design) {
        const d = normalizeDesign(design);
        return d === 'macos' || d === 'macos-v2';
    }

    function isGlassFamily(design) {
        const d = normalizeDesign(design);
        return d === 'glass' || d === 'stealth-admin';
    }

    function isWorkspaceDesign(design) {
        return normalizeDesign(design) === 'macos-v2';
    }

    function isStealthAdmin(design) {
        return normalizeDesign(design) === 'stealth-admin';
    }

    function getDesign() {
        return normalizeDesign(localStorage.getItem(DESIGN_KEY) || 'classic');
    }

    function getBrightness() {
        return localStorage.getItem(BRIGHTNESS_KEY) || 'dark';
    }

    function getAccent() {
        return normalizeAccent(localStorage.getItem(ACCENT_KEY) || 'blue');
    }

    function applyAccent(accentKey, design) {
        const d = normalizeDesign(design ?? getDesign());
        const targets = [document.documentElement];
        if (document.body) targets.push(document.body);

        if (isStealthAdmin(d)) {
            const keys = ['--primary', '--primary-rgb', '--panel-accent', '--panel-accent-soft', '--accent', '--accent-rgb', '--sp-accent', '--sp-accent-soft'];
            targets.forEach((el) => keys.forEach((key) => el.style.removeProperty(key)));
            if (window.parent === window) {
                document.querySelectorAll('iframe.ws-window__iframe').forEach((frame) => {
                    try {
                        frame.contentWindow?.postMessage({ type: 'panel-theme-accent', vars: null }, window.location.origin);
                    } catch (_) { /* ignore */ }
                });
            }
            return;
        }

        const accent = ACCENTS[normalizeAccent(accentKey)];
        if (!accent) return;

        const soft = `rgba(${accent.rgb}, 0.16)`;
        const vars = {
            '--primary': accent.color,
            '--primary-rgb': accent.rgb,
            '--panel-accent': accent.color,
            '--panel-accent-soft': soft,
            '--accent': accent.color,
            '--accent-rgb': accent.rgb,
            '--sp-accent': accent.color,
            '--sp-accent-soft': soft,
            '--auth-accent': accent.color,
            '--auth-accent-soft': soft,
        };

        targets.forEach((el) => {
            Object.entries(vars).forEach(([key, value]) => el.style.setProperty(key, value));
        });

        if (window.parent === window) {
            document.querySelectorAll('iframe.ws-window__iframe').forEach((frame) => {
                try {
                    frame.contentWindow?.postMessage({ type: 'panel-theme-accent', vars }, window.location.origin);
                } catch (_) { /* ignore */ }
            });
        }

        document.querySelectorAll('[data-accent-option]').forEach((btn) => {
            btn.setAttribute('aria-pressed', btn.dataset.accentOption === normalizeAccent(accentKey) ? 'true' : 'false');
        });

        const live = document.getElementById('theme-accent-live');
        if (live) {
            live.textContent = accent.label;
            live.style.setProperty('--primary', accent.color);
        }
    }

    function applyToDom(design, brightness, accentOverride) {
        const d = normalizeDesign(design);
        const isDark = isStealthAdmin(d) ? true : brightness !== 'light';
        document.documentElement.dataset.design = d;
        document.documentElement.classList.toggle('dark', isDark);
        ['classic', 'macos', 'macos-v2', 'glass', 'stealth-admin'].forEach((id) => {
            document.body.classList.toggle('design-' + id, d === id);
        });
        document.body.classList.toggle('design-macos', isMacosFamily(d));
        document.body.classList.toggle('design-glass', isGlassFamily(d));
        applyAccent(accentOverride ?? getAccent(), d);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            if (isStealthAdmin(d)) meta.content = '#020202';
            else meta.content = isDark ? '#000000' : '#f2f2f7';
        }
        if (typeof window.AuthMacos !== 'undefined') {
            window.AuthMacos.refresh();
        }
        if (typeof window.AuthClassic !== 'undefined') {
            window.AuthClassic.refresh();
        }
        if (typeof window.AuthGlass !== 'undefined') {
            window.AuthGlass.refresh();
        }
        if (typeof window.WorkspaceManager !== 'undefined') {
            window.WorkspaceManager.onDesignChange();
        }
    }

    function persistTheme(design, brightness, accent) {
        localStorage.setItem(DESIGN_KEY, normalizeDesign(design));
        localStorage.setItem(BRIGHTNESS_KEY, brightness === 'light' ? 'light' : 'dark');
        localStorage.setItem(ACCENT_KEY, normalizeAccent(accent ?? getAccent()));
    }

    function applyDesign(design) {
        const value = normalizeDesign(design);
        persistTheme(value, getBrightness(), getAccent());
        applyToDom(value, getBrightness());
        syncModalState();
        updatePageTitle();
    }

    function applyBrightness(mode) {
        const brightness = mode === 'light' ? 'light' : 'dark';
        persistTheme(getDesign(), brightness, getAccent());
        applyToDom(getDesign(), brightness);
        syncModalState();
    }

    function applyAccentChoice(accentKey) {
        const accent = normalizeAccent(accentKey);
        persistTheme(getDesign(), getBrightness(), accent);
        applyAccent(accent, pendingDesign);
        syncModalState();
    }

    function isAuthPage() {
        return document.body.classList.contains('auth-ios') || document.body.dataset.authPage === 'true';
    }

    function syncThemeNewBadges() {
        const seen = localStorage.getItem('theme-picker-seen') === '1';
        document.getElementById('auth-theme-new-badge')?.classList.toggle('hidden', seen);
        document.getElementById('theme-new-badge')?.classList.toggle('hidden', seen);
    }

    function syncModalState() {
        document.querySelectorAll('[data-design-option]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.designOption === pendingDesign);
        });
        document.querySelectorAll('[data-brightness-option]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.brightnessOption === pendingBrightness);
        });
        document.querySelectorAll('[data-accent-option]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.accentOption === pendingAccent);
            btn.setAttribute('aria-pressed', btn.dataset.accentOption === pendingAccent ? 'true' : 'false');
        });
        const wsSection = document.getElementById('theme-workspace-section');
        if (wsSection) {
            wsSection.hidden = isAuthPage() || !isWorkspaceDesign(pendingDesign);
        }
        const accentSection = document.getElementById('theme-accent-section');
        if (accentSection) {
            accentSection.hidden = isStealthAdmin(pendingDesign);
        }
        const brightnessSection = document.getElementById('theme-brightness-section');
        if (brightnessSection) {
            brightnessSection.hidden = isStealthAdmin(pendingDesign);
        }
    }

    function needsLayoutRefresh(design, brightness) {
        return normalizeDesign(design) !== savedDesign || (brightness === 'light' ? 'light' : 'dark') !== savedBrightness;
    }

    function applyThemeState(design, brightness, accent, options) {
        const opts = options || {};
        const d = normalizeDesign(design);
        const b = brightness === 'light' ? 'light' : 'dark';
        const a = normalizeAccent(accent);
        const layoutChanged = opts.forceLayout || needsLayoutRefresh(d, b);
        if (layoutChanged) {
            applyToDom(d, b, a);
        } else {
            applyAccent(a, d);
        }
    }

    function applyPreview() {
        if (isAuthPage()) {
            const d = normalizeDesign(pendingDesign);
            const isDark = isStealthAdmin(d) ? true : pendingBrightness !== 'light';
            document.documentElement.dataset.design = d;
            document.documentElement.classList.toggle('dark', isDark);
            document.body.classList.toggle('design-glass', isGlassFamily(d));
            ['classic', 'macos', 'macos-v2', 'glass', 'stealth-admin'].forEach((id) => {
                document.body.classList.toggle('design-' + id, d === id);
            });
            document.body.classList.toggle('design-macos', isMacosFamily(d));
            applyAccent(pendingAccent, d);
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
                if (isStealthAdmin(d)) meta.content = '#020202';
                else meta.content = isDark ? '#000000' : '#f2f2f7';
            }
            syncModalState();
            if (typeof window.AuthMacos !== 'undefined') {
                window.AuthMacos.refresh();
            }
            if (typeof window.AuthClassic !== 'undefined') {
                window.AuthClassic.refresh();
            }
            if (typeof window.AuthGlass !== 'undefined') {
                window.AuthGlass.refresh();
            }
            return;
        }
        applyThemeState(pendingDesign, pendingBrightness, pendingAccent);
        syncModalState();
        updatePageTitle();
    }

    function updatePageTitle() {
        const el = document.getElementById('panel-page-title');
        if (!el) return;
        const h1 = document.querySelector('main h1, main h2.text-3xl, main .users-title, main .settings-title, main .support-title, main .dashboard-title');
        el.textContent = h1 ? h1.textContent.trim() : '';
    }

    function openThemeModal() {
        savedDesign = getDesign();
        savedBrightness = getBrightness();
        savedAccent = getAccent();
        pendingDesign = savedDesign;
        pendingBrightness = savedBrightness;
        pendingAccent = savedAccent;
        modalCommitted = false;
        localStorage.setItem('theme-picker-seen', '1');
        syncThemeNewBadges();
        syncModalState();
        if (isWorkspaceDesign(pendingDesign) && typeof window.WorkspaceManager !== 'undefined') {
            window.WorkspaceManager.syncDesktopFormFromState();
        }
        if (typeof window.openModal === 'function') {
            window.openModal('themeModal');
        }
    }

    function commitTheme() {
        modalCommitted = true;
        persistTheme(pendingDesign, pendingBrightness, pendingAccent);
        if (isWorkspaceDesign(pendingDesign) && typeof window.WorkspaceManager !== 'undefined') {
            window.WorkspaceManager.commitDesktopFromModal();
        }
        applyThemeState(pendingDesign, pendingBrightness, pendingAccent);
        savedDesign = pendingDesign;
        savedBrightness = pendingBrightness;
        savedAccent = pendingAccent;
        syncModalState();
        updatePageTitle();
        skipCloseRevert = true;
        if (typeof window.closeModal === 'function') {
            window.closeModal('themeModal');
        }
        if (typeof window.showToast === 'function') {
            window.showToast('success', isAuthPage() ? 'Макет сохранён' : 'Оформление сохранено');
        }
    }

    function cancelTheme() {
        const layoutChanged = pendingDesign !== savedDesign || pendingBrightness !== savedBrightness;
        pendingDesign = savedDesign;
        pendingBrightness = savedBrightness;
        pendingAccent = savedAccent;
        if (isAuthPage()) {
            applyToDom(savedDesign, savedBrightness, savedAccent);
        } else {
            applyThemeState(savedDesign, savedBrightness, savedAccent, { forceLayout: layoutChanged });
            updatePageTitle();
            if (typeof window.WorkspaceManager !== 'undefined') {
                window.WorkspaceManager.resetDesktopPreview();
            }
        }
        syncModalState();
        skipCloseRevert = true;
        if (typeof window.closeModal === 'function') {
            window.closeModal('themeModal');
        }
    }

    function onModalClosed() {
        if (!modalCommitted && !skipCloseRevert) {
            if (isAuthPage()) {
                applyToDom(savedDesign, savedBrightness, savedAccent);
            } else {
                applyThemeState(savedDesign, savedBrightness, savedAccent);
                updatePageTitle();
                if (typeof window.WorkspaceManager !== 'undefined') {
                    window.WorkspaceManager.resetDesktopPreview();
                }
            }
        }
        skipCloseRevert = false;
        modalCommitted = false;
    }

    function init() {
        applyToDom(getDesign(), getBrightness());
        updatePageTitle();
        syncThemeNewBadges();

        const trigger = document.getElementById('theme-toggle-btn');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openThemeModal();
            });
        }

        document.querySelectorAll('[data-design-option]').forEach(btn => {
            btn.addEventListener('click', () => {
                const prev = pendingDesign;
                pendingDesign = normalizeDesign(btn.dataset.designOption);
                if (isStealthAdmin(pendingDesign)) {
                    pendingBrightness = 'dark';
                }
                applyPreview();
                if (isAuthPage()) {
                    if (pendingDesign === savedDesign) {
                        if (typeof window.closeModal === 'function') {
                            window.closeModal('themeModal');
                        }
                        return;
                    }
                    commitTheme();
                    return;
                }
                if (
                    isWorkspaceDesign(pendingDesign) &&
                    !isWorkspaceDesign(prev) &&
                    typeof window.WorkspaceManager !== 'undefined'
                ) {
                    window.WorkspaceManager.syncDesktopFormFromState();
                }
            });
        });

        document.querySelectorAll('[data-brightness-option]').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingBrightness = btn.dataset.brightnessOption === 'light' ? 'light' : 'dark';
                applyPreview();
                if (isAuthPage()) {
                    persistTheme(pendingDesign, pendingBrightness, pendingAccent);
                    savedBrightness = pendingBrightness;
                }
            });
        });

        document.querySelectorAll('[data-accent-option]').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingAccent = normalizeAccent(btn.dataset.accentOption);
                applyPreview();
                if (isAuthPage()) {
                    persistTheme(pendingDesign, pendingBrightness, pendingAccent);
                    savedAccent = pendingAccent;
                }
            });
        });

        document.getElementById('theme-modal-apply')?.addEventListener('click', commitTheme);
        document.getElementById('theme-modal-cancel')?.addEventListener('click', cancelTheme);

        const modal = document.getElementById('themeModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) cancelTheme();
            });

            const observer = new MutationObserver(() => {
                if (!modal.classList.contains('open')) {
                    onModalClosed();
                }
            });
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('themeModal')?.classList.contains('open')) {
                cancelTheme();
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ThemeManager = {
        applyDesign,
        applyBrightness,
        applyAccent: applyAccentChoice,
        getDesign,
        getBrightness,
        getAccent,
        open: openThemeModal,
        cancel: cancelTheme,
        apply: commitTheme,
    };
})();
