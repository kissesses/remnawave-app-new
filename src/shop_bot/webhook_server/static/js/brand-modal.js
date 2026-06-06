(function () {
    'use strict';

    function init() {
        const titleEl = document.getElementById('brand-title');
        const glassTitleEl = document.getElementById('glass-brand-title');
        const editBtn = document.getElementById('brand-edit');
        const inputEl = document.getElementById('brand-input');
        const previewEl = document.getElementById('brand-preview-title');

        function openBrandModal() {
            const current = (titleEl || glassTitleEl)?.textContent.trim() || '';
            if (inputEl) {
                inputEl.value = current;
                if (previewEl) previewEl.textContent = current || 'Remnawave Control';
            }
            if (typeof window.openModal === 'function') {
                window.openModal('brandModal');
            }
            inputEl?.focus();
            inputEl?.select();
        }

        editBtn?.addEventListener('click', openBrandModal);
        document.getElementById('glass-brand-edit')?.addEventListener('click', openBrandModal);

        if (inputEl && previewEl) {
            inputEl.addEventListener('input', () => {
                const val = inputEl.value.trim();
                previewEl.textContent = val || 'Remnawave Control';
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
