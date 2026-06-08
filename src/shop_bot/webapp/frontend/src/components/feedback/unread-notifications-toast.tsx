import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useNotifications } from "@/hooks/use-cabinet";
import { getUserId } from "@/lib/api";
import { pickTopUnreadNotification } from "@/lib/notifications";

export function UnreadNotificationsToast() {
  const navigate = useNavigate();
  const { data, isSuccess } = useNotifications();
  const shown = useRef(false);

  useEffect(() => {
    if (!isSuccess || shown.current) return;

    const unread = (data ?? []).filter((n) => !n.read);
    if (!unread.length) return;

    const userId = getUserId();
    const sessionKey = `webapp-notif-toast:${userId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const top = pickTopUnreadNotification(unread);
    if (!top) return;

    const go = (href?: string) => {
      navigate(href || "/notifications");
    };

    toast(top.title, {
      description: top.body,
      duration: 9000,
      action: {
        label: top.cta_label || "Открыть",
        onClick: () => go(top.href),
      },
    });

    if (unread.length > 1) {
      toast.message(`Ещё ${unread.length - 1} непрочитанных`, {
        duration: 7000,
        action: {
          label: "Все",
          onClick: () => go("/notifications"),
        },
      });
    }

    sessionStorage.setItem(sessionKey, "1");
    shown.current = true;
  }, [isSuccess, data, navigate]);

  return null;
}
