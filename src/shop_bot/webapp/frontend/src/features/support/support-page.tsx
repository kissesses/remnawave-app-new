import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Send, MessageSquarePlus, Headphones, Circle, History } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { api, getUserId } from "@/lib/api";
import { formatTime, formatDate } from "@/lib/utils";
import { useTelegram } from "@/hooks/use-telegram";

const TAB_BAR_PAD =
  "calc(5.75rem + var(--tab-bar-safe, env(safe-area-inset-bottom, 0px)))";

export function SupportPage() {
  const userId = getUserId();
  const qc = useQueryClient();
  const { haptic } = useTelegram();
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "ticket", userId, selectedTicketId],
    queryFn: () => api.getSupportStatus(userId, selectedTicketId),
    refetchInterval: (q) => (q.state.data?.can_send ? 5000 : false),
    staleTime: 3000,
  });

  const hasOpenTicket = (data?.tickets ?? []).some((t) => t.status === "open");
  const canSend = data?.can_send ?? false;
  const activeId = data?.ticket_id;

  useEffect(() => {
    if (data?.ticket_id && selectedTicketId == null) {
      setSelectedTicketId(data.ticket_id);
    }
  }, [data?.ticket_id, selectedTicketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length, activeId]);

  const sendMessage = async () => {
    if (!message.trim() || !activeId || sending || !canSend) return;
    setSending(true);
    try {
      const res = await api.sendSupportMessage(userId, activeId, message.trim());
      if (!res.ok) {
        toast.error("Не удалось отправить сообщение");
        return;
      }
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
      if (res.ticket_id) setSelectedTicketId(res.ticket_id);
      await qc.invalidateQueries({ queryKey: ["support", "ticket", userId] });
      toast.success("Обращение создано");
    } else {
      toast.error(res.error ?? "Не удалось создать обращение");
    }
  };

  const selectTicket = (ticketId: number) => {
    haptic("selection");
    setSelectedTicketId(ticketId);
    setMessage("");
  };

  return (
    <>
      <Header title="Поддержка" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            <div className="shrink-0 space-y-2 px-4 pt-2">
              <div className="studio-board p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <History className="h-3.5 w-3.5" />
                    История обращений
                  </div>
                  {!hasOpenTicket && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg px-2 text-xs text-primary"
                      onClick={() => setCreateOpen(true)}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
                      Новое
                    </Button>
                  )}
                </div>
                <StudioChipRow className="flex-wrap">
                  {(data.tickets ?? []).map((t) => (
                    <StudioChip
                      key={t.ticket_id}
                      active={t.ticket_id === activeId}
                      onClick={() => selectTicket(t.ticket_id)}
                    >
                      <span className="max-w-[8.5rem] truncate">{t.subject}</span>
                      {t.status === "closed" && (
                        <span className="text-[10px] opacity-70">· закрыт</span>
                      )}
                    </StudioChip>
                  ))}
                </StudioChipRow>
              </div>

              <div className="surface-glass flex items-center gap-3 px-4 py-3">
                <div className="studio-hub__icon h-9 w-9">
                  <Headphones className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {data.subject || "Обращение"}
                    </p>
                    <Badge
                      variant={data.status === "open" ? "success" : "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {data.status === "open" ? "Открыт" : "Закрыт"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {data.status === "open" ? (
                      <>
                        <Circle className="h-2 w-2 fill-success text-success" />
                        Онлайн · ответ в течение дня
                      </>
                    ) : (
                      <>Архив · только просмотр</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
              {(data.messages?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Сообщений пока нет
                  </p>
                  {canSend && (
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      Напишите ниже — мы ответим в течение дня
                    </p>
                  )}
                </div>
              ) : (
                data.messages?.map((msg, i) => {
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
                            : "surface-glass rounded-bl-sm"
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
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div
              className="shrink-0 border-t border-white/10 bg-background/80 backdrop-blur-xl p-3"
              style={{ paddingBottom: TAB_BAR_PAD }}
            >
              {canSend ? (
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Сообщение..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  />
                  <Button
                    size="icon"
                    variant="tg"
                    className="h-11 w-11 shrink-0 rounded-xl"
                    onClick={sendMessage}
                    disabled={!message.trim() || sending}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-1">
                  Обращение закрыто
                  {(() => {
                    const updated = data.tickets?.find((t) => t.ticket_id === activeId)?.updated_at;
                    return updated ? ` · ${formatDate(updated)}` : "";
                  })()}
                </p>
              )}
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
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
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
