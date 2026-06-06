/**
 * Media Studio — gallery and upload for bot screen images
 */
(function () {
    'use strict';

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

    function menuImageUrl(section) {
        const boot = window.CONTENT_PANEL_BOOT || {};
        const base = boot.menuImageBase || '/settings/content/menu-image/';
        return `${base}${encodeURIComponent(section)}?t=${Date.now()}`;
    }

    function toast(kind, msg) {
        if (window.showToast) window.showToast(kind, msg);
    }

    async function mediaRequest(url, method, body) {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const resp = await fetch(url, {
            method,
            body,
            credentials: 'same-origin',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrf,
            },
        });
        try {
            return await resp.json();
        } catch (_) {
            return { ok: false, error: 'Ошибка сервера' };
        }
    }

    function imageUrlInput(section) {
        if (section === 'main_menu') return $('main_menu_image_url');
        return $(`${section}_image_url`);
    }

    function selectMediaTile(tile) {
        if (!tile) return;
        document.querySelectorAll('.cnt-media-tile').forEach((t) => t.classList.remove('is-selected'));
        tile.classList.add('is-selected');

        const section = tile.dataset.section;
        const label = tile.dataset.label || section;
        const tag = tile.dataset.tag || '';
        const desc = tile.dataset.desc || '';
        const hasImage = tile.dataset.hasImage === '1';

        const empty = $('cnt-media-preview-empty');
        const body = $('cnt-media-preview-body');
        if (empty) empty.hidden = true;
        if (body) body.hidden = false;

        if ($('cnt-media-preview-title')) $('cnt-media-preview-title').textContent = label;
        const tagEl = $('cnt-media-preview-tag');
        if (tagEl) {
            tagEl.innerHTML = tag
                ? `<span class="material-symbols-outlined" style="font-size:.85rem">sell</span>${escapeHtml(tag)}`
                : '';
            tagEl.hidden = !tag;
        }
        if ($('cnt-media-preview-desc')) $('cnt-media-preview-desc').textContent = desc;
        if ($('cnt-media-preview-path')) $('cnt-media-preview-path').value = imageUrlInput(section)?.value || '';

        document.querySelectorAll('.cnt-media-preview__actions [data-section]').forEach((btn) => {
            btn.dataset.section = section;
        });

        const imgEl = $('cnt-media-preview-img');
        if (imgEl) {
            if (hasImage) {
                imgEl.src = menuImageUrl(section);
                imgEl.hidden = false;
            } else {
                imgEl.hidden = true;
                imgEl.removeAttribute('src');
            }
        }
    }

    function updateMediaTileThumb(section, hasImage) {
        const tile = document.querySelector(`.cnt-media-tile[data-section="${section}"]`);
        if (!tile) return;
        tile.dataset.hasImage = hasImage ? '1' : '0';
        tile.querySelector('.cnt-media-tile__dot')?.classList.toggle('cnt-media-tile__dot--ok', !!hasImage);
        const thumb = tile.querySelector('.cnt-media-tile__thumb');
        if (thumb) {
            thumb.innerHTML = hasImage
                ? `<img src="${menuImageUrl(section)}" alt="" loading="lazy" />`
                : '<span class="material-symbols-outlined">image</span>';
        }
        if (tile.classList.contains('is-selected')) selectMediaTile(tile);
        updateCoverageBar();
    }

    function updateCoverageBar() {
        const tiles = document.querySelectorAll('.cnt-media-tile');
        const total = tiles.length;
        let filled = 0;
        tiles.forEach((t) => { if (t.dataset.hasImage === '1') filled += 1; });
        const pct = total ? Math.round((filled / total) * 100) : 0;
        const fill = $('cnt-coverage-fill');
        const label = $('cnt-coverage-label');
        if (fill) fill.style.width = `${pct}%`;
        if (label) label.textContent = `${filled} / ${total} экранов`;
    }

    function initMediaStudio() {
        const grid = $('cnt-media-grid');
        if (!grid) return;

        grid.querySelectorAll('.cnt-media-tile').forEach((tile) => {
            tile.addEventListener('click', () => selectMediaTile(tile));
        });
        const first = grid.querySelector('.cnt-media-tile');
        if (first) selectMediaTile(first);

        $('cnt-media-search')?.addEventListener('input', (e) => {
            const q = e.target.value.trim().toLowerCase();
            grid.querySelectorAll('.cnt-media-tile').forEach((tile) => {
                const hay = `${tile.dataset.label || ''} ${tile.dataset.tag || ''} ${tile.dataset.desc || ''}`.toLowerCase();
                tile.classList.toggle('is-hidden', q.length > 0 && !hay.includes(q));
            });
        });

        document.querySelectorAll('.cnt-media-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                document.querySelectorAll('.cnt-media-filter').forEach((b) => {
                    b.classList.toggle('is-active', b.dataset.cat === cat);
                });
                grid.querySelectorAll('.cnt-media-tile').forEach((tile) => {
                    tile.classList.toggle('is-hidden', cat !== 'all' && tile.dataset.cat !== cat);
                });
            });
        });

        updateCoverageBar();
    }

    function initImageUploaders() {
        document.querySelectorAll('input[type="file"][data-section]').forEach((input) => {
            if (input.dataset.processed) return;
            input.dataset.processed = '1';
            input.addEventListener('change', async () => {
                if (!input.files?.[0]) return;
                const fd = new FormData();
                fd.append('file', input.files[0]);
                const result = await mediaRequest(`/upload-menu-image/${input.dataset.section}`, 'POST', fd);
                if (result.ok) {
                    const urlInput = imageUrlInput(input.dataset.section);
                    if (urlInput) urlInput.value = result.path;
                    toast('success', 'Изображение загружено');
                    updateMediaTileThumb(input.dataset.section, !!result.path);
                } else {
                    toast('danger', result.error || 'Ошибка загрузки');
                }
                input.value = '';
            });
        });

        document.querySelectorAll('.btn-delete-menu-image').forEach((btn) => {
            if (btn.dataset.processed) return;
            btn.dataset.processed = '1';
            btn.addEventListener('click', async () => {
                const section = btn.dataset.section;
                const ok = window.showConfirm
                    ? await window.showConfirm({ title: 'Удалить изображение?', type: 'warning', confirmText: 'Удалить' })
                    : confirm('Удалить изображение?');
                if (!ok) return;
                const result = await mediaRequest(`/delete-menu-image/${section}`, 'POST', null);
                if (result.ok) {
                    const urlInput = imageUrlInput(section);
                    if (urlInput) urlInput.value = '';
                    toast('success', 'Изображение удалено');
                    updateMediaTileThumb(section, false);
                } else {
                    toast('danger', result.error || 'Ошибка удаления');
                }
            });
        });

        document.querySelectorAll('.btn-upload-menu-image').forEach((btn) => {
            if (btn.dataset.processed) return;
            btn.dataset.processed = '1';
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                const fileId = section === 'main_menu' ? 'main_menu_image_file' : `${section}_image_file`;
                $(fileId)?.click();
            });
        });
    }

    window.CONTENT_PANEL = { onImageUpdated: updateMediaTileThumb };

    function init() {
        if (!document.querySelector('[data-media-studio]')) return;
        initMediaStudio();
        initImageUploaders();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
