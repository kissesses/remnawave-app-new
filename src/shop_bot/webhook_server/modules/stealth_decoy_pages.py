"""Статические decoy-страницы для скрытого входа (inline HTML/CSS, без сети и storage)."""

_PAGE_STYLE = (
    '<style>'
    'body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
    'background:#fff;color:#222;line-height:1.5}'
    'a{color:inherit}'
    '</style>'
)

PAGE_DECOY_PRESETS: dict[str, dict[str, str]] = {
    '502_nginx': {
        'label': '502 Bad Gateway (nginx)',
        'group': 'errors',
        'status': '502',
        'title': '502 Bad Gateway',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem"><h1>502 Bad Gateway</h1></center>'
            + '<hr><center>nginx/1.24.0 (Ubuntu)</center>'
        ),
    },
    '404': {
        'label': '404 Not Found',
        'group': 'errors',
        'status': '404',
        'title': '404 Not Found',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem"><h1>404 Not Found</h1></center>'
            + '<hr><center>nginx/1.24.0 (Ubuntu)</center>'
        ),
    },
    '503': {
        'label': '503 Service Unavailable',
        'group': 'errors',
        'status': '503',
        'title': '503 Service Unavailable',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem"><h1>503 Service Unavailable</h1></center>'
            + '<hr><center>nginx/1.24.0 (Ubuntu)</center>'
        ),
    },
    'maintenance': {
        'label': 'Техработы',
        'group': 'errors',
        'status': '503',
        'title': 'Сайт на обслуживании',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem">'
            + '<h1>Сайт временно недоступен</h1>'
            + '<p style="color:#666">Проводятся технические работы. Попробуйте позже.</p>'
            + '</center>'
        ),
    },
    '401': {
        'label': '401 Unauthorized',
        'group': 'errors',
        'status': '401',
        'title': '401 Unauthorized',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem">'
            + '<h1>401 Unauthorized</h1>'
            + '<p>This server could not verify that you are authorized to access the document requested.</p>'
            + '<hr><center>nginx/1.24.0 (Ubuntu)</center>'
            + '</center>'
        ),
    },
    '500': {
        'label': '500 Internal Server Error',
        'group': 'errors',
        'status': '500',
        'title': '500 Internal Server Error',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem">'
            + '<h1>Internal Server Error</h1>'
            + '<p>The server encountered an internal error and was unable to complete your request.</p>'
            + '<hr><center>Apache/2.4.58 (Ubuntu)</center>'
            + '</center>'
        ),
    },
    '429': {
        'label': '429 Too Many Requests',
        'group': 'errors',
        'status': '429',
        'title': '429 Too Many Requests',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem">'
            + '<h1>429 Too Many Requests</h1>'
            + '<p>Rate limit exceeded. Please try again later.</p>'
            + '</center>'
        ),
    },
    'host_cloudflare_522': {
        'label': 'Cloudflare — таймаут',
        'group': 'hosting',
        'status': '522',
        'title': 'Connection timed out',
        'body': (
            '<style>body{margin:0;background:#f8f8f8;color:#404040;font-family:system-ui,sans-serif}'
            '.w{max-width:580px;margin:4rem auto;padding:0 1.5rem}'
            'h1{font-size:2rem;font-weight:600;margin:0 0 .5rem;color:#333}'
            'p{margin:.35rem 0;font-size:.95rem}'
            '.code{font-size:3rem;font-weight:700;color:#999;margin-bottom:.5rem}'
            '.box{background:#fff;border:1px solid #e0e0e0;border-radius:4px;padding:1rem;margin-top:1.5rem;font-size:.85rem}'
            '</style>'
            + '<div class="w"><div class="code">522</div>'
            + '<h1>Connection timed out</h1>'
            + '<p>The initial connection between Cloudflare\'s network and the origin web server timed out.</p>'
            + '<div class="box">Ray ID: cf-placeholder &bull; Your IP: hidden</div></div>'
        ),
    },
    'host_apache_403': {
        'label': 'Apache — 403 Forbidden',
        'group': 'hosting',
        'status': '403',
        'title': '403 Forbidden',
        'body': (
            _PAGE_STYLE
            + '<center style="padding:3rem 1rem">'
            + '<h1>Forbidden</h1>'
            + '<p>You don\'t have permission to access this resource.</p>'
            + '<hr><address>Apache/2.4.58 (Ubuntu) Server</address>'
            + '</center>'
        ),
    },
    'host_nginx_welcome': {
        'label': 'nginx — Welcome page',
        'group': 'hosting',
        'status': '200',
        'title': 'Welcome to nginx!',
        'body': (
            '<style>body{width:35em;margin:0 auto;font-family:Tahoma,Verdana,Arial,sans-serif;color:#333}'
            'h1{font-size:1.6rem}</style>'
            + '<h1>Welcome to nginx!</h1>'
            + '<p>If you see this page, the nginx web server is successfully installed and working.</p>'
            + '<p><em>Thank you for using nginx.</em></p>'
        ),
    },
    'host_cloudflare_521': {
        'label': 'Cloudflare — web server down',
        'group': 'hosting',
        'status': '521',
        'title': 'Web server is down',
        'body': (
            '<style>body{margin:0;background:#f8f8f8;color:#404040;font-family:system-ui,sans-serif}'
            '.w{max-width:580px;margin:4rem auto;padding:0 1.5rem}'
            'h1{font-size:2rem;font-weight:600;margin:0 0 .5rem;color:#333}'
            'p{margin:.35rem 0;font-size:.95rem}'
            '.code{font-size:3rem;font-weight:700;color:#999;margin-bottom:.5rem}'
            '</style>'
            + '<div class="w"><div class="code">521</div>'
            + '<h1>Web server is down</h1>'
            + '<p>The web server is not returning a connection. As a result, the web page is not displaying.</p></div>'
        ),
    },
    'host_iis_404': {
        'label': 'IIS — 404 Not Found',
        'group': 'hosting',
        'status': '404',
        'title': '404 - File or directory not found.',
        'body': (
            '<style>body{margin:0;background:#fff;color:#000;font-family:Verdana,Arial,sans-serif;font-size:12px}'
            '.c{max-width:640px;margin:3rem auto;padding:0 1rem}'
            'h2{font-size:1.3rem;font-weight:400;margin:0 0 1rem}'
            'hr{border:none;border-top:1px solid #ccc;margin:1.5rem 0}'
            '.f{color:#666;font-size:11px}'
            '</style>'
            + '<div class="c"><h2>Server Error</h2><hr>'
            + '<h2>404 - File or directory not found.</h2>'
            + '<p>The resource you are looking for might have been removed, had its name changed, or is temporarily unavailable.</p>'
            + '<hr><p class="f">Internet Information Services</p></div>'
        ),
    },
    'host_litespeed': {
        'label': 'LiteSpeed — default page',
        'group': 'hosting',
        'status': '200',
        'title': 'LiteSpeed Web Server',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#f5f5f5;color:#333;font-family:Arial,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:1.5rem;margin:0 0 .5rem}'
            'p{margin:0;color:#666;font-size:.9rem}'
            '</style>'
            + '<div><h1>LiteSpeed Web Server</h1>'
            + '<p>Congratulations! Your server is up and running.</p></div>'
        ),
    },
    'cms_wordpress': {
        'label': 'WordPress — Hello world',
        'group': 'cms',
        'status': '200',
        'title': 'My Blog',
        'body': (
            '<style>body{max-width:640px;margin:2rem auto;padding:0 1rem;font-family:Georgia,serif;color:#333}'
            'h1{font-size:1.75rem;font-weight:400}a{color:#21759b;text-decoration:none}'
            '.meta{color:#888;font-size:.85rem;margin-bottom:1.5rem}'
            'hr{border:none;border-top:1px solid #eee;margin:2rem 0}'
            '</style>'
            + '<h1>My Blog</h1><p class="meta">Just another WordPress site</p>'
            + '<h2>Hello world!</h2>'
            + '<p>Welcome to WordPress. This is your first post. Edit or delete it, then start writing!</p>'
            + '<hr><p class="meta">Proudly powered by WordPress</p>'
        ),
    },
    'cms_parked': {
        'label': 'Припаркованный домен',
        'group': 'cms',
        'status': '200',
        'title': 'Domain Parked',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#f4f6f8;color:#444;font-family:system-ui,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:1.4rem;font-weight:600;margin:0 0 .5rem}'
            'p{margin:0;color:#777;font-size:.9rem}'
            '</style>'
            + '<div><h1>This domain is parked</h1>'
            + '<p>The owner has not configured a website yet.</p></div>'
        ),
    },
    'cms_joomla': {
        'label': 'Joomla — Home',
        'group': 'cms',
        'status': '200',
        'title': 'Home',
        'body': (
            '<style>body{max-width:720px;margin:2rem auto;padding:0 1rem;font-family:Arial,sans-serif;color:#333}'
            'h1{font-size:1.5rem;font-weight:400;border-bottom:1px solid #ddd;padding-bottom:.5rem}'
            '.meta{color:#888;font-size:.85rem;margin:.5rem 0 1.5rem}'
            'article{margin-bottom:1.5rem}'
            'h2{font-size:1.1rem;margin:0 0 .35rem}'
            '</style>'
            + '<h1>My Joomla Site</h1><p class="meta">Welcome to our website</p>'
            + '<article><h2>Getting Started</h2>'
            + '<p>This is a sample article. Your Joomla site is ready for content.</p></article>'
            + '<p class="meta">Powered by Joomla!</p>'
        ),
    },
    'cms_directory': {
        'label': 'Index of /',
        'group': 'cms',
        'status': '200',
        'title': 'Index of /',
        'body': (
            '<style>body{margin:1rem;font-family:monospace;font-size:14px;color:#000;background:#fff}'
            'h1{font-size:1.1rem;font-weight:700;margin:0 0 .75rem}'
            'a{color:#00f;text-decoration:underline;display:block;margin:.15rem 0}'
            'hr{border:none;border-top:1px solid #ccc;margin:.75rem 0}'
            '</style>'
            + '<h1>Index of /</h1><hr>'
            + '<a href="#">../</a>'
            + '<a href="#">assets/</a>'
            + '<a href="#">images/</a>'
            + '<a href="#">index.html</a>'
            + '<a href="#">readme.txt</a>'
            + '<hr><address>Apache/2.4.58 (Ubuntu) Server</address>'
        ),
    },
    'cms_registrar': {
        'label': 'Страница регистратора',
        'group': 'cms',
        'status': '200',
        'title': 'Domain Registration',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:linear-gradient(180deg,#eef2f7,#fff);color:#334;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{text-align:center;max-width:420px}'
            'h1{font-size:1.35rem;margin:0 0 .5rem}'
            'p{margin:0;color:#667;font-size:.9rem;line-height:1.45}'
            '</style>'
            + '<div class="c"><h1>Domain successfully registered</h1>'
            + '<p>This domain name has been registered with a domain name registrar. '
            + 'The owner has not published a website yet.</p></div>'
        ),
    },
    'stub_coming_soon': {
        'label': 'Coming soon',
        'group': 'placeholder',
        'status': '200',
        'title': 'Coming Soon',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#111;color:#eee;font-family:system-ui,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:2rem;font-weight:700;letter-spacing:-.03em;margin:0 0 .75rem}'
            'p{margin:0;color:#888;font-size:.95rem}'
            '</style>'
            + '<div><h1>Coming Soon</h1><p>We\'re working on something new. Check back later.</p></div>'
        ),
    },
    'stub_construction': {
        'label': 'Under construction',
        'group': 'placeholder',
        'status': '200',
        'title': 'Under Construction',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#fef9e7;color:#5c4a1a;font-family:system-ui,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:1.5rem;margin:0 0 .5rem}'
            'p{margin:0;font-size:.9rem;opacity:.85}'
            '</style>'
            + '<div><h1>🚧 Under Construction</h1>'
            + '<p>This site is being updated. Please visit again soon.</p></div>'
        ),
    },
    'stub_blank': {
        'label': 'Пустая страница',
        'group': 'placeholder',
        'status': '200',
        'title': 'Document',
        'body': _PAGE_STYLE,
    },
    'stub_ru_soon': {
        'label': 'Скоро откроемся',
        'group': 'placeholder',
        'status': '200',
        'title': 'Скоро откроемся',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:1.75rem;font-weight:700;margin:0 0 .65rem}'
            'p{margin:0;color:#8b949e;font-size:.95rem}'
            '</style>'
            + '<div><h1>Скоро откроемся</h1>'
            + '<p>Мы готовим новый сайт. Загляните чуть позже.</p></div>'
        ),
    },
    'stub_ru_maintenance': {
        'label': 'Техобслуживание (RU)',
        'group': 'placeholder',
        'status': '503',
        'title': 'Техническое обслуживание',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#fafafa;color:#333;font-family:system-ui,sans-serif;text-align:center;padding:1rem}'
            'h1{font-size:1.5rem;margin:0 0 .5rem}'
            'p{margin:0;color:#666;font-size:.9rem;max-width:360px;line-height:1.5}'
            '</style>'
            + '<div><h1>Техническое обслуживание</h1>'
            + '<p>Сайт временно недоступен. Мы обновляем сервис и скоро вернёмся.</p></div>'
        ),
    },
    'stub_intranet': {
        'label': 'Корпоративный портал',
        'group': 'placeholder',
        'status': '200',
        'title': 'Company Intranet',
        'body': (
            '<style>body{margin:0;background:#f0f2f5;color:#1a1a1a;font-family:system-ui,sans-serif}'
            '.top{background:#1e3a5f;color:#fff;padding:.85rem 1.25rem;font-weight:600;font-size:.95rem}'
            '.c{max-width:640px;margin:2rem auto;padding:0 1.25rem}'
            'h1{font-size:1.25rem;margin:0 0 .5rem}'
            'p{margin:0 0 1rem;color:#555;font-size:.9rem;line-height:1.45}'
            '.box{background:#fff;border:1px solid #ddd;border-radius:6px;padding:1rem;font-size:.85rem;color:#666}'
            '</style>'
            + '<div class="top">Company Intranet</div>'
            + '<div class="c"><h1>Welcome</h1>'
            + '<p>Internal resources are available to authorized employees only.</p>'
            + '<div class="box">Please sign in through your organization account to continue.</div></div>'
        ),
    },
    'stub_loading': {
        'label': 'Загрузка…',
        'group': 'placeholder',
        'status': '200',
        'title': 'Loading',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#fff;color:#888;font-family:system-ui,sans-serif}'
            '.d{width:28px;height:28px;border:3px solid #e0e0e0;border-top-color:#888;border-radius:50%;'
            'animation:spin .8s linear infinite;margin:0 auto .75rem}'
            '@keyframes spin{to{transform:rotate(360deg)}}'
            'p{margin:0;font-size:.85rem;text-align:center}'
            '</style>'
            + '<div><div class="d"></div><p>Loading…</p></div>'
        ),
    },
    'waf_ddosguard_check': {
        'label': 'DDoS-Guard — проверка браузера',
        'group': 'protection',
        'status': '200',
        'title': 'Checking your browser',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#f4f6f8;color:#333;font-family:system-ui,-apple-system,sans-serif;padding:1rem}'
            '.c{max-width:420px;width:100%;background:#fff;border:1px solid #dfe3e8;border-radius:8px;'
            'padding:1.75rem 1.5rem;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}'
            '.logo{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#00a651;margin-bottom:1rem}'
            '.shield{width:44px;height:44px;margin:0 auto .85rem;border-radius:50%;background:#e8f8ef;'
            'display:flex;align-items:center;justify-content:center;font-size:1.35rem}'
            'h1{font-size:1rem;font-weight:600;margin:0 0 .45rem}'
            'p{margin:0;font-size:.82rem;color:#666;line-height:1.45}'
            '.spin{width:22px;height:22px;border:2px solid #e0e0e0;border-top-color:#00a651;border-radius:50%;'
            'animation:sp .7s linear infinite;margin:1rem auto 0}'
            '@keyframes sp{to{transform:rotate(360deg)}}'
            '.foot{margin-top:1rem;font-size:.68rem;color:#999}'
            '</style>'
            + '<div class="c"><div class="logo">DDoS Protection</div><div class="shield">🛡</div>'
            + '<h1>Checking your browser before accessing the website</h1>'
            + '<p>This process is automatic. Your browser will redirect shortly.</p>'
            + '<div class="spin"></div>'
            + '<p class="foot">Protected connection</p></div>'
        ),
    },
    'waf_ddosguard_ru': {
        'label': 'DDoS-Guard — проверка (RU)',
        'group': 'protection',
        'status': '200',
        'title': 'Проверка браузера',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#eef1f4;color:#222;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{max-width:440px;width:100%;background:#fff;border-radius:10px;border:1px solid #d8dee4;padding:1.6rem;text-align:center}'
            '.brand{color:#00a651;font-weight:700;font-size:.78rem;letter-spacing:.04em;margin-bottom:.9rem}'
            'h1{font-size:1.05rem;margin:0 0 .5rem;font-weight:600}'
            'p{margin:0;color:#555;font-size:.85rem;line-height:1.5}'
            '.bar{height:3px;background:#e9ecef;border-radius:99px;margin:1.1rem 0 .35rem;overflow:hidden}'
            '.bar i{display:block;height:100%;width:35%;background:#00a651;border-radius:99px;animation:ld 1.4s ease-in-out infinite}'
            '@keyframes ld{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}'
            '.note{margin-top:.75rem;font-size:.72rem;color:#888}'
            '</style>'
            + '<div class="c"><div class="brand">ЗАЩИТА ОТ DDoS</div>'
            + '<h1>Проверка вашего браузера</h1>'
            + '<p>Пожалуйста, подождите. Идёт проверка перед доступом к сайту. Это займёт несколько секунд.</p>'
            + '<div class="bar"><i></i></div>'
            + '<p class="note">Соединение защищено</p></div>'
        ),
    },
    'waf_ip_blocked': {
        'label': 'WAF — IP заблокирован',
        'group': 'protection',
        'status': '403',
        'title': 'Access Denied',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#1a1d21;color:#e8eaed;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{max-width:460px;text-align:center}'
            '.code{font-size:2.5rem;font-weight:700;color:#ff6b6b;margin-bottom:.35rem}'
            'h1{font-size:1.05rem;margin:0 0 .5rem}'
            'p{margin:0;color:#9aa0a6;font-size:.85rem;line-height:1.45}'
            '.box{margin-top:1rem;padding:.75rem 1rem;background:#252930;border-radius:8px;font-size:.75rem;color:#777}'
            '</style>'
            + '<div class="c"><div class="code">403</div>'
            + '<h1>Access denied by security policy</h1>'
            + '<p>Your IP address has been blocked due to suspicious activity or rate limiting.</p>'
            + '<div class="box">Request ID: waf-block-placeholder</div></div>'
        ),
    },
    'waf_under_attack': {
        'label': 'WAF — режим Under Attack',
        'group': 'protection',
        'status': '503',
        'title': 'Under Attack Mode',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#fff8e6;color:#5c4a1a;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{max-width:440px;text-align:center;border:1px solid #f0d78c;background:#fff;border-radius:8px;padding:1.5rem}'
            'h1{font-size:1rem;margin:0 0 .5rem}'
            'p{margin:0;font-size:.85rem;line-height:1.45;color:#6b5a2e}'
            '.spin{width:24px;height:24px;border:2px solid #f0d78c;border-top-color:#c9a227;border-radius:50%;'
            'animation:sp .8s linear infinite;margin:1rem auto 0}'
            '@keyframes sp{to{transform:rotate(360deg)}}'
            '</style>'
            + '<div class="c"><h1>⚠ Under Attack Mode enabled</h1>'
            + '<p>Enhanced security checks are active. Please wait while we verify your request.</p>'
            + '<div class="spin"></div></div>'
        ),
    },
    'cloud_instance_boot': {
        'label': 'Облако — запуск инстанса',
        'group': 'cloud',
        'status': '200',
        'title': 'Instance Starting',
        'body': (
            '<style>body{margin:0;min-height:100vh;background:#0f1419;color:#c9d1d9;font-family:ui-monospace,monospace;font-size:13px;padding:1.25rem}'
            '.h{color:#58a6ff;font-weight:600;margin-bottom:1rem;font-family:system-ui,sans-serif}'
            '.line{margin:.25rem 0;color:#8b949e}.ok{color:#3fb950}.wait{color:#d29922}'
            '.spin{display:inline-block;width:10px;height:10px;border:2px solid #30363d;border-top-color:#58a6ff;'
            'border-radius:50%;animation:sp .7s linear infinite;vertical-align:middle;margin-right:.35rem}'
            '@keyframes sp{to{transform:rotate(360deg)}}'
            '</style>'
            + '<div class="h">Cloud Console</div>'
            + '<div class="line"><span class="spin"></span><span class="wait">Starting instance i-0a1b2c3d…</span></div>'
            + '<div class="line ok">✓ Network configured</div>'
            + '<div class="line ok">✓ Storage attached</div>'
            + '<div class="line wait">… Waiting for cloud-init</div>'
        ),
    },
    'cloud_k8s_pending': {
        'label': 'Kubernetes — Deployment pending',
        'group': 'cloud',
        'status': '200',
        'title': 'Deployment Pending',
        'body': (
            '<style>body{margin:0;min-height:100vh;background:#1e1e2e;color:#cdd6f4;font-family:ui-monospace,monospace;font-size:12px;padding:1rem}'
            'h1{font-family:system-ui,sans-serif;font-size:.95rem;color:#89b4fa;margin:0 0 1rem;font-weight:600}'
            'table{border-collapse:collapse;width:100%;max-width:520px}'
            'td,th{padding:.4rem .55rem;border-bottom:1px solid #313244;text-align:left}'
            'th{color:#a6adc8;font-weight:500;font-size:.72rem;text-transform:uppercase}'
            '.st{color:#fab387}'
            '</style>'
            + '<h1>kubectl get deployments</h1>'
            + '<table><tr><th>Name</th><th>Ready</th><th>Status</th></tr>'
            + '<tr><td>web-app</td><td>0/3</td><td class="st">Pending</td></tr>'
            + '<tr><td>api</td><td>0/2</td><td class="st">Pending</td></tr>'
            + '<tr><td>worker</td><td>0/1</td><td class="st">Pending</td></tr></table>'
        ),
    },
    'cloud_storage_empty': {
        'label': 'Object Storage — пустой bucket',
        'group': 'cloud',
        'status': '200',
        'title': 'Bucket — my-app-assets',
        'body': (
            '<style>body{margin:0;background:#fafafa;color:#333;font-family:system-ui,sans-serif}'
            '.top{background:#232f3e;color:#fff;padding:.75rem 1.25rem;font-size:.9rem;font-weight:600}'
            '.c{max-width:640px;margin:1.5rem auto;padding:0 1rem}'
            'h1{font-size:1.1rem;margin:0 0 .35rem}'
            'p{margin:0 0 1rem;color:#666;font-size:.85rem}'
            '.empty{border:2px dashed #ccc;border-radius:8px;padding:2.5rem 1rem;text-align:center;color:#888;font-size:.85rem}'
            '</style>'
            + '<div class="top">Object Storage</div>'
            + '<div class="c"><h1>my-app-assets</h1>'
            + '<p>Region: eu-central-1 · 0 objects</p>'
            + '<div class="empty">This bucket is empty.<br>No objects to display.</div></div>'
        ),
    },
    'cloud_console_signin': {
        'label': 'Cloud Console — вход',
        'group': 'cloud',
        'status': '200',
        'title': 'Sign in to Cloud Console',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#eaeded;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{width:100%;max-width:340px;background:#fff;border:1px solid #ddd;border-radius:4px;padding:1.5rem}'
            'h1{font-size:1.15rem;margin:0 0 1rem;font-weight:400;color:#111}'
            'label{display:block;font-size:.75rem;color:#555;margin-bottom:.25rem}'
            '.f{width:100%;padding:.45rem .5rem;border:1px solid #aab7b8;border-radius:3px;font:inherit;margin-bottom:.75rem}'
            '.btn{width:100%;padding:.5rem;background:#ff9900;border:none;border-radius:3px;color:#111;font:inherit;font-weight:600}'
            '.hint{margin-top:.75rem;font-size:.72rem;color:#888;text-align:center}'
            '</style>'
            + '<div class="c"><h1>Sign in</h1>'
            + '<label>Account ID or email</label><div class="f" aria-hidden="true">&nbsp;</div>'
            + '<label>Password</label><div class="f" aria-hidden="true">&nbsp;</div>'
            + '<div class="btn">Sign in</div>'
            + '<p class="hint">Cloud management console</p></div>'
        ),
    },
    'cloud_docker_hub': {
        'label': 'Container Registry',
        'group': 'cloud',
        'status': '200',
        'title': 'Container Registry',
        'body': (
            '<style>body{margin:0;background:#0b0e11;color:#e6edf3;font-family:system-ui,sans-serif}'
            '.top{padding:.85rem 1.25rem;border-bottom:1px solid #21262d;font-weight:600;font-size:.95rem}'
            '.c{max-width:640px;margin:1.25rem auto;padding:0 1rem}'
            'h1{font-size:1rem;margin:0 0 .35rem}'
            'p{margin:0 0 1rem;color:#8b949e;font-size:.82rem}'
            '.tag{display:inline-block;padding:.2rem .5rem;background:#161b22;border:1px solid #30363d;border-radius:6px;font-size:.78rem;font-family:monospace}'
            '</style>'
            + '<div class="top">Container Registry</div>'
            + '<div class="c"><h1>myorg/web-service</h1>'
            + '<p>Last pushed: — · No tags available</p>'
            + '<span class="tag">latest — pulling…</span></div>'
        ),
    },
    'game_server_offline': {
        'label': 'Игровой сервер — offline',
        'group': 'gaming',
        'status': '503',
        'title': 'Server Offline',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:linear-gradient(180deg,#0a0e17,#141b2d);color:#e8eaed;font-family:system-ui,sans-serif;padding:1rem;text-align:center}'
            'h1{font-size:1.35rem;margin:0 0 .5rem;letter-spacing:.02em}'
            'p{margin:0;color:#8b919a;font-size:.88rem;line-height:1.45;max-width:340px}'
            '.dot{display:inline-block;width:8px;height:8px;background:#ff5f57;border-radius:50%;margin-right:.35rem}'
            '</style>'
            + '<div><p><span class="dot"></span><strong>OFFLINE</strong></p>'
            + '<h1>Game server unavailable</h1>'
            + '<p>The game server is currently offline. Please try again later or check official status updates.</p></div>'
        ),
    },
    'game_maintenance': {
        'label': 'Игра — техработы',
        'group': 'gaming',
        'status': '503',
        'title': 'Scheduled Maintenance',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#121212;color:#fff;font-family:system-ui,sans-serif;padding:1rem;text-align:center}'
            '.c{max-width:380px}'
            'h1{font-size:1.25rem;margin:0 0 .5rem}'
            'p{margin:0;color:#aaa;font-size:.85rem;line-height:1.5}'
            '.time{margin-top:1rem;padding:.65rem 1rem;background:#1e1e1e;border-radius:8px;font-size:.8rem;color:#888}'
            '</style>'
            + '<div class="c"><h1>🔧 Scheduled Maintenance</h1>'
            + '<p>We are updating game servers. Matchmaking and login are temporarily disabled.</p>'
            + '<div class="time">Estimated downtime: ~2 hours</div></div>'
        ),
    },
    'game_matchmaking': {
        'label': 'Matchmaking — поиск матча',
        'group': 'gaming',
        'status': '200',
        'title': 'Searching for match…',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;padding:1rem;text-align:center}'
            '.ring{width:48px;height:48px;border:3px solid #21262d;border-top-color:#58a6ff;border-radius:50%;'
            'animation:sp .9s linear infinite;margin:0 auto 1rem}'
            '@keyframes sp{to{transform:rotate(360deg)}}'
            'h1{font-size:1rem;margin:0 0 .35rem;font-weight:600}'
            'p{margin:0;color:#8b949e;font-size:.82rem}'
            '</style>'
            + '<div><div class="ring"></div><h1>Searching for match…</h1>'
            + '<p>Estimated time: 0:42 · Players in queue: 1,284</p></div>'
        ),
    },
    'game_launcher_update': {
        'label': 'Launcher — обновление',
        'group': 'gaming',
        'status': '200',
        'title': 'Updating…',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#1b2838;color:#c7d5e0;font-family:system-ui,sans-serif;padding:1rem}'
            '.c{width:100%;max-width:360px;text-align:center}'
            'h1{font-size:1rem;margin:0 0 .75rem;font-weight:600}'
            '.bar{height:6px;background:#2a475e;border-radius:99px;overflow:hidden}'
            '.bar i{display:block;height:100%;width:62%;background:linear-gradient(90deg,#66c0f4,#4a9fd4);border-radius:99px}'
            'p{margin:.65rem 0 0;font-size:.78rem;color:#8f98a0}'
            '</style>'
            + '<div class="c"><h1>Downloading update…</h1>'
            + '<div class="bar"><i></i></div>'
            + '<p>62% · 128 MB / 206 MB · Do not close the launcher</p></div>'
        ),
    },
    'game_ru_server': {
        'label': 'Сервер недоступен (RU)',
        'group': 'gaming',
        'status': '503',
        'title': 'Сервер недоступен',
        'body': (
            '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
            'background:#0f0f12;color:#f0f0f0;font-family:system-ui,sans-serif;padding:1rem;text-align:center}'
            'h1{font-size:1.4rem;margin:0 0 .5rem;font-weight:700}'
            'p{margin:0;color:#9a9a9a;font-size:.9rem;line-height:1.45;max-width:360px}'
            '.code{margin-top:1rem;font-size:.72rem;color:#555;font-family:monospace}'
            '</style>'
            + '<div><h1>Сервер недоступен</h1>'
            + '<p>Не удалось подключиться к игровому серверу. Попробуйте позже или проверьте статус на форуме.</p>'
            + '<p class="code">ERR_GAME_SERVER_DOWN</p></div>'
        ),
    },
    'game_studio': {
        'label': 'Студия — landing page',
        'group': 'gaming',
        'status': '200',
        'title': 'Pixel Forge Studio',
        'body': (
            '<style>body{margin:0;min-height:100vh;background:#111;color:#eee;font-family:system-ui,sans-serif}'
            '.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1rem}'
            'h1{font-size:2rem;font-weight:800;letter-spacing:-.03em;margin:0 0 .35rem}'
            '.tag{color:#7dd3fc;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;margin-bottom:1rem}'
            'p{margin:0;color:#888;font-size:.9rem;max-width:380px;line-height:1.45}'
            '</style>'
            + '<div class="hero"><p class="tag">Indie Game Studio</p>'
            + '<h1>Pixel Forge</h1>'
            + '<p>We craft immersive worlds. Our next title is in development — stay tuned.</p></div>'
        ),
    },
}

DECOY_GROUP_LABELS: dict[str, str] = {
    'errors': 'Ошибки сервера',
    'hosting': 'Хостинг и CDN',
    'protection': 'Защита и WAF',
    'cloud': 'Облако и инфраструктура',
    'gaming': 'Игровые тематики',
    'cms': 'CMS и типовые сайты',
    'placeholder': 'Заглушки',
    'games': 'Мини-игры (offline)',
}

DECOY_GROUP_ORDER: tuple[str, ...] = (
    'errors', 'hosting', 'protection', 'cloud', 'gaming', 'cms', 'placeholder', 'games',
)
