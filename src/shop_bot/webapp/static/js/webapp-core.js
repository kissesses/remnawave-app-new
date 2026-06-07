        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.add('dark')
        }

        if (window.Telegram?.WebApp) {
            try {
                const tgApp = Telegram.WebApp;
                if ((tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) || (tgApp.platform && tgApp.platform !== 'unknown')) {
                    document.body.classList.add('tg-miniapp');
                }
                tgApp.ready();
                tgApp.expand();
                tgApp.setHeaderColor('#0a0a0a');
                tgApp.setBackgroundColor('#0a0a0a');
            } catch (e) { }
        }
        const mainPage = document.getElementById('main-page');
        const purchasePage = document.getElementById('purchase-page');
        const renewPage = document.getElementById('renew-page');
        const setupPage = document.getElementById('setup-page');
        const profilePage = document.getElementById('profile-page');
        const supportPage = document.getElementById('support-page');
        const purchaseBtn = document.getElementById('purchase-btn');
        const renewBtn = document.getElementById('renew-btn');
        const setupBtn = document.getElementById('setup-btn');
        const profileBtn = document.getElementById('profile-btn');
        const supportBtn = document.getElementById('support-btn');
        const backBtn = document.getElementById('back-btn');
        const backRenewBtn = document.getElementById('back-renew-btn');
        const backSetupBtn = document.getElementById('back-setup-btn');
        const backProfileBtn = document.getElementById('back-profile-btn');
        const backSupportBtn = document.getElementById('back-support-btn');
        const logoutBtn = document.getElementById('logout-btn');

        function updateThemeColor() {
            const meta = document.getElementById('dynamic-theme-color');
            if (!meta) return;
            const x = window.innerWidth / 2;
            const y = 2;
            const el = document.elementFromPoint(x, y);
            if (!el) return;
            let node = el;
            let color = '';
            while (node && node !== document.documentElement) {
                const bg = getComputedStyle(node).backgroundColor;
                if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                    color = bg;
                    break;
                }
                node = node.parentElement;
            }
            if (!color) color = getComputedStyle(document.body).backgroundColor;
            if (!color) return;
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const hex = '#' + [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(c => c.toString(16).padStart(2, '0')).join('');
            if (meta.content !== hex) {
                meta.content = hex;
                if (window.Telegram?.WebApp?.setHeaderColor) {
                    try { window.Telegram.WebApp.setHeaderColor(hex); } catch (e) { }
                }
            }
        }

        window.openLinkSafe = function (url) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
                try {
                    window.Telegram.WebApp.openLink(url);
                } catch (e) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        };

        let themeColorTimer = null;
        function onPageScroll() {
            if (themeColorTimer) return;
            themeColorTimer = setTimeout(() => {
                themeColorTimer = null;
                updateThemeColor();
            }, 100);
        }

        [mainPage, purchasePage, renewPage, setupPage, profilePage, supportPage].forEach(p => {
            if (p) p.addEventListener('scroll', onPageScroll, { passive: true });
        });

        setTimeout(updateThemeColor, 100);

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.removeAuthToken();
                window.location.href = "/";
            });
        }

        // --- Поддержка (Чат) Логика ---
        let currentTicketId = null;
        let supportPollInterval = null;
        let lastMessageCount = 0;

        function startSupportPolling() {
            if (supportPollInterval) clearInterval(supportPollInterval);
            supportPollInterval = setInterval(fetchSupportStatus, 5000);
        }

        function stopSupportPolling() {
            if (supportPollInterval) {
                clearInterval(supportPollInterval);
                supportPollInterval = null;
            }
        }

        function scrollToBottom(el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }

        function formatMessageTime(dateString) {
            if (!dateString) return '';
            try {
                // expecting YYYY-MM-DD HH:MM:SS
                const parts = dateString.split(' ');
                if (parts.length === 2) {
                    const timeParts = parts[1].split(':');
                    return `${timeParts[0]}:${timeParts[1]}`;
                }
                return dateString;
            } catch (e) { return dateString; }
        }

        function escapeHTML(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function renderMessages(messages) {
            const container = document.getElementById('support-messages-container');
            if (messages.length === lastMessageCount) return; // No new messages
            lastMessageCount = messages.length;

            let html = '';
            messages.forEach((msg, idx) => {
                const isUser = msg.sender === 'user';
                const timeStr = formatMessageTime(msg.created_at);
                const showAvatar = idx === 0 || messages[idx - 1].sender !== msg.sender;

                if (isUser) {
                    html += `
                        <div class="flex justify-end w-full mb-3 animate-in fade-in slide-in-from-right-2 duration-300">
                            <div class="max-w-[85%] w-fit bg-primary/20 border border-primary/30 text-white rounded-2xl rounded-br-sm px-3 pt-2 pb-1.5 shadow-lg flex items-end gap-2">
                                <span class="text-[14px] leading-snug break-words whitespace-pre-wrap">${escapeHTML(msg.content)}</span>
                                <span class="text-[10px] text-primary/80 font-bold leading-none shrink-0 mb-0.5">${timeStr}</span>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="flex items-end justify-start gap-2 w-full mb-3 animate-in fade-in slide-in-from-left-2 duration-300">
                            ${showAvatar ? `
                                <div class="w-8 h-8 glass-card border border-white/5 rounded-full flex items-center justify-center shrink-0 mb-0.5">
                                    <span class="material-icons-round text-[16px] text-gray-400">support_agent</span>
                                </div>
                            ` : `<div class="w-8 shrink-0"></div>`}
                            <div class="max-w-[85%] w-fit bg-white/5 border border-white/10 text-gray-100 rounded-2xl rounded-bl-sm px-3 pt-2 pb-1.5 shadow-lg flex items-end gap-2">
                                <span class="text-[14px] leading-snug break-words whitespace-pre-wrap">${escapeHTML(msg.content)}</span>
                                <span class="text-[10px] text-gray-500 font-bold leading-none shrink-0 mb-0.5">${timeStr}</span>
                            </div>
                        </div>
                    `;
                }
            });
            container.innerHTML = html;
            scrollToBottom(container);
        }

        async function fetchSupportStatus() {
            try {
                const response = await fetch('/api/support/status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: RENDERED_USER_ID })
                });
                const data = await response.json();

                document.getElementById('support-loading').classList.add('hidden');

                if (data.ok && data.has_ticket) {
                    currentTicketId = data.ticket_id;
                    document.getElementById('support-create-view').classList.add('hidden');
                    document.getElementById('support-chat-view').classList.remove('hidden');
                    document.getElementById('support-header-title').textContent = data.subject || `Тикет #${data.ticket_id}`;

                    const badge = document.getElementById('support-status-badge');
                    badge.classList.remove('hidden');
                    if (data.status === 'open') {
                        badge.innerHTML = '<span class="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full font-bold">🟢 Открыт</span>';
                        document.getElementById('support-input-area').classList.remove('hidden');
                        document.getElementById('support-closed-area').classList.add('hidden');
                    } else {
                        badge.innerHTML = '<span class="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold">🔴 Закрыт</span>';
                        document.getElementById('support-input-area').classList.add('hidden');
                        document.getElementById('support-closed-area').classList.remove('hidden');
                    }

                    renderMessages(data.messages || []);
                } else {
                    currentTicketId = null;
                    document.getElementById('support-create-view').classList.remove('hidden');
                    document.getElementById('support-chat-view').classList.add('hidden');
                    document.getElementById('support-header-title').textContent = 'Служба заботы';
                    document.getElementById('support-status-badge').classList.add('hidden');
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function createSupportTicket() {
            const input = document.getElementById('support-subject-input');
            const subj = input.value.trim();
            if (!subj) return showNotification('Укажите причину обращения', 'error');

            const btn = document.getElementById('support-create-btn');
            const ogHtml = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons-round animate-spin">refresh</span>';
            btn.disabled = true;

            try {
                const res = await fetch('/api/support/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: RENDERED_USER_ID, subject: subj })
                });
                const data = await res.json();
                if (data.ok) {
                    input.value = '';
                    await fetchSupportStatus();
                } else {
                    showNotification(data.error || 'Ошибка', 'error');
                }
            } catch (e) {
                showNotification('Ошибка связи', 'error');
            } finally {
                btn.innerHTML = ogHtml;
                btn.disabled = false;
            }
        }

        async function sendSupportMessage() {
            if (!currentTicketId) return;
            const input = document.getElementById('support-message-input');
            const text = input.value.trim();
            if (!text) return;

            const btn = document.getElementById('support-send-btn');
            btn.disabled = true;
            btn.style.opacity = '0.5';

            try {
                const res = await fetch('/api/support/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: RENDERED_USER_ID,
                        ticket_id: currentTicketId,
                        message: text
                    })
                });
                const data = await res.json();
                if (data.ok) {
                    input.value = '';
                    input.style.height = '';
                    await fetchSupportStatus();
                } else {
                    showNotification(data.error || 'Ошибка отправки', 'error');
                }
            } catch (e) {
                showNotification('Ошибка связи', 'error');
            } finally {
                btn.disabled = false;
                btn.style.opacity = '1';
                input.focus();
            }
        }

        function resetSupportChat() {
            currentTicketId = null;
            lastMessageCount = 0;
            document.getElementById('support-messages-container').innerHTML = '';
            document.getElementById('support-chat-view').classList.add('hidden');
            document.getElementById('support-create-view').classList.remove('hidden');
            document.getElementById('support-header-title').textContent = 'Служба заботы';
            document.getElementById('support-status-badge').classList.add('hidden');
        }

        // Enter to send
        document.getElementById('support-message-input')?.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendSupportMessage();
            }
        });


        function showPage(page) {
            [mainPage, purchasePage, renewPage, setupPage, profilePage, supportPage].forEach((el) => {
                el.style.display = 'none';
                el.classList.remove('webapp-page-active');
            });
            page.style.display = 'flex';
            page.classList.add('webapp-page-active');

            if (page === supportPage) {
                document.getElementById('support-loading').classList.remove('hidden');
                document.getElementById('support-create-view').classList.add('hidden');
                document.getElementById('support-chat-view').classList.add('hidden');
                fetchSupportStatus();
                startSupportPolling();
            } else {
                stopSupportPolling();
            }
            setTimeout(updateThemeColor, 50);
            if (window.WebappTheme) {
                const pageId = page.id || 'main-page';
                window.WebappTheme.onPageChange(pageId);
            }
        }
        window.showPage = showPage;
        purchaseBtn.addEventListener('click', () => { window.location.hash = 'bay'; });
        renewBtn.addEventListener('click', () => { window.location.hash = 'rebay'; });
        setupBtn.addEventListener('click', () => { window.location.hash = 'setup'; });
        profileBtn.addEventListener('click', () => { window.location.hash = 'pro'; });
        supportBtn.addEventListener('click', () => { window.location.hash = 'support'; });

        const goBackToMain = () => { window.location.hash = ''; };
        backBtn.addEventListener('click', goBackToMain);
        backRenewBtn.addEventListener('click', goBackToMain);
        backSetupBtn.addEventListener('click', goBackToMain);
        backProfileBtn.addEventListener('click', goBackToMain);
        backSupportBtn.addEventListener('click', goBackToMain);

        function handleHashChange() {
            const hash = window.location.hash.replace('#', '');
            if (hash === 'pro') showPage(profilePage);
            else if (hash === 'bay') showPage(purchasePage);
            else if (hash === 'rebay') showPage(renewPage);
            else if (hash === 'setup') showPage(setupPage);
            else if (hash === 'support') showPage(supportPage);
            else showPage(mainPage);
        }

        window.addEventListener('hashchange', handleHashChange);

        if (window.Telegram?.WebApp?.initDataUnsafe?.start_param) {
            const startParam = window.Telegram.WebApp.initDataUnsafe.start_param;
            const routeMap = { cabinet: '', profile: 'pro', buy: 'bay', support: 'support', setup: 'setup' };
            const route = routeMap[startParam] ?? startParam.replace(/^#/, '');
            if (route) window.location.hash = route;
            else window.location.hash = '';
            handleHashChange();
        } else {
            handleHashChange();
        }

        // Accordion for keys
        document.querySelectorAll('.key-toggle').forEach(button => {
            button.addEventListener('click', () => {
                const content = button.nextElementSibling;
                const icon = button.querySelector('.rotate-icon');
                content.classList.toggle('expanded');
                icon.classList.toggle('expanded');
            });
        });
        // Dropdown Logic
        const dropdownTrigger = document.getElementById('dropdown-trigger');
        const keyDropdown = document.getElementById('key-dropdown');
        const dropdownArrow = document.getElementById('dropdown-arrow');
        const dropdownOptions = document.querySelectorAll('.dropdown-option');
        const displaySelectedKey = document.getElementById('display-selected-key');

        function toggleDropdown() {
            const isOpen = !keyDropdown.classList.contains('pointer-events-none');
            if (isOpen) {
                keyDropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                dropdownArrow.style.transform = 'rotate(0deg)';
            } else {
                keyDropdown.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                dropdownArrow.style.transform = 'rotate(180deg)';
            }
        }
        dropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });
        document.addEventListener('click', () => {
            keyDropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            dropdownArrow.style.transform = 'rotate(0deg)';
        });
        window.selectRenewKey = function (option, skipToggle = false) {
            const keyNum = option.getAttribute('data-key');
            if (!keyNum) return;
            window.selectedKeyId = keyNum.replace('#', '');
            const keyName = option.getAttribute('data-name') || `Ключ ${keyNum}`;
            const keyDate = option.getAttribute('data-date');
            const keyIndex = option.getAttribute('data-index');

            const displayKeyEl = document.getElementById('display-selected-key');
            if (displayKeyEl) displayKeyEl.textContent = `${keyName} • До ${keyDate}`;

            document.querySelectorAll('#renew-keys-dropdown-container .dropdown-option').forEach(opt => {
                const isSelected = opt === option;
                const icon = opt.querySelector('.selected-icon');
                if (icon) {
                    icon.classList.toggle('text-primary', isSelected);
                    icon.classList.toggle('text-transparent', !isSelected);
                }
                const firstIcon = opt.querySelector('.material-icons-round:first-child');
                if (firstIcon) {
                    firstIcon.classList.toggle('text-primary', isSelected);
                    firstIcon.classList.toggle('text-gray-500', !isSelected);
                }
                const boldText = opt.querySelector('.font-bold');
                if (boldText) {
                    boldText.classList.toggle('text-white', isSelected);
                    boldText.classList.toggle('text-gray-300', !isSelected);
                }
            });

            document.querySelectorAll('[id^="renew-plans-"]').forEach(el => {
                if (el.classList.contains('server-plans-container')) el.style.display = 'none';
            });
            const renewPlanGrid = document.getElementById('renew-plans-' + keyIndex);
            if (renewPlanGrid) renewPlanGrid.style.display = 'grid';

            const renewInfoBlock = document.getElementById('renew-info-block');
            const renewDescContent = document.getElementById('renew-desc-content-' + keyIndex);
            if (renewInfoBlock && renewDescContent) {
                renewInfoBlock.innerHTML = renewDescContent.innerHTML;
            }
            if (typeof updateRenewInfoToggle === 'function') updateRenewInfoToggle();

            document.querySelectorAll('#renew-page .plan-btn').forEach(btn => {
                btn.classList.remove('border-primary', 'bg-primary/10', 'border-2');
                btn.classList.add('border-white/10');
            });

            const renewPayBtn = document.getElementById('renew-pay-button');
            const renewPayText = document.getElementById('renew-pay-button-text');
            if (renewPayBtn) {
                renewPayBtn.disabled = true;
                renewPayBtn.classList.remove('bg-white', 'text-black', 'shadow-[0_8px_30px_rgba(255,255,255,0.2)]', 'hover:shadow-white/40', 'active:scale-[0.97]');
                renewPayBtn.classList.add('bg-white/5', 'text-gray-500', 'pointer-events-none');
            }
            if (renewPayText) renewPayText.textContent = 'Выберите тариф';

            if (renewPlanGrid) {
                const firstPlan = renewPlanGrid.querySelector('.plan-btn[data-host]');
                if (firstPlan && typeof loadDeviceTiers === 'function') {
                    loadDeviceTiers(firstPlan.getAttribute('data-host'), 'renew');
                }
            }

            if (!skipToggle && typeof toggleDropdown === 'function') {
                toggleDropdown();
            }
        };

        dropdownOptions.forEach(option => {
            option.addEventListener('click', () => window.selectRenewKey(option));
        });
        // Server Dropdown Logic
        const serverDropdownTrigger = document.getElementById('server-dropdown-trigger');
        const serverDropdown = document.getElementById('server-dropdown');
        const serverDropdownArrow = document.getElementById('server-dropdown-arrow');
        const displaySelectedServer = document.getElementById('display-selected-server');

        function toggleServerDropdown() {
            const isOpen = !serverDropdown.classList.contains('pointer-events-none');
            if (isOpen) {
                serverDropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                serverDropdownArrow.style.transform = 'rotate(0deg)';
            } else {
                serverDropdown.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                serverDropdownArrow.style.transform = 'rotate(180deg)';
            }
        }

        serverDropdownTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleServerDropdown();
        });

        document.addEventListener('click', () => {
            serverDropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
            serverDropdownArrow.style.transform = 'rotate(0deg)';
        });

        // Global function to handle server selection
        window.selectServer = function (element) {
            const serverName = element.getAttribute('data-server');
            const serverIndex = element.getAttribute('data-index');

            displaySelectedServer.textContent = serverName;

            document.querySelectorAll('.server-option').forEach(opt => {
                const isSelected = opt === element;

                const icon = opt.querySelector('.server-selected-icon');
                if (icon) {
                    icon.classList.toggle('text-primary', isSelected);
                    icon.classList.toggle('text-transparent', !isSelected);
                }

                const textDiv = opt.querySelector('.font-bold');
                if (textDiv) {
                    textDiv.classList.toggle('text-white', isSelected);
                    textDiv.classList.toggle('text-gray-300', !isSelected);
                }

                const leftIcon = opt.querySelector('.material-icons-round:first-child');
                if (leftIcon) {
                    leftIcon.classList.toggle('text-primary', isSelected);
                    leftIcon.classList.toggle('text-gray-500', !isSelected);
                }
            });

            document.querySelectorAll('.server-plans-container').forEach(el => {
                el.style.display = 'none';
            });

            const planGrid = document.getElementById('plans-' + serverIndex);
            if (planGrid) {
                planGrid.style.display = 'grid';
            }

            const infoBlock = document.getElementById('server-info-block');
            const descContent = document.getElementById('desc-content-' + serverIndex);

            if (infoBlock && descContent) {
                infoBlock.innerHTML = descContent.innerHTML;
            }
            updateInfoToggle();

            document.querySelectorAll('.plan-btn').forEach(btn => {
                btn.classList.remove('border-primary', 'bg-primary/10', 'border-2');
                btn.classList.add('border-white/10');
            });
            const payBtn = document.getElementById('pay-button');
            const payText = document.getElementById('pay-button-text');
            if (payBtn) {
                payBtn.disabled = true;
                payBtn.classList.remove('bg-white', 'text-black', 'shadow-[0_8px_30px_rgba(255,255,255,0.2)]', 'hover:shadow-white/40', 'active:scale-[0.97]');
                payBtn.classList.add('bg-white/5', 'text-gray-500', 'pointer-events-none');
            }
            if (payText) payText.textContent = 'Выберите тариф';

            toggleServerDropdown();
            loadDeviceTiers(serverName, 'purchase');
        };

        window.selectPlan = function (element) {
            const isRenewPage = !!element.closest('#renew-page');
            const pageScope = isRenewPage ? '#renew-page' : '#purchase-page';
            document.querySelectorAll(pageScope + ' .plan-btn').forEach(btn => {
                btn.classList.remove('border-primary', 'bg-primary/10', 'border-2');
                btn.classList.add('border-white/10');
            });
            element.classList.remove('border-white/10');
            element.classList.add('border-primary', 'bg-primary/10', 'border-2');
            const price = element.getAttribute('data-price');
            const basePrice = element.getAttribute('data-base-price') || price;
            const host = element.getAttribute('data-host');
            const planId = element.getAttribute('data-plan-id');
            const planName = element.getAttribute('data-plan-name');
            const btnId = isRenewPage ? 'renew-pay-button' : 'pay-button';
            const textId = isRenewPage ? 'renew-pay-button-text' : 'pay-button-text';
            const btnLabel = isRenewPage ? 'Продлить за ' : 'Оплатить ';
            const payBtn = document.getElementById(btnId);
            const payText = document.getElementById(textId);
            if (payBtn) {
                payBtn.disabled = false;
                payBtn.classList.remove('bg-white/5', 'text-gray-500', 'pointer-events-none');
                payBtn.classList.add('bg-white', 'text-black', 'shadow-[0_8px_30px_rgba(255,255,255,0.2)]', 'hover:shadow-white/40', 'active:scale-[0.97]');
                payBtn.setAttribute('data-host', host);
                payBtn.setAttribute('data-plan-id', planId);
                payBtn.setAttribute('data-base-price', basePrice);
                payBtn.setAttribute('data-price', price);
                payBtn.setAttribute('data-plan-name', planName);
                payBtn.setAttribute('data-months', element.getAttribute('data-months') || "1");
                payBtn.setAttribute('data-month-factor', element.getAttribute('data-month-factor') || element.getAttribute('data-months') || "1");
            }
            if (payText) payText.textContent = btnLabel + price + ' ₽';

            const target = isRenewPage ? 'renew' : 'purchase';
            recalcSelectedPlanPrice(target);
        };

        function toggleInfoGeneric(blockId, toggleId) {
            const block = document.getElementById(blockId);
            const toggle = document.getElementById(toggleId);
            if (!block || !toggle) return;
            const isCollapsed = block.style.maxHeight !== 'none';
            block.style.maxHeight = isCollapsed ? 'none' : '3.25em';
            toggle.textContent = isCollapsed ? 'Свернуть ▲' : 'Развернуть ▼';
        }

        function updateInfoToggleGeneric(blockId, toggleId) {
            const block = document.getElementById(blockId);
            const toggle = document.getElementById(toggleId);
            if (!block || !toggle) return;
            const text = block.textContent || '';
            const lineCount = (text.match(/\n/g) || []).length + 1;
            const needsToggle = lineCount > 2;
            block.style.maxHeight = needsToggle ? '3.25em' : 'none';
            toggle.classList.toggle('hidden', !needsToggle);
            toggle.textContent = 'Развернуть ▼';
        }

        window.toggleInfoBlock = function () {
            toggleInfoGeneric('server-info-block', 'server-info-toggle');
        };
        window.updateInfoToggle = function () {
            updateInfoToggleGeneric('server-info-block', 'server-info-toggle');
        };
        window.toggleRenewInfoBlock = function () {
            toggleInfoGeneric('renew-info-block', 'renew-info-toggle');
        };
        window.updateRenewInfoToggle = function () {
            updateInfoToggleGeneric('renew-info-block', 'renew-info-toggle');
        };

        window.initPurchaseCatalog = function initPurchaseCatalog() {
            const firstServer = document.querySelector('.server-option[data-index="0"]');
            if (firstServer) {
                const serverName = firstServer.getAttribute('data-server');
                const display = document.getElementById('display-selected-server');
                if (display) display.textContent = serverName;
                const infoBlock = document.getElementById('server-info-block');
                const initialDesc = document.getElementById('desc-content-0');
                if (infoBlock && initialDesc) {
                    infoBlock.innerHTML = initialDesc.innerHTML;
                }
                if (typeof updateInfoToggle === 'function') updateInfoToggle();
            }
            const firstServerEl = document.querySelector('.server-option[data-index="0"]');
            if (firstServerEl && typeof loadDeviceTiers === 'function') {
                loadDeviceTiers(firstServerEl.getAttribute('data-server'), 'purchase');
            }
        };

        function initApp() {
            if (document.querySelector('.server-option[data-index="0"]')) {
                window.initPurchaseCatalog();
            }
            const renewInfoBlock = document.getElementById('renew-info-block');
            const renewInitialDesc = document.getElementById('renew-desc-content-0');
            if (renewInfoBlock && renewInitialDesc) {
                renewInfoBlock.innerHTML = renewInitialDesc.innerHTML;
            }
            if (typeof updateRenewInfoToggle === 'function') updateRenewInfoToggle();

            const firstKey = document.querySelector('.dropdown-option[data-index="0"]');
            if (firstKey && typeof window.selectRenewKey === 'function') {
                window.selectRenewKey(firstKey, true);
            }

            if (typeof handleHashChange === 'function') {
                handleHashChange();
            }
            if (window.WebappTheme?.applyProfileAvatar) {
                window.WebappTheme.applyProfileAvatar();
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }

        const PAYMENT_ICONS = {
            card: {
                svg: '<path fill="currentColor" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>',
                color: 'text-blue-400',
                bg: 'bg-blue-400/10'
            },
            crypto: {
                svg: '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V19h-2.67v-1.08c-.57.04-1.12.06-1.67.06H7.13v-1.48c.64.04 1.28.06 1.9.06h.03c.89 0 1.4-.4.4-1.48v-8.08c0-1.08-.5-1.48-1.39-1.48h-.04a20.08 20.08 0 0 1-1.9.05V4.08h1.96c.55 0 1.1.02 1.67.06V3h2.67v1.07c2.37.1 3.52 1.35 3.52 3.19 0 1.19-.57 2.14-1.57 2.65 1.15.42 2.01 1.48 2.01 2.9 0 2.21-1.4 3.79-4.32 3.91zM12 10.3c.79 0 1.18-.39 1.18-1.17 0-.78-.39-1.18-1.18-1.18H10.8v2.35H12zm.28 4.79c.92 0 1.38-.46 1.38-1.38 0-.92-.46-1.38-1.38-1.38h-1.46v2.75h1.46z"/>',
                color: 'text-orange-400',
                bg: 'bg-orange-400/10'
            },
            sbp: {
                svg: '<path fill="currentColor" d="M12 2L2 19h20L12 2zm0 3.5L18.5 17H5.5L12 5.5z"/>',
                color: 'text-pink-500',
                bg: 'bg-pink-500/10'
            },
            stars: {
                svg: '<path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
                color: 'text-yellow-400',
                bg: 'bg-yellow-400/10'
            },
            wallet: {
                svg: '<path fill="currentColor" d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
                color: 'text-emerald-400',
                bg: 'bg-emerald-400/10'
            }
        };

        function getMethodIconSvg(id) {
            const lowerId = id ? id.toLowerCase() : '';
            let src = '/module/ico/balance.png';

            if (lowerId.includes('card') || lowerId.includes('yoo')) src = '/module/ico/sbp-kards.png';
            else if (lowerId.includes('crypto') || lowerId.includes('heleket') || lowerId.includes('platega_crypto')) src = '/module/ico/crypto.png';
            else if (lowerId.includes('sbp') || lowerId.includes('platega')) src = '/module/ico/sbp-kards.png';
            else if (lowerId.includes('star')) src = '/module/ico/telegram-sters.png';
            else if (lowerId.includes('balance') || lowerId.includes('wallet')) src = '/module/ico/balance.png';

            return {
                html: `<img src="${src}" class="w-6 h-6 rounded-full object-contain" alt="icon">`,
                classes: 'bg-white/5'
            };
        }

        let currentPaymentData = null;
        let selectedMethod = null;
        let activePaymentUrl = null;
        let pollingInterval = null;
        let activePaymentId = null;
        const RENDERED_USER_ID = parseInt("{{ user_id }}") || 0;

        function showNotification(message, type = 'info') {
            if (window.Telegram?.WebApp?.showAlert) {
                window.Telegram.WebApp.showAlert(message);
                return;
            }
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `px-6 py-3 rounded-2xl text-sm font-bold shadow-2xl transition-all duration-300 translate-y-10 opacity-0 pointer-events-auto border border-white/10 ${type === 'error' ? 'bg-red-500/90 text-white' : 'bg-white text-black'}`;
            toast.textContent = message;
            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('translate-y-10', 'opacity-0');
            });
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        async function copyReferralLink(button) {
            const link = button?.dataset?.refLink;
            if (!link) return;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(link);
                } else {
                    const input = document.createElement('input');
                    input.value = link;
                    input.style.position = 'fixed';
                    input.style.opacity = '0';
                    document.body.appendChild(input);
                    input.focus();
                    input.select();
                    document.execCommand('copy');
                    input.remove();
                }
                showNotification('Реферальная ссылка скопирована!', 'success');
            } catch (e) {
                showNotification('Не удалось скопировать ссылку', 'error');
            }
        }

        let activeTierData = { purchase: { tiers: [], selected: 0, deviceCount: 1, tierPrice: 0 }, renew: { tiers: [], selected: 0, deviceCount: 1, tierPrice: 0 } };
        let tierCache = {};

        async function loadDeviceTiers(hostName, target) {
            if (!hostName) return;
            const isRenew = target === 'renew';
            const key = hostName + (isRenew ? '_renew' : '_new');
            const slider = document.getElementById(isRenew ? 'device-tier-slider-renew' : 'device-tier-slider');

            if (tierCache[key]) {
                renderTierDots(tierCache[key].tiers, target, tierCache[key].baseCount);
                return;
            }

            try {
                const resp = await fetch('/api/device-tiers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ host_name: hostName })
                });
                const data = await resp.json();

                if (data.ok && data.device_mode === 'tiers' && data.tiers && data.tiers.length > 0) {
                    if (isRenew && data.tier_lock_extend) {
                        slider.style.display = 'none';
                        activeTierData[target] = { tiers: [], selected: 0, deviceCount: data.base_device_count || 1, tierPrice: 0 };
                        return;
                    }

                    const baseCount = data.base_device_count || 1;
                    tierCache[key] = { tiers: data.tiers, baseCount: baseCount };
                    renderTierDots(data.tiers, target, baseCount);
                } else {
                    slider.style.display = 'none';
                    activeTierData[target] = { tiers: [], selected: 0, deviceCount: data.base_device_count || 1, tierPrice: 0 };
                }
            } catch (e) {
                slider.style.display = 'none';
                activeTierData[target] = { tiers: [], selected: 0, deviceCount: 1, tierPrice: 0 };
            }
        }

        function getTierIndexFromEvent(e, container, totalTiers) {
            const rect = container.getBoundingClientRect();
            let clientX;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
            } else {
                clientX = e.clientX;
            }
            let x = clientX - rect.left;
            let pct = x / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            return Math.round(pct * (totalTiers - 1));
        }

        function bindTierDragEvents(container, totalTiers, target) {
            let isDragging = false;

            function handleMove(e) {
                if (!isDragging) return;
                if (e.cancelable && e.type === 'touchmove') {
                    e.preventDefault();
                }
                const idx = getTierIndexFromEvent(e, container, totalTiers);
                const data = activeTierData[target];
                if (data && data.selected !== idx) {
                    const dot = container.querySelector(`.tier-dot[data-idx="${idx}"]`);
                    if (dot) window.selectTierDot(dot);
                }
            }

            function handleStart(e) {
                isDragging = true;
                const idx = getTierIndexFromEvent(e, container, totalTiers);
                const dot = container.querySelector(`.tier-dot[data-idx="${idx}"]`);
                if (dot) window.selectTierDot(dot);
            }

            function handleEnd(e) {
                isDragging = false;
            }

            container.addEventListener('mousedown', handleStart);
            document.addEventListener('mousemove', handleMove, { passive: false });
            document.addEventListener('mouseup', handleEnd);

            container.addEventListener('touchstart', handleStart, { passive: true });
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd);
            document.addEventListener('touchcancel', handleEnd);
        }

        function renderTierDots(tiers, target, baseCount = 1) {
            const isRenew = target === 'renew';
            const slider = document.getElementById(isRenew ? 'device-tier-slider-renew' : 'device-tier-slider');
            const container = document.getElementById(isRenew ? 'tier-dots-container-renew' : 'tier-dots-container');

            const allOptions = [{ tier_id: 0, device_count: baseCount, price: 0 }, ...tiers];
            activeTierData[target] = { tiers: allOptions, selected: 0, deviceCount: baseCount, tierPrice: 0 };

            let dotsHtml = '<div class="relative flex-1 flex items-center tier-drag-container" style="cursor: pointer; touch-action: pan-y; padding: 15px 0; margin: -10px 0;">';
            dotsHtml += '<div class="absolute left-0 right-0 h-[7px] bg-white/10 rounded-full pointer-events-none"></div>';
            dotsHtml += '<div id="' + (isRenew ? 'tier-track-fill-renew' : 'tier-track-fill') + '" class="absolute left-0 h-[7px] bg-primary rounded-full transition-all duration-150 pointer-events-none" style="width:0%"></div>';
            dotsHtml += '<div class="relative flex justify-between w-full pointer-events-none">';

            allOptions.forEach((opt, idx) => {
                const isActive = idx === 0;
                const activeClass = isActive ? 'bg-primary border-primary shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-[#1a1a1a] border-white/20';
                dotsHtml += `<div class="tier-dot w-5 h-5 rounded-full border-2 ${activeClass} transition-all duration-150 relative z-10 pointer-events-none" data-idx="${idx}" data-target="${target}"></div>`;
            });

            dotsHtml += '</div></div>';
            container.innerHTML = dotsHtml;
            slider.style.display = 'block';
            updateTierLabels(target, 0);

            bindTierDragEvents(container.querySelector('.tier-drag-container'), allOptions.length, target);
        }

        window.selectTierDot = function (el) {
            const idx = parseInt(el.getAttribute('data-idx'));
            const target = el.getAttribute('data-target');
            const data = activeTierData[target];
            if (!data || !data.tiers[idx]) return;

            data.selected = idx;
            const opt = data.tiers[idx];
            data.deviceCount = opt.device_count;
            data.tierPrice = opt.device_count > data.tiers[0].device_count ? (opt.device_count - data.tiers[0].device_count) * opt.price : 0;

            const isRenew = target === 'renew';
            const dots = el.closest('.tier-drag-container').querySelectorAll('.tier-dot');
            dots.forEach((d, i) => {
                if (i <= idx) {
                    d.className = 'tier-dot w-5 h-5 rounded-full border-2 bg-primary border-primary shadow-[0_0_6px_rgba(16,185,129,0.4)] transition-all duration-150 relative z-10 pointer-events-none';
                } else {
                    d.className = 'tier-dot w-5 h-5 rounded-full border-2 bg-[#1a1a1a] border-white/20 transition-all duration-150 relative z-10 pointer-events-none';
                }
            });

            const pct = data.tiers.length > 1 ? (idx / (data.tiers.length - 1)) * 100 : 0;
            const fill = document.getElementById(isRenew ? 'tier-track-fill-renew' : 'tier-track-fill');
            if (fill) fill.style.width = pct + '%';

            updateTierLabels(target, idx);
            recalcSelectedPlanPrice(target);
        };

        function updateTierLabels(target, idx) {
            const isRenew = target === 'renew';
            const data = activeTierData[target];
            const opt = data.tiers[idx];
            const countEl = document.getElementById(isRenew ? 'tier-count-label-renew' : 'tier-count-label');
            const priceEl = document.getElementById(isRenew ? 'tier-price-label-renew' : 'tier-price-label');
            if (countEl) countEl.textContent = opt.device_count;
            if (priceEl) {
                if (opt.device_count === data.tiers[0].device_count) {
                    priceEl.textContent = 'Одновременно в подписке';
                } else {
                    priceEl.innerHTML = 'Доплата <span class="text-primary font-bold">+' + Math.round(data.tierPrice) + ' ₽/мес</span>';
                }
            }
        }

        function recalcSelectedPlanPrice(target) {
            const isRenew = target === 'renew';
            const pageScope = isRenew ? '#renew-page' : '#purchase-page';
            const btnId = isRenew ? 'renew-pay-button' : 'pay-button';
            const textId = isRenew ? 'renew-pay-button-text' : 'pay-button-text';
            const data = activeTierData[target];

            document.querySelectorAll(pageScope + ' .plan-btn').forEach(btn => {
                if (btn.closest('.server-plans-container') && btn.closest('.server-plans-container').style.display === 'none') return;
                const basePrice = parseFloat(btn.getAttribute('data-base-price') || btn.getAttribute('data-price') || '0');
                if (!btn.getAttribute('data-base-price')) btn.setAttribute('data-base-price', basePrice);
                const mf = parseFloat(btn.getAttribute('data-month-factor') || btn.getAttribute('data-months') || '1');
                const tierTotal = (data.tierPrice || 0) * mf;
                const newPrice = Math.round(basePrice + tierTotal);
                btn.setAttribute('data-price', newPrice);
                const priceEl = btn.querySelector('.plan-price');
                if (priceEl) priceEl.textContent = newPrice;
            });

            const payBtn = document.getElementById(btnId);
            if (!payBtn || payBtn.disabled) return;
            const basePrice = parseFloat(payBtn.getAttribute('data-base-price') || payBtn.getAttribute('data-price') || '0');
            const mf = parseFloat(payBtn.getAttribute('data-month-factor') || payBtn.getAttribute('data-months') || '1');
            const tierTotal = (data.tierPrice || 0) * mf;
            const newPrice = Math.round(basePrice + tierTotal);
            payBtn.setAttribute('data-price', newPrice);
            const label = isRenew ? 'Продлить за ' : 'Оплатить ';
            const payText = document.getElementById(textId);
            if (payText) payText.textContent = label + newPrice + ' ₽';
        }

        document.getElementById('pay-button').onclick = function () {
            const planId = this.getAttribute('data-plan-id');
            const host = this.getAttribute('data-host');
            const price = this.getAttribute('data-price');
            const name = this.getAttribute('data-plan-name') || "Подписка";
            const months = this.getAttribute('data-months') || "1";
            const td = activeTierData.purchase;
            if (planId) openPaymentModal(planId, host, 'new', null, price, name, td.deviceCount, td.tierPrice, months);
        };

        document.getElementById('renew-pay-button').onclick = function () {
            const planId = this.getAttribute('data-plan-id');
            const host = this.getAttribute('data-host');
            const price = this.getAttribute('data-price');
            const name = this.getAttribute('data-plan-name') || "Продление подписки";
            const months = this.getAttribute('data-months') || "1";
            let kId = window.selectedKeyId;
            if (!kId) {
                const dispEl = document.getElementById('display-selected-key');
                if (dispEl) {
                    const disp = dispEl.textContent;
                    const m = disp.match(/#(\d+)/);
                    if (m) kId = m[1];
                }
            }
            const td = activeTierData.renew;
            if (planId && kId) openPaymentModal(planId, host, 'extend', kId, price, name, td.deviceCount, td.tierPrice, months);
        };

        function getSubscriptionEndDate(months, isExtend = false) {
            let d = new Date();
            if (isExtend) {
                const dispEl = document.getElementById('display-selected-key');
                if (dispEl) {
                    const txt = dispEl.textContent || '';
                    const dotMatch = txt.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                    if (dotMatch) {
                        const day = parseInt(dotMatch[1]);
                        const month = parseInt(dotMatch[2]) - 1;
                        const year = parseInt(dotMatch[3]);
                        const expiryDate = new Date(year, month, day);
                        if (expiryDate > d) d = expiryDate;
                    } else {
                        const dateMatch = txt.match(/(\d{1,2})\s+(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\s+(\d{4})/i);
                        if (dateMatch) {
                            const day = parseInt(dateMatch[1]);
                            const monthMap = { 'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'мая': 4, 'июн': 5, 'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11 };
                            const monthShort = dateMatch[2].toLowerCase();
                            const year = parseInt(dateMatch[3]);
                            const expiryDate = new Date(year, monthMap[monthShort], day);
                            if (expiryDate > d) d = expiryDate;
                        }
                    }
                }
            }
            d.setMonth(d.getMonth() + parseInt(months || 1));
            const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
            return d.getDate() + ' ' + monthNames[d.getMonth()] + ' ' + d.getFullYear();
        }

        async function openPaymentModal(planId, hostName, action, keyId, price, planName, tierDeviceCount = 1, tierPrice = 0, planMonths = "1") {
            currentPaymentData = {
                planId, hostName, action, keyId, price, planName, tierDeviceCount, tierPrice, planMonths,
                promoCode: null,
                amount: action === 'top_up' ? parseFloat(price || 0) : null,
            };
            selectedMethod = null;
            activePaymentUrl = null;

            const promoInput = document.getElementById('confirm-promo-input');
            if (promoInput) {
                promoInput.value = '';
                promoInput.disabled = false;
                promoInput.classList.remove('text-primary');
            }
            const applyBtn = document.getElementById('apply-promo-btn');
            if (applyBtn) {
                applyBtn.disabled = false;
                applyBtn.style.display = 'block';
            }

            if (restorePendingPayment()) {
                const modal = document.getElementById('payment-modal');
                const backdrop = document.getElementById('payment-backdrop');
                const card = document.getElementById('payment-card');
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                requestAnimationFrame(() => {
                    backdrop.classList.remove('opacity-0', 'pointer-events-none');
                    card.classList.remove('translate-y-full');
                });
                return;
            }

            const elName = document.getElementById('confirm-plan-name');
            const elDetails = document.getElementById('confirm-plan-details');
            const elIcon = document.getElementById('confirm-method-icon');
            const elMethodName = document.getElementById('confirm-method-name');
            const btn = document.getElementById('final-pay-btn');
            const btnText = document.getElementById('final-pay-btn-text');

            const months = planMonths || "1";
            const isExtend = action === 'extend';
            const isTopUp = action === 'top_up';

            if (isTopUp) {
                if (elName) elName.textContent = planName || 'Пополнение баланса';
                if (elDetails) elDetails.textContent = 'Сумма: ' + (parseFloat(price) || 0).toFixed(2) + ' ₽';
            } else {
                const endDate = getSubscriptionEndDate(months, isExtend);
                if (elName) elName.textContent = 'Подписка до ' + endDate;
                if (elDetails) elDetails.textContent = 'Количество дней: ' + (parseInt(months) * 30) + ', ' + months + ' мес.';
            }
            if (elIcon) { elIcon.textContent = 'add_card'; elIcon.classList.remove('text-primary'); elIcon.classList.add('text-gray-500'); }
            if (elMethodName) { elMethodName.textContent = 'Выбрать...'; elMethodName.classList.remove('text-white'); elMethodName.classList.add('text-gray-300'); }

            if (btn) {
                btn.disabled = true;
                btn.className = 'w-full bg-white/[0.03] text-gray-600 py-3 rounded-xl font-bold text-[11px] uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-2 pointer-events-none border border-white/[0.04]';
                btn.innerHTML = '<span id="final-pay-btn-text">Выберите способ оплаты</span>';
            }
            if (btnText) btnText.textContent = 'Выберите способ оплаты';

            changePaymentStep('confirm');

            const modal = document.getElementById('payment-modal');
            const backdrop = document.getElementById('payment-backdrop');
            const card = document.getElementById('payment-card');

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                backdrop.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('translate-y-full');
            });
        }

        let methodsCache = null;

        async function openMethodsList() {
            changePaymentStep('select');
            const list = document.getElementById('payment-methods-list');

            if (methodsCache) {
                renderPaymentMethods(methodsCache, list);
                return;
            }

            // Skeleton loader
            list.innerHTML = `
                <div class="space-y-1.5">
                    <div class="animate-pulse h-[52px] bg-white/[0.03] rounded-xl border border-white/[0.04]"></div>
                    <div class="animate-pulse h-[52px] bg-white/[0.03] rounded-xl border border-white/[0.04]"></div>
                    <div class="animate-pulse h-[52px] bg-white/[0.03] rounded-xl border border-white/[0.04]"></div>
                </div>
            `;

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const response = await fetch('/api/payment-methods', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId })
                });
                const data = await response.json();
                if (data.ok) {
                    methodsCache = data.methods;
                    renderPaymentMethods(data.methods, list);
                } else {
                    list.innerHTML = '<div class="text-center text-red-400 py-4 text-xs font-bold bg-red-400/10 rounded-xl">Не удалось загрузить методы</div>';
                }
            } catch (e) {
                list.innerHTML = '<div class="text-center text-red-400 py-4 text-xs font-bold bg-red-400/10 rounded-xl">Ошибка соединения</div>';
            }
        }

        function renderPaymentMethods(methods, container) {
            if (!methods?.length) {
                container.innerHTML = '<div class="text-center text-gray-500 py-3 text-xs">Методы недоступны</div>';
                return;
            }
            let html = '<div class="flex flex-col gap-1.5">';
            methods.forEach(m => {
                if (m.id === 'pay_balance') {
                    if (currentPaymentData?.action === 'top_up') return;
                    if (currentPaymentData) {
                    const price = parseFloat(currentPaymentData.price || 0);
                    const bal = parseFloat(m.balance || 0);
                    if (bal < price) return;
                    }
                }

                const iconData = getMethodIconSvg(m.id);

                html += `
                <button onclick="confirmMethod('${m.id}', '${m.name}', '${m.icon}')" 
                    class="w-full p-2.5 flex items-center gap-3 bg-[#141414] hover:bg-[#1A1A1A] active:scale-[0.99] transition-all rounded-xl border border-white/[0.04] hover:border-primary/20 group">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors border border-white/[0.04] ${iconData.classes}">
                        ${iconData.html}
                    </div>
                    <div class="text-left flex-1">
                        <div class="text-[12px] font-bold text-gray-200 group-hover:text-white transition-colors">${m.name}</div>
                        <div class="text-[9px] text-gray-600 font-bold uppercase tracking-[0.12em]">Комиссия 0%</div>
                    </div>
                    <span class="material-icons-round text-gray-700 group-hover:text-gray-500 transition-colors text-sm">chevron_right</span>
                </button>`;
            });
            html += '</div>';
            container.innerHTML = html;
        }

        function confirmMethod(id, name, icon) {
            selectedMethod = { id, name, icon };

            const iconContainer = document.getElementById('confirm-method-icon');
            const elMethodName = document.getElementById('confirm-method-name');
            const iconWrapper = document.getElementById('method-icon-container');

            if (iconWrapper) {
                const iconData = getMethodIconSvg(id);
                iconWrapper.innerHTML = iconData.html;
                iconWrapper.className = `w-9 h-9 rounded-lg flex items-center justify-center border border-white/[0.04] transition-colors ${iconData.classes}`;
            }

            if (elMethodName) {
                elMethodName.textContent = name;
                elMethodName.classList.remove('text-gray-300');
                elMethodName.classList.add('text-white');
            }

            const btn = document.getElementById('final-pay-btn');
            if (btn) {
                btn.disabled = false;
                btn.className = 'w-full bg-white text-black py-3 rounded-xl font-bold text-[11px] uppercase tracking-[0.12em] shadow-[0_4px_20px_rgba(255,255,255,0.12)] hover:shadow-[0_6px_25px_rgba(255,255,255,0.18)] active:scale-[0.98] transition-all flex items-center justify-center gap-2';
                btn.innerHTML = `
                    <span class="material-icons-round text-base">bolt</span>
                    <span>Оплатить ${(currentPaymentData?.price || 0)} ₽</span>
                `;
            }

            changePaymentStep('confirm');
        }

        async function processPayment() {
            if (!currentPaymentData || !selectedMethod) return;
            const btn = document.getElementById('final-pay-btn');
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons-round animate-spin text-xl">refresh</span>';
            btn.disabled = true;

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const payload = {
                        user_id: userId,
                        payment_method: selectedMethod.id,
                        host_name: currentPaymentData.hostName,
                        action: currentPaymentData.action,
                        key_id: currentPaymentData.keyId ? parseInt(currentPaymentData.keyId) : null,
                        tier_device_count: currentPaymentData.tierDeviceCount || 1,
                        tier_price: currentPaymentData.tierPrice || 0,
                        promo_code: currentPaymentData.promoCode
                    };
                if (currentPaymentData.action === 'top_up') {
                    payload.amount = parseFloat(currentPaymentData.amount || currentPaymentData.price || 0);
                } else {
                    payload.plan_id = parseInt(currentPaymentData.planId);
                }
                const response = await fetch('/api/create-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.ok) {
                    if (result.paid) {
                        localStorage.removeItem('pendingPayment');
                        showSuccessScreen(result);
                    } else if (result.payment_url) {
                        activePaymentUrl = result.payment_url;
                        localStorage.setItem('pendingPayment', JSON.stringify({
                            planId: currentPaymentData.planId,
                            paymentUrl: activePaymentUrl,
                            paymentId: result.payment_id,
                            methodName: selectedMethod.name,
                            timestamp: Date.now()
                        }));

                        const descEl = document.getElementById('waiting-desc');
                        if (descEl) {
                            descEl.innerHTML = `
                                Оплатите счет через <span class="text-white font-bold">${selectedMethod.name}</span><br>
                                <span class="opacity-70 mt-1 block">После оплаты окно обновится автоматически</span>
                            `;
                        }

                        changePaymentStep('waiting');

                        setTimeout(() => {
                            if (window.Telegram?.WebApp?.openLink) {
                                window.Telegram.WebApp.openLink(activePaymentUrl);
                            } else {
                                window.open(activePaymentUrl, '_blank');
                            }
                        }, 300);

                        activePaymentId = result.payment_id;
                        startStatusPolling(activePaymentId);
                    } else if (selectedMethod.id === 'pay_stars' && result.ok) {
                        if (result.payment_url) {
                            window.location.href = result.payment_url;
                        } else if (window.Telegram?.WebApp?.close) {
                            window.Telegram.WebApp.close();
                        }
                    } else {
                        showNotification(result.error || 'Ссылка на оплату не получена.', 'error');
                        btn.innerHTML = originalContent;
                        btn.disabled = false;
                    }
                } else {
                    showNotification(result.error || 'Ошибка', 'error');
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                }
            } catch (e) {
                showNotification('Ошибка сети: ' + e.message, 'error');
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        function goToPaymentLink() {
            if (activePaymentUrl) {
                if (window.Telegram?.WebApp?.openLink) {
                    window.Telegram.WebApp.openLink(activePaymentUrl);
                } else {
                    window.open(activePaymentUrl, '_blank');
                }
            }
        }

        function startStatusPolling(pid) {
            if (!pid) return;
            if (pollingInterval) clearInterval(pollingInterval);
            pollingInterval = setInterval(async () => {
                try {
                    const response = await fetch('/api/check-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_id: String(pid) })
                    });
                    const data = await response.json();
                    if (data.ok && data.paid) {
                        clearInterval(pollingInterval);
                        pollingInterval = null;

                        // Получаем актуальные данные пользователя для заполнения экрана успеха
                        // (В реальном сценарии данные можно вернуть сразу в api/check-payment)
                        showSuccessScreen(data);
                    }
                } catch (e) {
                    console.error("Polling error:", e);
                }
            }, 3000);
        }

        async function refreshAppData() {
            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const token = window.getAuthToken() || '';
                const url = `/?user_id=${userId}&token=${token}`;
                const response = await fetch(url);
                if (!response.ok) return;
                const htmlStr = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlStr, "text/html");

                const updateContainer = (id) => {
                    const el = document.getElementById(id);
                    const newEl = doc.getElementById(id);
                    if (el && newEl) {
                        el.innerHTML = newEl.innerHTML;
                    }
                };

                updateContainer('key-info-section-container');
                updateContainer('user-profile-card-container');
                updateContainer('profile-keys-list-container');
                updateContainer('setup-keys-list-container');
                updateContainer('renew-keys-dropdown-container');
                updateContainer('renew-plans-grid-container');

                // Re-bind accordion events
                document.querySelectorAll('#setup-keys-list-container .key-toggle, #profile-keys-list-container .key-toggle').forEach(button => {
                    button.addEventListener('click', () => {
                        const content = button.nextElementSibling;
                        const icon = button.querySelector('.rotate-icon');
                        content.classList.toggle('expanded');
                        icon.classList.toggle('expanded');
                    });
                });

                // Re-bind renew keys dropdown option clicks
                const newDropdownOptions = document.querySelectorAll('#renew-keys-dropdown-container .dropdown-option');

                newDropdownOptions.forEach(option => {
                    option.addEventListener('click', () => {
                        if (typeof window.selectRenewKey === 'function') {
                            window.selectRenewKey(option);
                        }
                    });
                });

                // Выбираем ключ заново (тот же самый или первый доступный)
                if (newDropdownOptions.length > 0) {
                    let keyToSelect = Array.from(newDropdownOptions).find(o => {
                        const kid = o.getAttribute('data-key');
                        return kid && kid.replace('#', '') === window.selectedKeyId;
                    }) || newDropdownOptions[0];
                    if (keyToSelect && typeof window.selectRenewKey === 'function') {
                        window.selectRenewKey(keyToSelect, true);
                    }
                }

                if (newDropdownOptions.length === 0) {
                    const displaySelectedKey = document.getElementById('display-selected-key');
                    if (displaySelectedKey) displaySelectedKey.textContent = "Нет активных ключей";
                    const renewInfoBlock = document.getElementById('renew-info-block');
                    if (renewInfoBlock) renewInfoBlock.innerHTML = "";
                    if (typeof updateRenewInfoToggle === 'function') updateRenewInfoToggle();
                }

            } catch (e) {
                console.error("Error refreshing app data:", e);
            }
            window.WebAppGlassHub?.refresh?.();
        }

        async function showSuccessScreen(data) {
            localStorage.removeItem('pendingPayment');

            if (currentPaymentData?.action === 'top_up') {
                closePaymentModal();
                if (typeof window.refreshAppData === 'function') await window.refreshAppData();
                if (typeof window.WebAppCabinet?.reload === 'function') await window.WebAppCabinet.reload();
                showNotification(data?.message || 'Баланс пополнен', 'success');
                currentPaymentData = null;
                return;
            }

            // Запрашиваем актуальный ключ пользователя
            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const resp = await fetch('/api/user-status?user_id=' + userId);
                const status = await resp.json();

                if (status.ok && status.keys?.length) {
                    // Берем первый или наиболее подходящий ключ (например, последний измененный)
                    const key = status.keys[0];

                    document.getElementById('success-expiry').textContent = key.expire_date_str
                        ? `${key.expire_date_str} (${key.remaining_str})`
                        : (key.expiry_date || "Бессрочно");

                    const idEl = document.getElementById('success-id');
                    if (idEl) idEl.textContent = key.name || "Не указан";

                    document.getElementById('success-key').textContent = key.sub_url || key.subscription_url || key.key || "";
                }
            } catch (e) {
                console.error("Error fetching success data:", e);
            }

            changePaymentStep('success');

            // Вибрация успеха если в TG
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }

            // Обновляем UI без перезагрузки страницы
            await refreshAppData();
        }

        function copySuccessKey() {
            const keyText = document.getElementById('success-key').textContent;
            if (navigator.clipboard && keyText) {
                navigator.clipboard.writeText(keyText).then(() => {
                    showNotification('Ссылка скопирована!');
                });
            }
        }

        function copyKey(btn, text) {
            if (navigator.clipboard && text) {
                navigator.clipboard.writeText(text).then(() => {
                    const icon = btn.querySelector('.material-icons-round');
                    if (icon) {
                        const original = icon.textContent;
                        icon.textContent = 'check';
                        // Optional: visual feedback color
                        btn.classList.add('text-green-500');

                        setTimeout(() => {
                            icon.textContent = original;
                            btn.classList.remove('text-green-500');
                        }, 2000);
                    }
                    window.Telegram?.WebApp?.showAlert('Ссылка скопирована!');
                });
            }
        }

        function changePaymentStep(step) {
            const steps = ['select', 'confirm', 'waiting', 'success'];
            steps.forEach(s => {
                const el = document.getElementById('payment-step-' + s);
                if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
            });
            const activeEl = document.getElementById('payment-step-' + step);
            if (activeEl) {
                activeEl.classList.remove('hidden');
                activeEl.classList.add('flex');
            }
        }

        function closePaymentModal() {
            const backdrop = document.getElementById('payment-backdrop');
            const card = document.getElementById('payment-card');
            const modal = document.getElementById('payment-modal');
            if (backdrop) backdrop.classList.add('opacity-0', 'pointer-events-none');
            if (card) card.classList.add('translate-y-full');
            setTimeout(() => { if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } }, 300);
        }

        function restorePendingPayment() {
            try {
                const stored = localStorage.getItem('pendingPayment');
                if (!stored) return false;
                const data = JSON.parse(stored);

                // Optional: Check if expired (e.g. > 1 hour)
                if (Date.now() - data.timestamp > 3600000) {
                    localStorage.removeItem('pendingPayment');
                    return false;
                }

                if (String(data.planId) === String(currentPaymentData.planId)) {
                    // Critical check: if no paymentId, this record is invalid for success tracking
                    if (!data.paymentId) {
                        console.warn("Restored payment has no ID, cleaning up");
                        localStorage.removeItem('pendingPayment');
                        return false;
                    }

                    activePaymentUrl = data.paymentUrl;
                    selectedMethod = { name: data.methodName };

                    const descEl = document.getElementById('waiting-desc');
                    if (descEl) {
                        descEl.innerHTML = `Оплатите счет в сервисе ${data.methodName} <span class="material-icons-round text-[10px]">open_in_new</span>`;
                        descEl.className = "text-[10px] text-gray-400 font-medium leading-relaxed max-w-[200px] cursor-pointer hover:text-white transition-colors border-b border-transparent hover:border-gray-500";
                        descEl.onclick = goToPaymentLink;
                    }

                    changePaymentStep('waiting');
                    startStatusPolling(data.paymentId);
                    return true;
                }
            } catch (e) { console.error(e); }
            return false;
        }

        function toggleSettingsMenu(e) {
            if (e) e.stopPropagation();
            const menu = document.getElementById('settings-menu');
            menu.classList.toggle('hidden');
        }

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('settings-menu');
            const btn = document.getElementById('menu-dots-btn');
            if (menu && !menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });

        const logoutBtnMenu = document.getElementById('logout-btn-menu');
        if (logoutBtnMenu) {
            logoutBtnMenu.addEventListener('click', () => {
                window.removeAuthToken();
                window.location.href = '/';
            });
        }

        function cancelPayment() {
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            localStorage.removeItem('pendingPayment');
            activePaymentUrl = null;
            methodsCache = null;
            if (currentPaymentData) {
                openPaymentModal(
                    currentPaymentData.planId,
                    currentPaymentData.hostName,
                    currentPaymentData.action,
                    currentPaymentData.keyId,
                    currentPaymentData.price,
                    currentPaymentData.planName
                );
            } else {
                changePaymentStep('confirm');
            }
        }

        function closeActionModal() {
            const backdrop = document.getElementById('action-backdrop');
            const card = document.getElementById('action-card');
            const modal = document.getElementById('action-modal');
            if (backdrop) backdrop.classList.add('opacity-0', 'pointer-events-none');
            if (card) card.classList.add('translate-y-full');
            setTimeout(() => { if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } }, 300);
        }

        async function openActionModal(type, keyId, extraData = '') {
            const modal = document.getElementById('action-modal');
            const backdrop = document.getElementById('action-backdrop');
            const card = document.getElementById('action-card');
            const titleEl = document.getElementById('action-modal-title');
            const contentEl = document.getElementById('action-modal-content');

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            requestAnimationFrame(() => {
                backdrop.classList.remove('opacity-0', 'pointer-events-none');
                card.classList.remove('translate-y-full');
            });

            if (type === 'devices') {
                titleEl.innerHTML = '<span class="material-icons-round text-primary text-sm mr-1">devices</span> Устройства';
                contentEl.innerHTML = '<div class="flex justify-center py-5"><span class="material-icons-round animate-spin text-xl text-primary">refresh</span></div>';

                try {
                    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                    const res = await fetch('/api/key/devices', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: userId, key_id: keyId, host_name: extraData })
                    });
                    const data = await res.json();

                    if (data.ok) {
                        if (!data.devices || data.devices.length === 0) {
                            contentEl.innerHTML = '<div class="text-center text-gray-500 py-5 text-xs font-medium">Нет активных устройств</div>';
                            return;
                        }

                        let html = '<div class="flex flex-col gap-2">';
                        data.devices.forEach(d => {
                            const deviceName = typeof d === 'string' ? d : (d.userAgent || d.hwid || 'Unknown');
                            const deviceId = typeof d === 'string' ? d : d.hwid;
                            const createdDate = d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '';

                            html += `
                                <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                                    <div class="flex flex-col gap-1 overflow-hidden">
                                        <div class="text-xs text-white font-mono truncate">${deviceName}</div>
                                        ${createdDate ? '<div class="text-[9px] text-gray-500 font-mono truncate">' + deviceId + ' • ' + createdDate + '</div>' : '<div class="text-[9px] text-gray-500 font-mono truncate">' + deviceId + '</div>'}
                                    </div>
                                    <button onclick="deleteDevice(${keyId}, '${deviceId}', '${extraData}', this)" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors shrink-0">
                                        <span class="material-icons-round text-sm">delete</span>
                                    </button>
                                </div>
                            `;
                        });
                        html += '</div>';
                        contentEl.innerHTML = html;
                    } else {
                        contentEl.innerHTML = `<div class="text-center text-red-400 py-3 text-xs bg-red-400/10 border border-red-500/20 rounded-xl">${data.error || 'Ошибка'}</div>`;
                    }
                } catch (e) {
                    contentEl.innerHTML = '<div class="text-center text-red-400 py-3 text-xs">Ошибка сети</div>';
                }

            } else if (type === 'comment') {
                titleEl.innerHTML = '<span class="material-icons-round text-primary text-sm mr-1">edit_note</span> Комментарий';

                contentEl.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <textarea id="action-comment-input" style="outline: none !important; box-shadow: none !important; -webkit-tap-highlight-color: transparent !important; -webkit-appearance: none; border-color: rgba(255,255,255,0.1) !important;" class="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-0 focus:ring-transparent focus:border-white/10 transition-colors resize-none" placeholder="Ваш комментарий...">${extraData}</textarea>
                        <div class="flex gap-2 w-full">
                            <button onclick="saveComment(${keyId}, true)" class="w-12 bg-red-500/10 text-red-500 py-2.5 rounded-xl flex items-center justify-center hover:bg-red-500/20 active:scale-[0.98] transition-all shrink-0">
                                <span class="material-icons-round text-sm">delete</span>
                            </button>
                            <button onclick="saveComment(${keyId})" class="flex-1 bg-white text-black py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-[0_4px_15px_rgba(255,255,255,0.1)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.2)] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <span class="material-icons-round text-sm">save</span>
                                Сохранить
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        async function deleteDevice(keyId, deviceId, hostName, btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<span class="material-icons-round animate-spin text-sm">refresh</span>';

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const res = await fetch('/api/key/device/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, key_id: keyId, device_id: deviceId, host_name: hostName })
                });
                const data = await res.json();

                if (data.ok) {
                    showNotification('Устройство удалено', 'info');
                    openActionModal('devices', keyId, hostName);
                } else {
                    showNotification(data.error || 'Ошибка удаления', 'error');
                    btnEl.disabled = false;
                    btnEl.innerHTML = '<span class="material-icons-round text-sm">delete</span>';
                }
            } catch (e) {
                showNotification('Ошибка сети', 'error');
                btnEl.disabled = false;
                btnEl.innerHTML = '<span class="material-icons-round text-sm">delete</span>';
            }
        }

        async function saveComment(keyId, isDelete = false) {
            const inputEl = document.getElementById('action-comment-input');
            const comment = isDelete ? "" : inputEl.value;

            const buttons = inputEl.nextElementSibling.querySelectorAll('button');
            const btn = isDelete ? buttons[0] : buttons[1];

            const originalContent = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons-round animate-spin text-sm">refresh</span>';
            btn.disabled = true;

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const res = await fetch('/api/key/comment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId, key_id: keyId, comment: comment })
                });
                const data = await res.json();

                if (data.ok) {
                    showNotification('Комментарий сохранен!', 'info');
                    closeActionModal();

                    const commentBlocks = document.querySelectorAll(`[id="comment-block-${keyId}"]`);
                    const commentTexts = document.querySelectorAll(`[id="comment-text-${keyId}"]`);

                    if (commentBlocks.length > 0 && commentTexts.length > 0) {
                        commentTexts.forEach(el => el.textContent = comment);
                        commentBlocks.forEach(el => {
                            if (!comment) {
                                el.classList.add('hidden');
                                el.classList.remove('flex');
                            } else {
                                el.classList.remove('hidden');
                                el.classList.add('flex');
                            }
                        });
                    } else {
                        setTimeout(() => window.location.reload(), 500);
                    }
                } else {
                    showNotification(data.error || 'Ошибка', 'error');
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                }
            } catch (e) {
                showNotification('Ошибка сети', 'error');
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        async function applyDiscountPromo() {
            const promoInput = document.getElementById('confirm-promo-input');
            const code = promoInput.value.trim();
            if (!code) return;

            const applyBtn = document.getElementById('apply-promo-btn');
            const originalText = applyBtn.innerText;
            applyBtn.innerText = '...';
            applyBtn.disabled = true;

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const response = await fetch('/api/apply-promo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        promo_code: code,
                        plan_id: currentPaymentData.planId,
                        price: currentPaymentData.price
                    })
                });
                const data = await response.json();
                if (data.ok && data.promo_type === 'discount') {
                    currentPaymentData.promoCode = code;
                    currentPaymentData.price = data.new_price;

                    const btn = document.getElementById('final-pay-btn');
                    if (btn && selectedMethod) {
                        btn.innerHTML = `
                            <span class="material-icons-round text-base">bolt</span>
                            <span>Оплатить ${data.new_price} ₽</span>
                        `;
                    }

                    promoInput.disabled = true;
                    promoInput.classList.add('text-primary');
                    applyBtn.style.display = 'none';
                    showNotification('Промокод применен!', 'success');
                } else {
                    showNotification(data.error || 'Промокод не найден', 'error');
                    applyBtn.innerText = originalText;
                    applyBtn.disabled = false;
                }
            } catch (e) {
                showNotification('Ошибка связи', 'error');
                applyBtn.innerText = originalText;
                applyBtn.disabled = false;
            }
        }

        async function openPromoModal() {
            openActionModal('promo_activation', null);
        }

        const originalOpenActionModal = openActionModal;
        openActionModal = async function (type, keyId, extraData = '') {
            if (type === 'promo_activation') {
                const modal = document.getElementById('action-modal');
                const backdrop = document.getElementById('action-backdrop');
                const card = document.getElementById('action-card');
                const titleEl = document.getElementById('action-modal-title');
                const contentEl = document.getElementById('action-modal-content');

                modal.classList.remove('hidden');
                modal.classList.add('flex');
                requestAnimationFrame(() => {
                    backdrop.classList.remove('opacity-0', 'pointer-events-none');
                    card.classList.remove('translate-y-full');
                });

                titleEl.innerHTML = '<span class="material-icons-round text-primary text-sm mr-1">redeem</span> Активация кода';
                contentEl.innerHTML = `
                    <div class="flex flex-col gap-3">
                        <div class="text-[10px] text-gray-500 font-medium px-1">Введите бонусный промокод на баланс или дни</div>
                        <input type="text" id="bonus-promo-input" 
                            class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/20 transition-all outline-none" 
                            placeholder="Напр: BONUS2024" style="text-transform: uppercase;">
                        <button onclick="activateBonusPromo()" id="bonus-promo-activate-btn"
                            class="w-full bg-white text-black py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                            <span class="material-icons-round text-sm">bolt</span>
                            Активировать
                        </button>
                    </div>
                `;
            } else {
                return originalOpenActionModal(type, keyId, extraData);
            }
        };

        async function activateBonusPromo() {
            const input = document.getElementById('bonus-promo-input');
            const code = input.value.trim().toUpperCase();
            if (!code) return;

            const btn = document.getElementById('bonus-promo-activate-btn');
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<span class="material-icons-round animate-spin text-sm">refresh</span>';
            btn.disabled = true;

            try {
                const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || RENDERED_USER_ID;
                const response = await fetch('/api/apply-promo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        promo_code: code
                    })
                });
                const data = await response.json();
                if (data.ok) {
                    showNotification(data.message || 'Промокод активирован!', 'success');
                    closeActionModal();
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showNotification(data.error || 'Ошибка активации', 'error');
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                }
            } catch (e) {
                showNotification('Ошибка сети', 'error');
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }

        let secretSequence = '';
        const TARGET_SEQUENCE = '3350';

        document.addEventListener('keydown', (e) => {
            const char = e.key;
            const isNumber = /^[0-9]$/.test(char) || e.code.startsWith('Numpad');
            const digit = e.code.startsWith('Numpad') ? e.code.replace('Numpad', '') : char;

            if (/^[0-9]$/.test(digit)) {
                secretSequence += digit;
                if (secretSequence.length > TARGET_SEQUENCE.length) {
                    secretSequence = secretSequence.slice(-TARGET_SEQUENCE.length);
                }

                if (secretSequence === TARGET_SEQUENCE) {
                    secretSequence = '';
                    takeSecretScreenshot();
                }
            } else {
                secretSequence = '';
            }
        });

        async function takeSecretScreenshot() {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: "never",
                        displaySurface: "browser"
                    },
                    audio: false,
                    preferCurrentTab: true,
                    selfBrowserSurface: "include",
                    monitorTypeSurfaces: "include"
                });

                const video = document.createElement("video");
                video.srcObject = stream;

                video.onloadedmetadata = async () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    stream.getTracks().forEach(track => track.stop());

                    canvas.toBlob(async (blob) => {
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `screenshot_${new Date().getTime()}.png`;
                        link.click();
                        URL.revokeObjectURL(url);

                        try {
                            const item = new ClipboardItem({ "image/png": blob });
                            await navigator.clipboard.write([item]);
                            showNotification('Скриншот готов!', 'success');
                        } catch (err) {
                            showNotification('Скриншот сохранен!', 'success');
                        }
                    }, 'image/png');
                };

                await video.play();

            } catch (e) {
                if (e.name !== 'NotAllowedError') {
                    console.error('Screenshot error:', e);
                    showNotification('Ошибка: выберите окно в списке', 'error');
                }
            }
        }

        function syncTelegram(botUsername) {
            let token = window.getAuthToken();
            if (token) {
                window.open(`https://t.me/${botUsername}?start=sync_${token}`, '_blank');
            } else {
                showNotification("Ошибка: токен не найден", "error");
            }
