(function () {
    'use strict';

    function updateClock() {
        const el = document.getElementById('setup-macos-clock');
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

    updateClock();
    setInterval(updateClock, 30000);
})();
