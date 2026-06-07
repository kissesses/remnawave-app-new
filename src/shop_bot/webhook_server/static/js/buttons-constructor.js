/**
 * Remnawave App — Button Constructor
 */
(function () {
    'use strict';

    const AVAILABLE_BUTTONS_HELP = [
        { m: 'admin_menu', id: 'admins', t: '👮 Администраторы', c: 'admin_admins_menu', u: '' },
        { m: 'admin_menu', id: 'backup', t: '🗄 Бэкап БД', c: 'admin_backup_db', u: '' },
        { m: 'admin_menu', id: 'broadcast', t: '📢 Рассылка', c: 'start_broadcast', u: '' },
        { m: 'admin_menu', id: 'gift_key', t: '🎁 Выдать ключ', c: 'admin_gift_key', u: '' },
        { m: 'admin_menu', id: 'host_keys', t: '🌍 Ключи на хосте', c: 'admin_host_keys', u: '' },
        { m: 'admin_menu', id: 'monitor', t: '📊 Мониторинг', c: 'admin_monitor', u: '' },
        { m: 'admin_menu', id: 'promo', t: '🎟 Промокоды', c: 'admin_promo_menu', u: '' },
        { m: 'admin_menu', id: 'restore', t: '♻️ Восстановить БД', c: 'admin_restore_db', u: '' },
        { m: 'admin_menu', id: 'speedtest', t: '⚡ Тест скорости', c: 'admin_speedtest', u: '' },
        { m: 'admin_menu', id: 'users', t: '👥 Пользователи', c: 'admin_users', u: '' },
        { m: 'admin_menu', id: 'back_to_menu', t: '⬅️ Назад в меню', c: 'back_to_main_menu', u: '' },
        { m: 'key_info_menu', id: 'connect', t: '📲 Подключиться', c: '', u: '{connection_string}' },
        { m: 'key_info_menu', id: 'extend', t: '➕ Продлить ключ', c: 'extend_key_{key_id}', u: '' },
        { m: 'key_info_menu', id: 'key_devices', t: '📱 Устройства', c: 'key_devices_{key_id}', u: '' },
        { m: 'key_info_menu', id: 'qr', t: '📱 QR-код', c: 'show_qr_{key_id}', u: '' },
        { m: 'key_info_menu', id: 'howto', t: '📖 Инструкция', c: 'howto_vless_{key_id}', u: '' },
        { m: 'key_info_menu', id: 'comment_key', t: '📝 Комментарий', c: 'key_comments_{key_id}', u: '' },
        { m: 'key_info_menu', id: 'back', t: '⬅️ Назад к списку ключей', c: 'manage_keys', u: '' },
        { m: 'main_menu', id: 'about', t: 'ℹ️ О проекте', c: 'show_about', u: '' },
        { m: 'main_menu', id: 'admin', t: '⚙️ Админка', c: 'admin_menu', u: '' },
        { m: 'main_menu', id: 'buy_key', t: '🛒 Купить', c: 'buy_new_key', u: '' },
        { m: 'main_menu', id: 'howto', t: '❓ Как использовать', c: 'howto_vless', u: '' },
        { m: 'main_menu', id: 'my_keys', t: '🔑 Мои ключи ({len(user_keys)})', c: 'manage_keys', u: '' },
        { m: 'main_menu', id: 'profile', t: '👤 Профиль', c: 'show_profile', u: '' },
        { m: 'main_menu', id: 'referral', t: '🤝 Реферальная программа', c: 'show_referral_program', u: '' },
        { m: 'main_menu', id: 'speed', t: '⚡ Скорость', c: 'user_speedtest_last', u: '' },
        { m: 'main_menu', id: 'support', t: '💌 Поддержка', c: 'show_help', u: '' },
        { m: 'main_menu', id: 'topup', t: '💳 Баланс ({balance}₽)', c: 'top_up_start', u: '' },
        { m: 'main_menu', id: 'trial', t: '🎁 Попробовать бесплатно', c: 'get_trial', u: '' },
        { m: 'profile_menu', id: 'topup', t: '💳 Пополнить баланс', c: 'top_up_start', u: '' },
        { m: 'profile_menu', id: 'referral', t: '🤝 Реферальная программа', c: 'show_referral_program', u: '' },
        { m: 'profile_menu', id: 'howto', t: '🛠 Подключиться', c: 'howto_vless', u: '' },
        { m: 'profile_menu', id: 'promo_uni', t: '🎁 Ввести промокод', c: 'promo_uni', u: '' },
        { m: 'profile_menu', id: 'back_to_menu', t: '⬅️ Назад в меню', c: 'back_to_main_menu', u: '' },
        { m: 'support_menu', id: 'new_ticket', t: '✍️ Новое обращение', c: 'support_new_ticket', u: '' },
        { m: 'support_menu', id: 'my_tickets', t: '📨 Мои обращения', c: 'support_my_tickets', u: '' },
        { m: 'support_menu', id: 'external', t: '🆘 Внешняя поддержка', c: 'support_external', u: '' },
        { m: 'support_menu', id: 'back_to_menu', t: '⬅️ Назад в меню', c: 'back_to_main_menu', u: '' },
    ];

    const MENU_META = {
        main_menu: { label: 'Главное', icon: 'home', title: '🏠 Главное меню', subtitle: 'Выберите действие:' },
        admin_menu: { label: 'Админ', icon: 'admin_panel_settings', title: '⚙️ Админ панель', subtitle: 'Административные функции:' },
        profile_menu: { label: 'Профиль', icon: 'person', title: '👤 Мой профиль', subtitle: 'Управление профилем:' },
        support_menu: { label: 'Поддержка', icon: 'support_agent', title: '🆘 Поддержка', subtitle: 'Система поддержки:' },
        key_info_menu: { label: 'Ключ', icon: 'vpn_key', title: '🔑 Информация о ключе', subtitle: 'Управление ключом:' },
    };

    const CALLBACK_HINTS = {
        back_to_main_menu: '⬅️ Вернуться в главное меню',
        show_profile: '👤 Открыть профиль',
        manage_keys: '🔑 Список ключей',
        buy_new_key: '🛒 Покупка ключа',
        top_up_start: '💳 Пополнение баланса',
        show_referral_program: '🤝 Реферальная программа',
        show_help: '🆘 Поддержка',
        show_about: 'ℹ️ О проекте',
        admin_menu: '⚙️ Админ-меню',
        admin_users: '👥 Пользователи',
        start_broadcast: '📢 Рассылка',
        support_new_ticket: '📝 Новое обращение',
        support_my_tickets: '📋 Мои обращения',
    };

    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function escapeHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    class ButtonConstructor {
        constructor() {
            this.currentMenuType = 'main_menu';
            this.selectedButton = null;
            this.buttons = [];
            this.isPreviewLoading = false;
            this.gridFilter = '';
            this.debouncedSave = debounce(() => this.saveButtonProperties(true), 800);
            this.debouncedPreview = debounce(() => this.showPreview(true), 400);
            this.init();
        }

        init() {
            this.initSoftSelects();
            this.bindEvents();
            this.initMenuTabs();
            this.initHelpModal();
            this.loadButtons();
        }

        initSoftSelects() {
            if (!window.initSoftSelect) return;
            window.initSoftSelect('action-type', 'Callback (внутреннее действие)');
            window.initSoftSelect('button-width', '1 колонка (обычная)');
            window.initSoftSelect('new-action-type', 'Callback');
            window.initSoftSelect('new-button-width', '1 колонка (обычная)');
        }

        initMenuTabs() {
            document.querySelectorAll('.btn-cstr-menu-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const menu = tab.dataset.menu;
                    if (!menu || menu === this.currentMenuType) return;
                    this.currentMenuType = menu;
                    document.querySelectorAll('.btn-cstr-menu-tab').forEach((t) => {
                        t.classList.toggle('is-active', t.dataset.menu === menu);
                        t.setAttribute('aria-selected', t.dataset.menu === menu ? 'true' : 'false');
                    });
                    this.selectedButton = null;
                    this.updateInspectorEmpty();
                    this.loadButtons();
                });
            });
        }

        bindEvents() {
            document.getElementById('add-button-btn')?.addEventListener('click', () => this.showAddModal());
            document.getElementById('duplicate-button-btn')?.addEventListener('click', () => this.duplicateSelected());
            document.getElementById('export-menu-btn')?.addEventListener('click', () => this.exportMenuJson());
            document.getElementById('import-menu-btn')?.addEventListener('click', () => {
                document.getElementById('import-menu-file')?.click();
            });
            document.getElementById('import-menu-file')?.addEventListener('change', (e) => this.importMenuJson(e));
            document.getElementById('refresh-preview-btn')?.addEventListener('click', () => this.showPreview(false));
            document.getElementById('clear-preview-btn')?.addEventListener('click', () => this.clearPreview());

            document.getElementById('button-properties-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveButtonProperties();
            });

            document.getElementById('action-type')?.addEventListener('change', (e) => this.toggleActionFields(e.target.value));
            document.getElementById('new-action-type')?.addEventListener('change', (e) => this.toggleNewActionFields(e.target.value));
            document.getElementById('delete-button-btn')?.addEventListener('click', () => this.deleteButton());
            document.getElementById('confirm-add-button')?.addEventListener('click', () => this.addNewButton());

            document.getElementById('button-width')?.addEventListener('change', (e) => {
                this.updateButtonWidthPreview(parseInt(e.target.value, 10));
                this.saveButtonProperties(true);
            });

            ['button-text', 'row-position', 'column-position', 'sort-order', 'emoji-id', 'callback-data', 'button-url'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', () => this.debouncedSave());
            });

            document.getElementById('is-active')?.addEventListener('change', () => this.debouncedSave());

            document.getElementById('grid-search')?.addEventListener('input', (e) => {
                this.gridFilter = (e.target.value || '').trim().toLowerCase();
                this.applyGridFilter();
            });

            this.initColorPicker('color-picker', 'button-color', true);
            this.initColorPicker('new-color-picker', 'new-button-color', false);

            document.addEventListener('keydown', (e) => {
                if (e.target.matches('input, textarea, select') && !e.metaKey && !e.ctrlKey) return;
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    this.saveButtonProperties();
                }
                if (e.key === 'Delete' && this.selectedButton && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    this.deleteButton();
                }
                if (e.key === 'd' && (e.metaKey || e.ctrlKey) && this.selectedButton) {
                    e.preventDefault();
                    this.duplicateSelected();
                }
            });
        }

        initColorPicker(pickerId, hiddenInputId, autoSave) {
            const picker = document.getElementById(pickerId);
            if (!picker) return;
            picker.addEventListener('click', (e) => {
                const swatch = e.target.closest('.color-swatch');
                if (!swatch) return;
                picker.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
                swatch.classList.add('active');
                document.getElementById(hiddenInputId).value = swatch.dataset.color || '';
                if (autoSave) this.debouncedSave();
            });
        }

        async loadButtons() {
            try {
                const resp = await fetch(`/api/button-configs/${this.currentMenuType}`, {
                    headers: { 'X-CSRFToken': getCsrfToken() },
                });
                const result = await resp.json();
                this.buttons = result.success ? result.data || [] : [];
            } catch (e) {
                console.error('Error loading buttons:', e);
                this.buttons = [];
            }
            this.renderButtons();
            this.updateStats();
            this.debouncedPreview();
        }

        updateStats() {
            const active = this.buttons.filter((b) => b.is_active === 1 || b.is_active === true).length;
            const hidden = this.buttons.length - active;
            const elActive = document.getElementById('stat-active');
            const elHidden = document.getElementById('stat-hidden');
            const elTotal = document.getElementById('stat-total');
            if (elActive) elActive.textContent = String(active);
            if (elHidden) elHidden.textContent = String(hidden);
            if (elTotal) elTotal.textContent = String(this.buttons.length);
        }

        applyGridFilter() {
            const q = this.gridFilter;
            document.querySelectorAll('.button-item').forEach((el) => {
                const id = parseInt(el.dataset.buttonId, 10);
                const btn = this.buttons.find((b) => b.id === id);
                if (!btn) return;
                const hay = `${btn.button_id} ${btn.text} ${btn.callback_data || ''} ${btn.url || ''}`.toLowerCase();
                el.classList.toggle('is-filtered-out', q && !hay.includes(q));
            });
        }

        renderButtons() {
            const grid = document.getElementById('button-grid');
            const hiddenGrid = document.getElementById('hidden-button-grid');
            if (!grid || !hiddenGrid) return;

            grid.innerHTML = '';
            hiddenGrid.innerHTML = '';

            const sorted = [...this.buttons].sort((a, b) => {
                if (a.row_position !== b.row_position) return a.row_position - b.row_position;
                if (a.column_position !== b.column_position) return a.column_position - b.column_position;
                return (a.sort_order || 0) - (b.sort_order || 0);
            });

            let visibleCount = 0;
            let hiddenCount = 0;

            sorted.forEach((btn) => {
                const el = this.createButtonElement(btn);
                if (btn.is_active === 1 || btn.is_active === true) {
                    grid.appendChild(el);
                    visibleCount++;
                } else {
                    hiddenGrid.appendChild(el);
                    hiddenCount++;
                }
            });

            if (visibleCount === 0) {
                grid.innerHTML = '<div class="btn-cstr-empty empty-placeholder">Нет активных кнопок. Нажмите «Добавить» или выберите шаблон в справке.</div>';
            }
            if (hiddenCount === 0) {
                hiddenGrid.innerHTML = '<div class="btn-cstr-empty empty-placeholder" style="padding:1rem">Перетащите сюда кнопки, чтобы скрыть</div>';
            }

            this.initSortable();
            this.applyGridFilter();
        }

        createButtonElement(btn) {
            const div = document.createElement('div');
            div.className = 'button-item';
            div.dataset.buttonId = btn.id;

            const width = btn.button_width || 1;
            div.classList.add(`width-${width}`);
            if (this.selectedButton?.id === btn.id) div.classList.add('selected');

            const colorBadge = btn.button_color
                ? `<span class="inline-block w-2.5 h-2.5 rounded-full pointer-events-none" style="background:${this.getColorHex(btn.button_color)}"></span>`
                : '';
            const emojiTag = btn.emoji_id ? '<span class="text-[9px] text-amber-400/80">✨</span>' : '';
            const urlTag = btn.url ? '<span class="text-[9px] text-sky-400/80">🔗</span>' : '';

            div.innerHTML = `
                <div class="button-text pointer-events-none">${colorBadge}${escapeHtml(btn.text || btn.button_id)}</div>
                <div class="button-id pointer-events-none">${escapeHtml(btn.button_id)}</div>
                <div class="button-meta pointer-events-none">
                    <span class="button-width-indicator">${width}×</span>
                    ${emojiTag}${urlTag}
                </div>
                <div class="button-actions">
                    <button type="button" class="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70" title="Редактировать" data-action="edit">
                        <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button type="button" class="p-1 rounded bg-white/10 hover:bg-white/20 text-white/70" title="Дублировать" data-action="dup">
                        <span class="material-symbols-outlined text-sm">content_copy</span>
                    </button>
                    <button type="button" class="p-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400" title="Удалить" data-action="del">
                        <span class="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>`;

            div.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (action === 'edit') {
                    e.stopPropagation();
                    this.selectButton(btn.id);
                    return;
                }
                if (action === 'dup') {
                    e.stopPropagation();
                    this.duplicateButton(btn);
                    return;
                }
                if (action === 'del') {
                    e.stopPropagation();
                    this.deleteButton(btn.id);
                    return;
                }
                if (!e.target.closest('.button-actions')) this.selectButton(btn.id);
            });

            return div;
        }

        initSortable() {
            const grid = document.getElementById('button-grid');
            const hiddenGrid = document.getElementById('hidden-button-grid');
            if (typeof Sortable === 'undefined') return;

            if (this.sortableGrid) this.sortableGrid.destroy();
            if (this.sortableHiddenGrid) this.sortableHiddenGrid.destroy();

            const commonOptions = {
                group: 'buttons',
                animation: 180,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                emptyInsertThreshold: 8,
                onEnd: () => this.updateButtonPositions(),
            };

            this.sortableGrid = new Sortable(grid, commonOptions);
            this.sortableHiddenGrid = new Sortable(hiddenGrid, commonOptions);
        }

        updateButtonPositions() {
            const grid = document.getElementById('button-grid');
            const hiddenGrid = document.getElementById('hidden-button-grid');

            grid?.querySelector('.empty-placeholder')?.remove();
            hiddenGrid?.querySelector('.empty-placeholder')?.remove();

            const buttonOrders = [];
            const rows = [];
            let currentRow = [];
            let currentRowWidth = 0;

            Array.from(grid?.querySelectorAll('.button-item') || []).forEach((el) => {
                const id = parseInt(el.dataset.buttonId, 10);
                const btn = this.buttons.find((b) => b.id === id);
                if (!btn) return;

                let buttonWidth = 1;
                if (el.classList.contains('width-2')) buttonWidth = 2;
                else if (el.classList.contains('width-3')) buttonWidth = 3;
                else buttonWidth = btn.button_width || 1;

                btn.button_width = buttonWidth;
                btn.is_active = 1;

                if (buttonWidth === 3 || currentRowWidth + buttonWidth > 2) {
                    if (currentRow.length > 0) rows.push(currentRow);
                    currentRow = [];
                    currentRowWidth = 0;
                }
                currentRow.push({ button: btn, width: buttonWidth });
                currentRowWidth += buttonWidth;
            });
            if (currentRow.length > 0) rows.push(currentRow);

            rows.forEach((row, rowIndex) => {
                let columnIndex = 0;
                row.forEach(({ button, width }) => {
                    buttonOrders.push({
                        button_id: button.button_id,
                        sort_order: buttonOrders.length,
                        row_position: rowIndex,
                        column_position: columnIndex,
                        button_width: width,
                        is_active: 1,
                    });
                    columnIndex += width;
                });
            });

            Array.from(hiddenGrid?.querySelectorAll('.button-item') || []).forEach((el) => {
                const id = parseInt(el.dataset.buttonId, 10);
                const btn = this.buttons.find((b) => b.id === id);
                if (!btn) return;
                btn.is_active = 0;
                buttonOrders.push({
                    button_id: btn.button_id,
                    sort_order: buttonOrders.length,
                    row_position: 0,
                    column_position: 0,
                    button_width: btn.button_width || 1,
                    is_active: 0,
                });
            });

            this.saveButtonOrders(buttonOrders);
            this.updateButtonWidthClasses();
        }

        updateButtonWidthPreview(newWidth) {
            if (!this.selectedButton) return;
            const el = document.querySelector(`[data-button-id="${this.selectedButton.id}"]`);
            if (!el) return;
            el.classList.remove('width-1', 'width-2', 'width-3');
            el.classList.add(`width-${newWidth}`);
            this.selectedButton.button_width = newWidth;
            const ind = el.querySelector('.button-width-indicator');
            if (ind) ind.textContent = `${newWidth}×`;
            this.debouncedPreview();
        }

        updateButtonWidthClasses() {
            this.buttons.forEach((button) => {
                const el = document.querySelector(`[data-button-id="${button.id}"]`);
                if (!el) return;
                el.classList.remove('width-1', 'width-2', 'width-3');
                const w = button.button_width || 1;
                el.classList.add(`width-${w}`);
                const ind = el.querySelector('.button-width-indicator');
                if (ind) ind.textContent = `${w}×`;
            });
        }

        async saveButtonOrders(buttonOrders) {
            try {
                const response = await fetch(`/api/button-configs/${this.currentMenuType}/reorder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({ button_orders: buttonOrders }),
                });
                const result = await response.json();
                if (result.success) {
                    showToast('success', 'Порядок кнопок сохранён');
                    await this.loadButtons();
                } else {
                    showToast('danger', 'Ошибка: ' + result.error);
                }
            } catch (error) {
                showToast('danger', 'Ошибка: ' + error.message);
            }
        }

        selectButton(buttonId) {
            document.querySelectorAll('.button-item').forEach((el) => el.classList.remove('selected'));
            const element = document.querySelector(`[data-button-id="${buttonId}"]`);
            if (element) element.classList.add('selected');

            this.selectedButton = this.buttons.find((b) => b.id === buttonId);
            if (this.selectedButton) {
                this.loadButtonProperties();
                document.getElementById('btn-cstr-inspector')?.classList.remove('btn-cstr-inspector--empty');
                document.getElementById('inspector-empty')?.classList.add('hidden');
                document.getElementById('inspector-form-wrap')?.classList.remove('hidden');
                document.getElementById('duplicate-button-btn')?.removeAttribute('disabled');
            }
        }

        updateInspectorEmpty() {
            document.getElementById('btn-cstr-inspector')?.classList.add('btn-cstr-inspector--empty');
            document.getElementById('inspector-empty')?.classList.remove('hidden');
            document.getElementById('inspector-form-wrap')?.classList.add('hidden');
            document.getElementById('delete-button-btn')?.classList.add('hidden');
            document.getElementById('duplicate-button-btn')?.setAttribute('disabled', 'disabled');
        }

        loadButtonProperties() {
            if (!this.selectedButton) return;
            const btn = this.selectedButton;

            document.getElementById('button-id').value = btn.button_id || '';
            document.getElementById('button-text').value = btn.text || '';
            document.getElementById('action-type').value = btn.url ? 'url' : 'callback';
            document.getElementById('callback-data').value = btn.callback_data || '';
            document.getElementById('button-url').value = btn.url || '';
            document.getElementById('row-position').value = btn.row_position || 0;
            document.getElementById('column-position').value = btn.column_position || 0;
            document.getElementById('button-width').value = btn.button_width || 1;
            document.getElementById('sort-order').value = btn.sort_order || 0;
            document.getElementById('is-active').checked = btn.is_active === 1 || btn.is_active === true;
            document.getElementById('emoji-id').value = btn.emoji_id || '';

            const colorVal = btn.button_color || '';
            document.getElementById('button-color').value = colorVal;
            document.querySelectorAll('#color-picker .color-swatch').forEach((s) => {
                s.classList.toggle('active', (s.dataset.color || '') === colorVal);
            });

            this.toggleActionFields(btn.url ? 'url' : 'callback');
            document.getElementById('delete-button-btn')?.classList.remove('hidden');
            this.debouncedPreview();
        }

        toggleActionFields(type) {
            document.getElementById('callback-data-group')?.classList.toggle('hidden', type !== 'callback');
            document.getElementById('url-group')?.classList.toggle('hidden', type !== 'url');
        }

        toggleNewActionFields(type) {
            document.getElementById('new-callback-data-group')?.classList.toggle('hidden', type !== 'callback');
            document.getElementById('new-url-group')?.classList.toggle('hidden', type !== 'url');
        }

        async saveButtonProperties(silent = false) {
            if (!this.selectedButton) {
                if (!silent) showToast('warning', 'Выберите кнопку');
                return;
            }

            const data = {
                text: document.getElementById('button-text').value,
                callback_data:
                    document.getElementById('action-type').value === 'callback'
                        ? document.getElementById('callback-data').value
                        : null,
                url:
                    document.getElementById('action-type').value === 'url'
                        ? document.getElementById('button-url').value
                        : null,
                row_position: parseInt(document.getElementById('row-position').value, 10) || 0,
                column_position: parseInt(document.getElementById('column-position').value, 10) || 0,
                button_width: parseInt(document.getElementById('button-width').value, 10) || 1,
                sort_order: parseInt(document.getElementById('sort-order').value, 10) || 0,
                is_active: document.getElementById('is-active').checked,
                button_color: document.getElementById('button-color').value || '',
                emoji_id: document.getElementById('emoji-id').value.trim() || '',
            };

            try {
                const resp = await fetch(`/api/button-configs/${this.selectedButton.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data),
                });
                const result = await resp.json();
                if (result.success) {
                    if (!silent) showToast('success', 'Кнопка обновлена');
                    const selId = this.selectedButton?.id;
                    const activeId = document.activeElement?.id;
                    await this.loadButtons();
                    if (selId) this.selectButton(selId);
                    if (activeId) document.getElementById(activeId)?.focus();
                } else {
                    showToast('danger', 'Ошибка: ' + result.error);
                }
            } catch {
                showToast('danger', 'Ошибка сети');
            }
        }

        showAddModal(prefill) {
            document.getElementById('new-button-id').value = prefill?.id || '';
            document.getElementById('new-button-text').value = prefill?.t || '';
            document.getElementById('new-callback-data').value = prefill?.c || '';
            document.getElementById('new-button-url').value = prefill?.u || '';
            document.getElementById('new-action-type').value = prefill?.u ? 'url' : 'callback';
            document.getElementById('new-button-width').value = '1';
            document.getElementById('new-button-color').value = '';
            document.getElementById('new-emoji-id').value = '';
            document.querySelectorAll('#new-color-picker .color-swatch').forEach((s) => {
                s.classList.toggle('active', !s.dataset.color);
            });
            this.toggleNewActionFields(prefill?.u ? 'url' : 'callback');
            openModal('addButtonModal');
        }

        async addNewButton() {
            const buttonId = document.getElementById('new-button-id').value.trim();
            const text = document.getElementById('new-button-text').value.trim();
            if (!buttonId || !text) {
                showToast('warning', 'Заполните ID и текст');
                return;
            }

            const data = {
                menu_type: this.currentMenuType,
                button_id: buttonId,
                text,
                callback_data:
                    document.getElementById('new-action-type').value === 'callback'
                        ? document.getElementById('new-callback-data').value
                        : null,
                url:
                    document.getElementById('new-action-type').value === 'url'
                        ? document.getElementById('new-button-url').value
                        : null,
                row_position: 0,
                column_position: 0,
                button_width: parseInt(document.getElementById('new-button-width').value, 10) || 1,
                button_color: document.getElementById('new-button-color').value || '',
                emoji_id: document.getElementById('new-emoji-id').value.trim() || '',
            };

            try {
                const resp = await fetch('/api/button-configs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data),
                });
                const result = await resp.json();
                if (result.success) {
                    closeModal('addButtonModal');
                    showToast('success', 'Кнопка добавлена');
                    await this.loadButtons();
                } else {
                    showToast('danger', 'Ошибка: ' + result.error);
                }
            } catch {
                showToast('danger', 'Ошибка сети');
            }
        }

        async duplicateSelected() {
            if (!this.selectedButton) {
                showToast('warning', 'Выберите кнопку для дублирования');
                return;
            }
            await this.duplicateButton(this.selectedButton);
        }

        async duplicateButton(btn) {
            const suffix = '_copy_' + Date.now().toString(36).slice(-4);
            const newId = (btn.button_id || 'btn').slice(0, 40) + suffix;

            const data = {
                menu_type: this.currentMenuType,
                button_id: newId,
                text: (btn.text || btn.button_id) + ' (копия)',
                callback_data: btn.callback_data || null,
                url: btn.url || null,
                row_position: btn.row_position || 0,
                column_position: (btn.column_position || 0) + 1,
                button_width: btn.button_width || 1,
                button_color: btn.button_color || '',
                emoji_id: btn.emoji_id || '',
            };

            try {
                const resp = await fetch('/api/button-configs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify(data),
                });
                const result = await resp.json();
                if (result.success) {
                    showToast('success', 'Кнопка продублирована');
                    await this.loadButtons();
                } else {
                    showToast('danger', 'Ошибка: ' + result.error);
                }
            } catch {
                showToast('danger', 'Ошибка сети');
            }
        }

        async deleteButton(buttonId) {
            const id = buttonId || this.selectedButton?.id;
            if (!id) return;
            if (!confirm('Удалить эту кнопку?')) return;

            try {
                const resp = await fetch(`/api/button-configs/${id}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': getCsrfToken() },
                });
                const result = await resp.json();
                if (result.success) {
                    this.selectedButton = null;
                    this.updateInspectorEmpty();
                    showToast('success', 'Кнопка удалена');
                    await this.loadButtons();
                } else {
                    showToast('danger', 'Ошибка: ' + result.error);
                }
            } catch {
                showToast('danger', 'Ошибка сети');
            }
        }

        exportMenuJson() {
            const payload = {
                menu_type: this.currentMenuType,
                exported_at: new Date().toISOString(),
                buttons: this.buttons.map((b) => ({
                    button_id: b.button_id,
                    text: b.text,
                    callback_data: b.callback_data,
                    url: b.url,
                    row_position: b.row_position,
                    column_position: b.column_position,
                    button_width: b.button_width,
                    sort_order: b.sort_order,
                    is_active: b.is_active,
                    button_color: b.button_color,
                    emoji_id: b.emoji_id,
                })),
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `buttons-${this.currentMenuType}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('success', 'Меню экспортировано');
        }

        async importMenuJson(e) {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                const items = data.buttons || data;
                if (!Array.isArray(items) || !items.length) {
                    showToast('warning', 'Файл пуст или неверный формат');
                    return;
                }
                if (
                    !confirm(
                        `Импортировать ${items.length} кнопок в «${MENU_META[this.currentMenuType]?.label || this.currentMenuType}»? Существующие ID будут перезаписаны.`
                    )
                ) {
                    return;
                }

                let ok = 0;
                for (const b of items) {
                    if (!b.button_id || !b.text) continue;
                    const resp = await fetch('/api/button-configs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                        body: JSON.stringify({
                            menu_type: this.currentMenuType,
                            button_id: b.button_id,
                            text: b.text,
                            callback_data: b.callback_data || null,
                            url: b.url || null,
                            row_position: b.row_position ?? 0,
                            column_position: b.column_position ?? 0,
                            button_width: b.button_width ?? 1,
                            button_color: b.button_color || '',
                            emoji_id: b.emoji_id || '',
                        }),
                    });
                    const result = await resp.json();
                    if (result.success) ok++;
                    if (b.is_active === 0 || b.is_active === false) {
                        /* deactivate via reorder after load */
                    }
                }
                await this.loadButtons();
                showToast('success', `Импортировано: ${ok} кнопок`);
            } catch (err) {
                showToast('danger', 'Ошибка импорта: ' + err.message);
            }
        }

        showPreview(silent = false) {
            if (this.isPreviewLoading && !silent) return;

            const area = document.getElementById('preview-area');
            if (!area) return;

            if (!silent) {
                this.isPreviewLoading = true;
                area.innerHTML =
                    '<div class="preview-loading"><div class="spinner"></div><p>Обновление…</p></div>';
            }

            const finish = () => {
                const visible = this.buttons.filter((b) => b.is_active === 1 || b.is_active === true);
                const menuInfo = MENU_META[this.currentMenuType] || {
                    title: this.currentMenuType,
                    subtitle: 'Выберите действие:',
                };

                if (visible.length === 0) {
                    area.innerHTML =
                        '<div class="tg-preview-idle"><span class="material-symbols-outlined">touch_app</span><p>Нет активных кнопок</p></div>';
                    this.isPreviewLoading = false;
                    return;
                }

                const rows = {};
                visible.forEach((btn) => {
                    const row = btn.row_position || 0;
                    if (!rows[row]) rows[row] = [];
                    rows[row].push(btn);
                });

                const now = new Date();
                const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

                let keyboardHtml = '<div class="tg-preview-keyboard"><div class="tg-preview-keyboard__rows">';

                Object.keys(rows)
                    .sort((a, b) => a - b)
                    .forEach((row) => {
                        keyboardHtml += '<div class="tg-preview-keyboard__row">';
                        rows[row]
                            .sort((a, b) => (a.column_position || 0) - (b.column_position || 0))
                            .forEach((btn) => {
                                const width = btn.button_width || 1;
                                const flexStyle = width === 1 ? 'flex:1' : `flex:${Math.min(width, 2)}`;
                                const colorClass = btn.button_color
                                    ? ` telegram-button--${btn.button_color}`
                                    : btn.url
                                      ? ' telegram-button--url'
                                      : '';
                                const cb = escapeHtml(btn.callback_data || '');
                                const url = escapeHtml(btn.url || '');
                                const txt = escapeHtml(btn.text || btn.button_id);

                                keyboardHtml += `<button type="button" class="telegram-button${colorClass}" style="${flexStyle};min-width:0;"
                                    data-cb="${cb}" data-url="${url}" data-text="${txt}">
                                    <span class="telegram-button-content">
                                        <span class="telegram-button-text">${txt}</span>
                                        ${btn.url ? '<span class="telegram-button-url"><span class="material-symbols-outlined">open_in_new</span></span>' : ''}
                                    </span>
                                </button>`;
                            });
                        keyboardHtml += '</div>';
                    });

                keyboardHtml += '</div></div>';

                area.innerHTML = `
                    <div class="tg-preview-chat">
                        <div class="tg-preview-unit">
                            <div class="tg-preview-bubble">
                                <div class="tg-preview-bubble__title">${menuInfo.title}</div>
                                <div class="tg-preview-bubble__text">${menuInfo.subtitle}</div>
                                <div class="tg-preview-bubble__foot">
                                    <span class="tg-preview-bubble__time">${timeStr}</span>
                                </div>
                            </div>
                            ${keyboardHtml}
                        </div>
                    </div>`;

                area.querySelectorAll('.telegram-button').forEach((el) => {
                    el.addEventListener('click', () => {
                        this.handlePreviewClick(
                            el.dataset.cb || '',
                            el.dataset.url || '',
                            el.dataset.text || ''
                        );
                    });
                });

                this.isPreviewLoading = false;
            };

            if (silent) finish();
            else setTimeout(finish, 120);
        }

        handlePreviewClick(callbackData, url, text) {
            if (url) {
                if (confirm(`Открыть ссылку?\n\n${url}`)) window.open(url, '_blank');
            } else {
                const desc = this.getCallbackDescription(callbackData);
                alert(`«${text}»\n\n${desc}\n\nCallback: ${callbackData || '—'}`);
            }
        }

        getCallbackDescription(callbackData) {
            if (!callbackData) return 'Callback не указан';
            if (CALLBACK_HINTS[callbackData]) return CALLBACK_HINTS[callbackData];
            for (const [key, desc] of Object.entries(CALLBACK_HINTS)) {
                if (callbackData.startsWith(key)) return desc;
            }
            return `Действие: ${callbackData}`;
        }

        getColorHex(color) {
            return { red: '#ef5350', green: '#66bb6a', blue: '#42a5f5' }[color] || '#3a3a3c';
        }

        clearPreview() {
            const area = document.getElementById('preview-area');
            if (area) {
                area.innerHTML =
                    '<div class="tg-preview-idle"><span class="material-symbols-outlined">forum</span><p>Предпросмотр обновляется автоматически</p></div>';
            }
            this.isPreviewLoading = false;
        }

        initHelpModal() {
            const tbody = document.getElementById('help-table-body');
            const searchInput = document.getElementById('help-search');
            if (!tbody) return;

            const render = (filter = '') => {
                const q = filter.toLowerCase();
                tbody.innerHTML = AVAILABLE_BUTTONS_HELP.filter((b) => {
                    const menuName = MENU_META[b.m]?.label || b.m;
                    return (
                        !q ||
                        b.t.toLowerCase().includes(q) ||
                        b.id.toLowerCase().includes(q) ||
                        b.c.toLowerCase().includes(q) ||
                        b.u.toLowerCase().includes(q) ||
                        menuName.toLowerCase().includes(q)
                    );
                })
                    .map(
                        (b) => `
                    <tr class="btn-cstr-help-row hover:bg-white/[0.03]" data-id="${escapeHtml(b.id)}" data-t="${escapeHtml(b.t)}" data-c="${escapeHtml(b.c)}" data-u="${escapeHtml(b.u)}">
                        <td class="px-2 py-1.5 text-white/40 text-[10px] whitespace-nowrap">${MENU_META[b.m]?.label || b.m}</td>
                        <td class="px-2 py-1.5 font-mono text-primary/80 text-[10px] font-bold">${escapeHtml(b.id)}</td>
                        <td class="px-2 py-1.5 text-white text-[11px]">${escapeHtml(b.t)}</td>
                        <td class="px-2 py-1.5 font-mono text-amber-400/80 text-[10px] break-all max-w-[100px]">${escapeHtml(b.c) || '—'}</td>
                        <td class="px-2 py-1.5 font-mono text-sky-400/80 text-[10px] break-all max-w-[100px]">${escapeHtml(b.u) || '—'}</td>
                        <td class="px-2 py-1.5">
                            <button type="button" class="btn-cstr-help-action" data-help-add title="Добавить в текущее меню">+ Добавить</button>
                            <button type="button" class="btn-cstr-help-action" data-help-copy style="margin-left:4px" title="Копировать callback">📋</button>
                        </td>
                    </tr>`
                    )
                    .join('');

                tbody.querySelectorAll('[data-help-add]').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const row = btn.closest('tr');
                        if (!row) return;
                        closeModal('buttonHelpModal');
                        this.showAddModal({
                            id: row.dataset.id,
                            t: row.dataset.t,
                            c: row.dataset.c,
                            u: row.dataset.u,
                        });
                    });
                });

                tbody.querySelectorAll('[data-help-copy]').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const row = btn.closest('tr');
                        const val = row?.dataset.c || row?.dataset.u;
                        if (val && navigator.clipboard) {
                            navigator.clipboard.writeText(val);
                            showToast('success', 'Скопировано');
                        }
                    });
                });
            };

            searchInput?.addEventListener('input', (ev) => render(ev.target.value));
            render();
        }
    }

    window.buttonConstructor = new ButtonConstructor();

    function initPageTabs() {
        const PAGE_KEY = 'btn-cstr-page-tab';
        const layoutPane = document.getElementById('btn-cstr-layout-pane');
        const contentPane = document.getElementById('btn-cstr-content-pane');
        const mediaPane = document.getElementById('btn-cstr-media-pane');
        const layoutActions = document.querySelector('.btn-cstr-hero__actions--layout');
        if (!layoutPane || !contentPane) return;

        function setPageTab(tabId) {
            const isLayout = tabId === 'layout';
            const isContent = tabId === 'content';
            const isMedia = tabId === 'media';
            document.querySelectorAll('.btn-cstr-page-tab').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.pageTab === tabId);
            });
            layoutPane.hidden = !isLayout;
            contentPane.hidden = !isContent;
            if (mediaPane) mediaPane.hidden = !isMedia;
            if (layoutActions) layoutActions.style.display = isLayout ? '' : 'none';
            try {
                localStorage.setItem(PAGE_KEY, tabId);
            } catch (_) { /* ignore */ }
        }

        document.querySelectorAll('.btn-cstr-page-tab').forEach((btn) => {
            btn.addEventListener('click', () => setPageTab(btn.dataset.pageTab || 'layout'));
        });

        let initial = 'layout';
        const hash = (window.location.hash || '').replace(/^#/, '');
        if (hash === 'content' || hash === 'media') {
            initial = hash;
        } else {
            try {
                const stored = localStorage.getItem(PAGE_KEY);
                if (stored === 'content' || stored === 'media') initial = stored;
            } catch (_) { /* ignore */ }
        }
        setPageTab(initial);
    }

    initPageTabs();
})();
