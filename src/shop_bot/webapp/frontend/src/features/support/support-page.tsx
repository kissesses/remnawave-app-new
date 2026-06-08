import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  Send,
  MessageSquarePlus,
  Headphones,
  Circle,
  History,
  ChevronDown,
  ExternalLink,
  XCircle,
  RotateCcw,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { api, getUserId } from "@/lib/api";
import { formatTime, formatDate, cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/use-telegram";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import type { SupportMessage } from "@/types/api";

const TAB_BAR_PAD =
  "calc(5.75rem + var(--tab-bar-safe, env(safe-area-inset-bottom, 0px)))";

const DEFAULT_CATEGORIES = [
  { id: "payment", label: "Оплата" },
  { id: "vpn", label: "VPN не работает" },
  { id: "key", label: "Ключ / подписка" },
  { id: "other", label: "Другое" },
];

const DEFAULT_FAQ = [
  {
    id: "vpn",
    question: "VPN не подключается",
    answer:
      "Проверьте срок действия ключа, обновите подписку в приложении и убедитесь, что интернет работает без VPN.",
  },
  {
    id: "payment",
    question: "Оплата не прошла",
    answer:
      "Подождите 2–5 минут и обновите баланс. Если средства списались — создайте обращение с категорией «Оплата».",
  },
  {
    id: "key",
    question: "Где взять ссылку подключения?",
    answer: "Откройте «Профиль» → выберите ключ → скопируйте ссылку подписки.",
  },
];

function messageDayKey(createdAt: string) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function groupMessagesWithDates(messages: SupportMessage[]) {
  const groups: { date: string; items: SupportMessage[] }[] = [];
  for (const msg of messages) {
    const day = messageDayKey(msg.created_at);
    const last = groups[groups.length - 1];
    if (last?.date === day) last.items.push(msg);
    else groups.push({ date: day, items: [msg] });
  }
  return groups;
}

export function SupportPage() {
  const userId = getUserId();
  const qc = useQueryClient();
  const { haptic, openLink } = useTelegram();
  const { data: config } = useCabinetConfig();

  const supportInfo = config?.support_info;
  const categories = supportInfo?.categories?.length
    ? supportInfo.categories
    : DEFAULT_CATEGORIES;
  const faq = supportInfo?.faq?.length ? supportInfo.faq : DEFAULT_FAQ;
  const supportBot = supportInfo?.bot_username?.replace(/^@/, "");

  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [category, setCategory] = useState("other");
  const [sending, setSending] = useState(false);
  const [faqOpen, setFaqOpen] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support", "ticket", userId, selectedTicketId],
    queryFn: () => api.getSupportStatus(userId, selectedTicketId),
    refetchInterval: (q) => (q.state.data?.can_send ? 5000 : 15000),
    staleTime: 3000,
  });

  const hasOpenTicket = (data?.tickets ?? []).some((t) => t.status === "open");
  const canSend = data?.can_send ?? false;
  const canReopen = data?.can_reopen ?? false;
  const activeId = data?.ticket_id;
  const activeTicket = (data?.tickets ?? []).find((t) => t.ticket_id === activeId);
  const messageGroups = useMemo(
    () => groupMessagesWithDates(data?.messages ?? []),
    [data?.messages],
  );

  useEffect(() => {
    if (data?.has_ticket && hasOpenTicket) setFaqOpen(false);
  }, [data?.has_ticket, hasOpenTicket]);

  useEffect(() => {
    if (data?.ticket_id && selectedTicketId == null) {
      setSelectedTicketId(data.ticket_id);
    }
  }, [data?.ticket_id, selectedTicketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length, activeId]);

  const invalidateSupport = () =>
    qc.invalidateQueries({ queryKey: ["support", "ticket", userId] });

  const sendMessage = async () => {
    if (!message.trim() || !activeId || sending || !canSend) return;
    setSending(true);
    try {
      const res = await api.sendSupportMessage(userId, activeId, message.trim());
      if (!res.ok) {
        toast.error(res.error ?? "Не удалось отправить сообщение");
        return;
      }
      setMessage("");
      haptic("success");
      await invalidateSupport();
    } finally {
      setSending(false);
    }
  };

  const createTicket = async () => {
    if (!subject.trim()) return;
    const res = await api.createSupportTicket(userId, subject.trim(), {
      category,
      message: firstMessage.trim() || undefined,
    });
    if (res.ok) {
      haptic("success");
      setCreateOpen(false);
      setSubject("");
      setFirstMessage("");
      setCategory("other");
      if (res.ticket_id) setSelectedTicketId(res.ticket_id);
      await invalidateSupport();
      toast.success("Обращение создано");
    } else {
      toast.error(res.error ?? "Не удалось создать обращение");
    }
  };

  const closeTicket = async () => {
    if (!activeId) return;
    const res = await api.closeSupportTicket(userId, activeId);
    if (res.ok) {
      haptic("success");
      await invalidateSupport();
      toast.success("Обращение закрыто");
    } else {
      toast.error(res.error ?? "Не удалось закрыть обращение");
    }
  };

  const reopenTicket = async () => {
    if (!activeId) return;
    const res = await api.reopenSupportTicket(userId, activeId);
    if (res.ok) {
      haptic("success");
      if (res.ticket_id) setSelectedTicketId(res.ticket_id);
      await invalidateSupport();
      toast.success("Обращение снова открыто");
    } else {
      toast.error(res.error ?? "Не удалось переоткрыть обращение");
    }
  };

  const selectTicket = (ticketId: number) => {
    haptic("selection");
    setSelectedTicketId(ticketId);
    setMessage("");
  };

  const openSupportBot = () => {
    if (!supportBot) {
      toast.error("Бот поддержки не настроен");
      return;
    }
    haptic("selection");
    openLink?.(`https://t.me/${supportBot}`);
  };

  const applyFaqCategory = (faqId: string) => {
    const map: Record<string, string> = {
      vpn: "vpn",
      payment: "payment",
      key: "key",
    };
    if (map[faqId]) setCategory(map[faqId]);
    setCreateOpen(true);
    haptic("selection");
  };

  return (
    <>
      <Header title="Поддержка" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isLoading ? (
          <PageSkeleton variant="chat" />
        ) : (
          <>
            <div className="shrink-0 space-y-2 px-4 pt-2">
              <div className="studio-board overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                  onClick={() => setFaqOpen((v) => !v)}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <HelpCircle className="h-3.5 w-3.5" />
                    Частые вопросы
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      faqOpen && "rotate-180",
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {faqOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-1 border-t border-white/10 px-3 pb-3 pt-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {supportInfo?.intro ??
                            "Задайте вопрос — ответим в ближайшее время."}
                        </p>
                        {faq.map((item) => (
                          <div key={item.id} className="rounded-xl bg-black/15">
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium"
                              onClick={() =>
                                setExpandedFaq((id) => (id === item.id ? null : item.id))
                              }
                            >
                              <span>{item.question}</span>
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                  expandedFaq === item.id && "rotate-180",
                                )}
                              />
                            </button>
                            <AnimatePresence>
                              {expandedFaq === item.id && (
                                <motion.p
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden px-3 pb-2.5 text-xs leading-relaxed text-muted-foreground"
                                >
                                  {item.answer}
                                  <button
                                    type="button"
                                    className="mt-2 block text-primary font-semibold"
                                    onClick={() => applyFaqCategory(item.id)}
                                  >
                                    Создать обращение →
                                  </button>
                                </motion.p>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                        {supportBot && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-8 w-full rounded-xl text-xs text-primary"
                            onClick={openSupportBot}
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Написать в Telegram @{supportBot}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!data?.has_ticket ? (
                <EmptyState
                  icon={MessageSquarePlus}
                  title="Нет обращений"
                  description="Создайте тикет — ответим в ближайшее время"
                  actionLabel="Создать обращение"
                  onAction={() => setCreateOpen(true)}
                />
              ) : (
                <>
                  <div className="studio-board p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <History className="h-3.5 w-3.5" />
                        История обращений
                        {(data.unread_count ?? 0) > 0 && (
                          <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                            {data.unread_count}
                          </Badge>
                        )}
                      </div>
                      {!hasOpenTicket && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-lg px-2 text-xs text-primary"
                          onClick={() => setCreateOpen(true)}
                        >
                          <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
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
                          <span className="relative max-w-[8.5rem] truncate">
                            {t.has_unread && (
                              <span className="absolute -left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" />
                            )}
                            {t.subject}
                          </span>
                          {t.status === "closed" && (
                            <span className="text-[10px] opacity-70">· закрыт</span>
                          )}
                          {t.message_count > 0 && (
                            <span className="text-[10px] opacity-60">· {t.message_count}</span>
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
                            {supportInfo?.hours ?? "Онлайн · ответ в течение дня"}
                          </>
                        ) : canReopen && data.reopen_deadline_at ? (
                          <>Можно переоткрыть до {formatDate(data.reopen_deadline_at)}</>
                        ) : (
                          <>Архив · срок переоткрытия истёк</>
                        )}
                      </p>
                    </div>
                    {canSend ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={closeTicket}
                        title="Закрыть обращение"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      !hasOpenTicket &&
                      canReopen &&
                      data.status === "closed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 rounded-lg px-2 text-xs text-primary"
                          onClick={reopenTicket}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Открыть
                        </Button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>

            {data?.has_ticket && (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                  {(data.messages?.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-muted-foreground">Сообщений пока нет</p>
                      {canSend && (
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          Напишите ниже — мы ответим в течение дня
                        </p>
                      )}
                    </div>
                  ) : (
                    messageGroups.map((group) => (
                      <div key={group.date} className="space-y-2">
                        <p className="sticky top-0 z-10 mx-auto w-fit rounded-full bg-black/30 px-3 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
                          {formatDate(group.items[0].created_at)}
                        </p>
                        {group.items.map((msg, i) => {
                          const isUser = msg.sender === "user";
                          const isAdmin = msg.sender === "admin";
                          const safe = DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: [] });
                          return (
                            <motion.div
                              key={`${msg.created_at}-${i}`}
                              initial={{ opacity: 0, y: 8, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={cn(
                                  "max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                                  isUser
                                    ? "rounded-br-sm bg-primary text-primary-foreground"
                                    : "surface-glass rounded-bl-sm",
                                )}
                              >
                                {isAdmin && (
                                  <p className="mb-1 text-[10px] font-semibold text-primary">
                                    Поддержка
                                  </p>
                                )}
                                <p className="whitespace-pre-wrap break-words leading-relaxed">
                                  {safe}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1.5 text-[10px] tabular-nums",
                                    isUser
                                      ? "text-primary-foreground/70"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {formatTime(msg.created_at)}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>

                <div
                  className="shrink-0 border-t border-white/10 bg-background/80 p-3 backdrop-blur-xl"
                  style={{ paddingBottom: TAB_BAR_PAD }}
                >
                  {canSend ? (
                    <div className="flex gap-2">
                      <textarea
                        rows={1}
                        className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Сообщение..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
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
                    <div className="space-y-2 py-1 text-center">
                      <p className="text-xs text-muted-foreground">
                        {canReopen && data.reopen_deadline_at
                          ? `Обращение закрыто · переоткрытие до ${formatDate(data.reopen_deadline_at)}`
                          : "Срок переоткрытия истёк (24 часа после закрытия)"}
                        {activeTicket?.closed_at
                          ? ` · ${formatDate(activeTicket.closed_at)}`
                          : activeTicket?.updated_at
                            ? ` · ${formatDate(activeTicket.updated_at)}`
                            : ""}
                      </p>
                      {canReopen ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-xl text-xs text-primary"
                          onClick={reopenTicket}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Переоткрыть обращение
                        </Button>
                      ) : !hasOpenTicket ? (
                        <Button
                          variant="tg"
                          size="sm"
                          className="h-9 rounded-xl text-xs"
                          onClick={() => setCreateOpen(true)}
                        >
                          <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
                          Создать новое обращение
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-gradient-primary">Новое обращение</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-5 pb-8">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Категория</p>
              <StudioChipRow className="flex-wrap">
                {categories.map((c) => (
                  <StudioChip
                    key={c.id}
                    active={category === c.id}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                  </StudioChip>
                ))}
              </StudioChipRow>
            </div>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Краткая тема"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Опишите проблему подробнее (необязательно)"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
            />
            <Button variant="tg" className="h-12 w-full rounded-2xl" onClick={createTicket}>
              Создать обращение
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
