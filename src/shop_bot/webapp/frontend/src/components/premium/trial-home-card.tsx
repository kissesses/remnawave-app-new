import { Gift, Sparkles, CheckCircle2, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { StudioBoard } from "@/components/studio/studio-board";

interface TrialHomeCardProps {
  days: number;
  available: boolean;
  used: boolean;
  hostCount?: number;
  onActivate: () => void;
  onBuy: () => void;
}

export function TrialHomeCard({
  days,
  available,
  used,
  hostCount = 0,
  onActivate,
  onBuy,
}: TrialHomeCardProps) {
  if (!available && !used) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <StudioBoard className="overflow-hidden p-0">
        <div className="relative p-4">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="studio-hub__icon h-11 w-11 shrink-0">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">Пробный период</p>
                {available && (
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    Бесплатно
                  </span>
                )}
              </div>
              {available ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-primary">{days} дн.</span> полного доступа к VPN
                    {hostCount > 1 ? ` · ${hostCount} серверов на выбор` : ""}. Один раз на аккаунт —
                    без оплаты и привязки карты.
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Мгновенная выдача ключа
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                      Все функции как у платной подписки
                    </li>
                  </ul>
                  <Button
                    variant="tg"
                    className="mt-3 h-10 w-full rounded-xl text-sm font-semibold"
                    onClick={onActivate}
                  >
                    <Gift className="mr-2 h-4 w-4" />
                    Активировать триал
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Пробный период уже использован на этом аккаунте
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Вы можете оформить полную подписку — ключи, продление и настройка VPN доступны в
                    кабинете.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 h-10 w-full rounded-xl border-white/15 text-sm"
                    onClick={onBuy}
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Купить подписку
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </StudioBoard>
    </motion.div>
  );
}
