(function () {
    'use strict';

    const WALLPAPER_PRESETS = {
        aurora: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
        sunset: 'linear-gradient(145deg, #2d1b4e 0%, #8b3a62 50%, #e8a87c 100%)',
        ocean: 'linear-gradient(145deg, #0c1445 0%, #1a5276 50%, #48c9b0 100%)',
        midnight: 'linear-gradient(145deg, #0d0d0d 0%, #1a1a2e 50%, #2d2d44 100%)',
        light: 'linear-gradient(145deg, #e8e8ed 0%, #f2f2f7 50%, #d1d1d6 100%)',
        sonoma: 'linear-gradient(165deg, #0f2027 0%, #203a43 28%, #2c5364 55%, #6b4f7a 78%, #c06c84 100%)',
        ventura: 'linear-gradient(180deg, #1a1f3b 0%, #3d2c5e 35%, #7b4397 60%, #dc2430 100%)',
    };

    const MACOS_WALLPAPER = { type: 'gradient', value: 'sonoma', blur: 0 };

    function isMacosAuth() {
        const d = document.documentElement.dataset.design || 'classic';
        return d === 'macos' || d === 'macos-v2';
    }

    function normalizeWallpaper(w) {
        if (!w || typeof w !== 'object') return { ...MACOS_WALLPAPER };
        const hasImage = w.type === 'image' && String(w.value || '').trim();
        return {
            type: hasImage ? 'image' : 'gradient',
            value: hasImage ? String(w.value).trim() : (w.value || 'aurora'),
            blur: Math.max(0, Math.min(24, Number(w.blur) || 0)),
        };
    }

    function loadWorkspaceWallpaper() {
        try {
            const raw = localStorage.getItem('workspace:v1');
            if (!raw) return { type: 'gradient', value: 'aurora', blur: 0 };
            const parsed = JSON.parse(raw);
            return normalizeWallpaper(parsed.wallpaper);
        } catch {
            return { type: 'gradient', value: 'aurora', blur: 0 };
        }
    }

    function paintWallpaper(wallpaper) {
        const bg = document.getElementById('auth-macos-wallpaper');
        if (!bg || !isMacosAuth()) return;

        const w = normalizeWallpaper(wallpaper);
        bg.style.filter = w.blur ? `blur(${w.blur}px)` : '';
        bg.style.transform = w.blur ? 'scale(1.06)' : '';

        if (w.type === 'image') {
            bg.style.backgroundColor = '#0a0a0c';
            bg.style.backgroundImage = `url("${String(w.value).replace(/"/g, '%22')}")`;
        } else {
            bg.style.backgroundColor = '#0a0a0c';
            bg.style.backgroundImage = WALLPAPER_PRESETS[w.value] || WALLPAPER_PRESETS.aurora;
        }
    }

    function placeThemeButton() {
        const btn = document.getElementById('theme-toggle-btn');
        const slot = document.getElementById('auth-theme-btn-slot');
        const menubarLeft = document.querySelector('.auth-macos-menubar__left');
        if (!btn) return;

        if (isMacosAuth() && menubarLeft) {
            menubarLeft.appendChild(btn);
            btn.classList.add('auth-theme-btn--menubar');
            return;
        }

        if (slot && btn.parentElement !== slot) {
            slot.appendChild(btn);
        }
        btn.classList.remove('auth-theme-btn--menubar');
    }

    function refresh() {
        document.body.classList.toggle('auth-macos-layout', isMacosAuth());
        placeThemeButton();
        if (typeof window.AuthMacosV2Login !== 'undefined') {
            window.AuthMacosV2Login.refresh();
        }
        syncUsernameVisibility();
        if (!isMacosAuth()) return;

        const design = document.documentElement.dataset.design;
        if (design === 'macos-v2') {
            paintWallpaper(loadWorkspaceWallpaper());
        } else {
            paintWallpaper(MACOS_WALLPAPER);
        }
    }

    function updateClock() {
        const el = document.getElementById('auth-macos-clock');
        if (!el) return;
        try {
            el.textContent = new Intl.DateTimeFormat('ru-RU', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            }).format(new Date());
        } catch {
            el.textContent = '';
        }
    }

    function syncUsernameVisibility() {
        const input = document.getElementById('username');
        const field = document.querySelector('.auth-field--username');
        if (!input || !field) return;
        const collapsed = isMacosAuth() && !!input.value.trim();
        field.classList.toggle('auth-field--collapsed', collapsed);
    }

    function syncDisplayName() {
        const input = document.getElementById('username');
        const label = document.getElementById('auth-macos-display-name');
        if (!input || !label) return;

        const apply = () => {
            const val = input.value.trim();
            if (!label.dataset.serverName) {
                label.textContent = val || label.textContent.trim() || 'Administrator';
            } else if (val) {
                label.textContent = val;
            }
            syncUsernameVisibility();
        };

        if (label.textContent.trim() && label.textContent.trim() !== 'Administrator') {
            label.dataset.serverName = '1';
        }

        apply();
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
    }

    function init() {
        refresh();
        updateClock();
        setInterval(updateClock, 30000);
        syncDisplayName();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.AuthMacos = { refresh };
})();
