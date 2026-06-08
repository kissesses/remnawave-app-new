import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Send, MessageSquarePlus, Headphones, Circle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, getUserId } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { useTelegram } from "@/hooks/use-telegram";

export function SupportPage() {
  const userId = getUserId();
  const qc = useQueryClient();
  const { haptic } = useTelegram();
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "ticket", userId],
    queryFn: () => api.getSupportStatus(userId),
    refetchInterval: (q) => (q.state.data?.has_ticket ? 5000 : false),
    staleTime: 5000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  const sendMessage = async () => {
    if (!message.trim() || !data?.ticket_id || sending) return;
    setSending(true);
    try {
      await api.sendSupportMessage(userId, data.ticket_id, message.trim());
      setMessage("");
      haptic("success");
      await qc.invalidateQueries({ queryKey: ["support", "ticket", userId] });
    } finally {
      setSending(false);
    }
  };

  const createTicket = async () => {
    if (!subject.trim()) return;
    const res = await api.createSupportTicket(userId, subject.trim());
    if (res.ok) {
      haptic("success");
      setCreateOpen(false);
      setSubject("");
      await qc.invalidateQueries({ queryKey: ["support", "ticket", userId] });
      toast.success("Обращение создано");
    } else {
      toast.error(res.error ?? "Не удалось создать обращение");
    }
  };

  return (
    <>
      <Header title="Поддержка" />
      <div className="flex flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <PageSkeleton variant="chat" />
        ) : !data?.has_ticket ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="Нет обращений"
            description="Создайте тикет — ответим в ближайшее время"
            actionLabel="Создать обращение"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <>
            <div className="shrink-0 mx-4 mt-2 premium-glass px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                <Headphones className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{data.subject || "Обращение"}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                  Онлайн · ответ в течение дня
                </p>
              </div>
            </div>

            <div className="page-scroll flex-1 px-4 py-3 space-y-2">
              {data.messages?.map((msg, i) => {
                const isUser = msg.sender === "user";
                const safe = DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: [] });
                return (
                  <motion.div
                    key={`${msg.created_at}-${i}`}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "premium-glass rounded-bl-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{safe}</p>
                      <p
                        className={`mt-1.5 text-[10px] tabular-nums ${
                          isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div
              className="shrink-0 border-t border-border/40 bg-background/90 backdrop-blur-xl p-3 flex gap-2"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
            >
              <input
                className="flex-1 rounded-2xl border border-border/50 bg-card/80 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Сообщение..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              />
              <Button
                size="icon"
                variant="tg"
                className="rounded-xl h-11 w-11 shrink-0"
                onClick={sendMessage}
                disabled={!message.trim() || sending}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-gradient-primary">Новое обращение</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-5 pb-8">
            <input
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Тема обращения"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Button variant="tg" className="w-full rounded-2xl h-12" onClick={createTicket}>
              Создать
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
