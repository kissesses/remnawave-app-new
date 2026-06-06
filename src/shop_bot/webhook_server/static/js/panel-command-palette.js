(function () {
    'use strict';

    const EXTRA_COMMANDS = [
        { label: 'Оформление панели', url: null, icon: 'palette', action: 'theme', keys: ['тема', 'оформление', 'theme'] },
        { label: 'О проекте', url: null, icon: 'info', action: 'about', keys: ['about', 'версия'] },
    ];

    let items = [];
    let filtered = [];
    let activeIndex = 0;
    let open = false;

    function collectNavItems() {
        const seen = new Set();
        items = [];
        document.querySelectorAll('[data-cmd-label][data-cmd-url]').forEach((el) => {
            const url = el.dataset.cmdUrl;
            const label = el.dataset.cmdLabel;
            if (!url || !label || seen.has(url)) return;
            seen.add(url);
            const icon = el.querySelector('.material-symbols-outlined')?.textContent?.trim() || 'link';
            items.push({ label, url, icon, keys: [label.toLowerCase()] });
        });
        document.querySelectorAll('.panel-topbar__nav-link').forEach((el) => {
            const url = el.getAttribute('href');
            const label = el.querySelector('.panel-topbar__nav-label')?.textContent?.trim();
            if (!url || !label || seen.has(url)) return;
            seen.add(url);
            const icon = el.querySelector('.material-symbols-outlined')?.textContent?.trim() || 'link';
            items.push({ label, url, icon, keys: [label.toLowerCase()] });
        });
        document.querySelectorAll('.panel-dock__item[data-route]').forEach((el) => {
            const url = el.dataset.route;
            const label = el.dataset.windowTitle || el.getAttribute('aria-label');
            if (!url || !label || seen.has(url)) return;
            seen.add(url);
            const icon = el.querySelector('.material-symbols-outlined')?.textContent?.trim() || 'link';
            items.push({ label, url, icon, keys: [label.toLowerCase()] });
        });
        items = items.concat(EXTRA_COMMANDS);
    }

    function filter(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            filtered = items.slice();
            return;
        }
        filtered = items.filter((item) => {
            if (item.label.toLowerCase().includes(q)) return true;
            return (item.keys || []).some((k) => k.includes(q));
        });
        activeIndex = 0;
    }

    function render() {
        const list = document.getElementById('panel-cmdk-list');
        if (!list) return;
        if (!filtered.length) {
            list.innerHTML = '<li class="panel-cmdk__empty">Ничего не найдено</li>';
            return;
        }
        list.innerHTML = filtered.map((item, i) => `
            <li class="panel-cmdk__item${i === activeIndex ? ' is-active' : ''}" data-cmdk-index="${i}" role="option">
                <span class="material-symbols-outlined">${item.icon}</span>
                <span>${item.label}</span>
                ${item.action ? '<span class="panel-cmdk__item-meta">действие</span>' : ''}
            </li>
        `).join('');
    }

    function openPalette() {
        const root = document.getElementById('panel-cmdk');
        const input = document.getElementById('panel-cmdk-input');
        if (!root || !input) return;
        collectNavItems();
        filter('');
        render();
        root.classList.remove('hidden');
        open = true;
        input.value = '';
        setTimeout(() => input.focus(), 30);
    }

    function closePalette() {
        document.getElementById('panel-cmdk')?.classList.add('hidden');
        open = false;
    }

    function runItem(item) {
        if (!item) return;
        closePalette();
        if (item.action === 'theme' && window.ThemeManager?.open) {
            window.ThemeManager.open();
            return;
        }
        if (item.action === 'about') {
            document.getElementById('about-open-btn')?.click();
            return;
        }
        if (item.url) window.location.href = item.url;
    }

    function init() {
        const root = document.getElementById('panel-cmdk');
        const input = document.getElementById('panel-cmdk-input');
        if (!root || !input) return;

        document.getElementById('panel-cmdk-hint')?.addEventListener('click', openPalette);

        root.querySelector('[data-cmdk-close]')?.addEventListener('click', closePalette);

        input.addEventListener('input', () => {
            filter(input.value);
            render();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
                render();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
                render();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                runItem(filtered[activeIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closePalette();
            }
        });

        root.querySelector('#panel-cmdk-list')?.addEventListener('click', (e) => {
            const li = e.target.closest('[data-cmdk-index]');
            if (!li) return;
            runItem(filtered[parseInt(li.dataset.cmdkIndex, 10)]);
        });

        document.addEventListener('keydown', (e) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (open) closePalette();
                else openPalette();
            }
            if (e.key === 'Escape' && open) closePalette();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.PanelCommandPalette = { open: openPalette, close: closePalette };
})();
