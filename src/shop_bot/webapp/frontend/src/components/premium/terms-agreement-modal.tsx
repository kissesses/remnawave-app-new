import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";

export function TermsAgreementModal() {
  const userId = getUserId();
  const { data: config } = useCabinetConfig();
  const qc = useQueryClient();
  const { openLink, haptic } = useTelegram();
  const [agreeing, setAgreeing] = useState(false);

  const terms = config?.terms;
  const open = Boolean(terms?.required);

  const agree = async () => {
    setAgreeing(true);
    try {
      const res = await api.agreeTerms(userId);
      if (res.ok) {
        haptic("success");
        await qc.invalidateQueries({ queryKey: ["cabinet", "config"] });
      } else {
        toast.error(res.error ?? "Не удалось сохранить");
      }
    } finally {
      setAgreeing(false);
    }
  };

  const openDoc = (url: string) => {
    if (!url) return;
    if (openLink) openLink(url);
    else window.open(url, "_blank");
  };

  return (
    <Sheet open={open}>
      <SheetContent
        className="max-h-[70vh] rounded-t-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Условия использования</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8 text-sm text-muted-foreground">
          <p>
            Для продолжения работы с кабинетом необходимо принять условия
            использования и политику конфиденциальности.
          </p>
          <div className="flex flex-col gap-2">
            {terms?.terms_url ? (
              <Button
                variant="outline"
                className="rounded-2xl justify-start"
                onClick={() => openDoc(terms.terms_url)}
              >
                Условия использования
              </Button>
            ) : null}
            {terms?.privacy_url ? (
              <Button
                variant="outline"
                className="rounded-2xl justify-start"
                onClick={() => openDoc(terms.privacy_url)}
              >
                Политика конфиденциальности
              </Button>
            ) : null}
          </div>
          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={agreeing}
            onClick={agree}
          >
            Принимаю условия
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
