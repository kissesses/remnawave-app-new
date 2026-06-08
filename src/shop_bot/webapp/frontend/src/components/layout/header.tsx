import { ChevronLeft, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUiStore } from "@/stores/ui-store";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  showNotifications?: boolean;
}

export function Header({ title, showBack, showNotifications }: HeaderProps) {
  const navigate = useNavigate();
  const unread = useUiStore((s) => s.unreadNotifications);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur-md">
      {showBack ? (
        <Button variant="ghost" size="icon" className="h-10 w-10 -ml-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
      ) : (
        <div className="w-2" />
      )}
      <h1 className="flex-1 text-lg font-semibold truncate">{title}</h1>
      {showNotifications ? (
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10"
          onClick={() => navigate("/notifications")}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center px-1 text-[10px]">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      ) : (
        <div className="w-10" />
      )}
    </header>
  );
}
