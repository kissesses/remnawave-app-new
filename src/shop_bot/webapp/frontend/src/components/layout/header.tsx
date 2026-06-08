import { useCallback, useEffect } from "react";
import { ChevronLeft, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUiStore } from "@/stores/ui-store";
import { useTelegram } from "@/hooks/use-telegram";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  showNotifications?: boolean;
  logo?: string;
  action?: React.ReactNode;
}

export function Header({ title, showBack, showNotifications, logo, action }: HeaderProps) {
  const navigate = useNavigate();
  const unread = useUiStore((s) => s.unreadNotifications);
  const { haptic, showBackButton, isTelegram } = useTelegram();

  const goBack = useCallback(() => {
    haptic("selection");
    navigate(-1);
  }, [haptic, navigate]);

  useEffect(() => {
    if (!showBack) return;
    return showBackButton(goBack);
  }, [showBack, showBackButton, goBack]);

  const useNativeBack = showBack && isTelegram;

  return (
    <header
      className={cn(
        "app-header sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 px-4",
      )}
    >
      {showBack && !useNativeBack ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 -ml-2 rounded-xl"
          onClick={goBack}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      ) : showBack && useNativeBack ? (
        <div className="w-2 shrink-0" />
      ) : logo ? (
        <div className="shrink-0">
          <img
            src={logo}
            alt=""
            className="h-9 w-9 rounded-[0.65rem] object-cover border border-border/50 shadow-sm"
          />
        </div>
      ) : (
        <div className="w-2 shrink-0" />
      )}
      <h1 className="flex-1 text-[17px] font-bold truncate tracking-tight">{title}</h1>
      {action}
      {showNotifications && !action ? (
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-xl"
          onClick={() => {
            haptic("selection");
            navigate("/notifications");
          }}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center px-1 text-[10px]">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      ) : !action ? (
        <div className="w-10 shrink-0" />
      ) : null}
    </header>
  );
}
