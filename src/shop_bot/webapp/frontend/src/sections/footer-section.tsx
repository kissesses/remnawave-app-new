import { Logo } from "@/components/stealthx/Logo";

const FOOTER_LINKS = {
  product: [
    { label: "Тарифы", href: "#pricing" },
    { label: "Серверы", href: "#servers" },
    { label: "Скачать", href: "#" },
    { label: "Функции", href: "#features" },
  ],
  support: [
    { label: "FAQ", href: "#faq" },
    { label: "Поддержка", href: "/app/support" },
    { label: "Статус", href: "#" },
  ],
  social: [
    { label: "Telegram", href: "#" },
    { label: "Twitter", href: "#" },
    { label: "Discord", href: "#" },
  ],
  legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Use", href: "#" },
  ],
};

export function FooterSection() {
  return (
    <footer className="border-t border-white/5 px-4 py-16 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-stealthx-muted">
              Премиальный VPN нового поколения. Твоя свобода. Твоя безопасность.
            </p>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-stealthx-muted">
              Продукт
            </h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.product.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-stealthx-muted hover:text-stealthx-text">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-stealthx-muted">
              Поддержка
            </h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.support.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-stealthx-muted hover:text-stealthx-text">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-widest text-stealthx-muted">
              Следите за нами
            </h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.social.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-stealthx-muted hover:text-stealthx-text">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 md:flex-row">
          <p className="text-xs text-stealthx-muted">
            © {new Date().getFullYear()} STEALTHX. Все права защищены.
          </p>
          <div className="flex gap-6">
            {FOOTER_LINKS.legal.map((l) => (
              <a key={l.label} href={l.href} className="text-xs text-stealthx-muted hover:text-stealthx-text">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
