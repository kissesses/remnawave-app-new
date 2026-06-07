/**
 * Bot settings — notifications tab: t.me link → Chat/Topic ID, test sends.
 */
(function () {
    'use strict';

    let parsed = null;
    let pendingTopicInput = null;

    function toast(kind, msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(kind, msg);
        }
    }

    function parseTelegramLink(raw) {
        const s = String(raw || '').trim();
        if (!s) return null;

        const linkMatch = s.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/c\/(\d+)(?:\/(\d+))?(?:\/(\d+))?(?:[/?#]|$)/i);
        if (linkMatch) {
            const chatId = `-100${linkMatch[1]}`;
            const topicId = linkMatch[2] ? String(linkMatch[2]) : null;
            return {
                chatId,
                topicId,
                innerId: linkMatch[1],
                source: 'link',
            };
        }

        if (/^-100\d+$/.test(s)) {
            return { chatId: s, topicId: null, innerId: s.slice(4), source: 'chat_id' };
        }

        if (/^\d{6,}$/.test(s)) {
            return { chatId: `-100${s}`, topicId: null, innerId: s, source: 'inner_id' };
        }

        return null;
    }

    function renderParsed(data) {
        const result = document.getElementById('bot-notify-link-result');
        const chatEl = document.getElementById('bot-notify-parsed-chat');
        const topicWrap = document.getElementById('bot-notify-parsed-topic-wrap');
        const topicEl = document.getElementById('bot-notify-parsed-topic');
        const note = document.getElementById('bot-notify-link-note');
        if (!result || !chatEl) return;

        parsed = data;
        if (!data) {
            result.hidden = true;
            return;
        }

        chatEl.textContent = data.chatId;
        if (data.topicId && topicWrap && topicEl) {
            if (data.topicId === '1') {
                topicEl.textContent = '1 (General — оставьте поле пустым)';
            } else {
                topicEl.textContent = data.topicId;
            }
            topicWrap.hidden = false;
        } else if (topicWrap) {
            topicWrap.hidden = true;
        }

        if (note) {
            const parts = [];
            if (data.source === 'link' && data.innerId) {
                parts.push(`Chat: t.me/c/${data.innerId} → -100${data.innerId}.`);
            }
            if (data.topicId === '1') {
                parts.push('Topic ID 1 = General: в Bot API поле Topic ID нужно оставить пустым.');
            } else if (data.topicId) {
                parts.push('Topic ID берите из ссылки, скопированной внутри нужного топика (не из General).');
            }
            note.textContent = parts.join(' ');
        }

        result.hidden = false;

        if (pendingTopicInput && data.topicId) {
            fillTopicId(pendingTopicInput);
        }
    }

    function fillChatId() {
        if (!parsed?.chatId) return;
        const input = document.getElementById('notifications_chat_id');
        if (!input) return;
        input.value = parsed.chatId;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        toast('success', `Chat ID ${parsed.chatId} подставлен`);
    }

    function fillTopicId(input) {
        if (!parsed?.topicId || !input) return;
        if (parsed.topicId === '1') {
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            toast('success', 'General: Topic ID очищен (1 нельзя передавать в Bot API)');
            pendingTopicInput = null;
            return;
        }
        input.value = parsed.topicId;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        toast('success', `Topic ID ${parsed.topicId} подставлен`);
        pendingTopicInput = null;
    }

    function copyValue(kind) {
        const text = kind === 'topic' ? parsed?.topicId : parsed?.chatId;
        if (!text) return;
        navigator.clipboard?.writeText(String(text)).then(() => {
            toast('success', 'Скопировано');
        }).catch(() => {
            toast('danger', 'Не удалось скопировать');
        });
    }

    function runParse(fromInput) {
        const input = document.getElementById('bot-notify-link-input');
        const raw = fromInput ?? input?.value ?? '';
        const data = parseTelegramLink(raw);
        if (!data) {
            renderParsed(null);
            toast('danger', 'Не удалось разобрать ссылку. Ожидается t.me/c/ID или t.me/c/ID/TOPIC');
            return null;
        }
        renderParsed(data);
        return data;
    }

    function initLinkTool() {
        const tool = document.getElementById('bot-notify-link-tool');
        if (!tool) return;

        const linkInput = document.getElementById('bot-notify-link-input');
        const chatInput = document.getElementById('notifications_chat_id');

        document.getElementById('bot-notify-link-parse')?.addEventListener('click', () => runParse());

        linkInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runParse();
            }
        });

        linkInput?.addEventListener('paste', (e) => {
            const text = e.clipboardData?.getData('text') || '';
            setTimeout(() => {
                if (parseTelegramLink(text)) runParse(text);
            }, 0);
        });

        chatInput?.addEventListener('paste', (e) => {
            const text = e.clipboardData?.getData('text') || '';
            const data = parseTelegramLink(text);
            if (!data) return;
            e.preventDefault();
            chatInput.value = data.chatId;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (linkInput) linkInput.value = text.trim();
            renderParsed(data);
            toast('success', `Chat ID ${data.chatId} из ссылки`);
        });

        tool.querySelectorAll('[data-notify-fill="chat"]').forEach((btn) => {
            btn.addEventListener('click', fillChatId);
        });

        tool.querySelectorAll('[data-notify-copy]').forEach((btn) => {
            btn.addEventListener('click', () => copyValue(btn.getAttribute('data-notify-copy')));
        });

        tool.querySelector('[data-notify-fill="topic-select"]')?.addEventListener('click', () => {
            if (!parsed?.topicId) return;
            pendingTopicInput = null;
            toast('success', 'Нажмите 🔗 у нужной категории ниже, чтобы подставить Topic ID');
        });

        document.querySelectorAll('[data-notify-link-topic]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.bot-notify-topic-row');
                const topicInput = row?.querySelector('input[type="text"]');
                if (!topicInput) return;

                const linkInputVal = linkInput?.value?.trim();
                if (linkInputVal) {
                    const data = runParse(linkInputVal);
                    if (data?.topicId) {
                        fillTopicId(topicInput);
                        return;
                    }
                }

                if (parsed?.topicId) {
                    fillTopicId(topicInput);
                    return;
                }

                pendingTopicInput = topicInput;
                linkInput?.focus();
                toast('success', 'Вставьте ссылку на топик (t.me/c/…/TOPIC) и нажмите «Разобрать»');
            });
        });
    }

    function initNotifyTests() {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const testUrl = document.getElementById('bot-notify-panel')?.dataset?.testUrl;
        if (!testUrl) return;

        document.querySelectorAll('[data-notify-test]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const category = btn.getAttribute('data-notify-test');
                btn.disabled = true;
                try {
                    const resp = await fetch(testUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': csrf,
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        credentials: 'same-origin',
                        body: JSON.stringify({ category }),
                    });
                    const data = await resp.json();
                    toast(data.ok ? 'success' : 'danger', data.message || data.error || 'Ошибка');
                } catch (_) {
                    toast('danger', 'Ошибка сети');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

    function init() {
        if (!document.getElementById('bot-channels')) return;
        initLinkTool();
        initNotifyTests();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
