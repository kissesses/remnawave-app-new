import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { Send, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, getUserId } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { motion } from "framer-motion";

export function SupportPage() {
  const userId = getUserId();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
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
    if (!message.trim() || !data?.ticket_id) return;
    await api.sendSupportMessage(userId, data.ticket_id, message.trim());
    setMessage("");
    await qc.invalidateQueries({ queryKey: ["support", "ticket", userId] });
    toast.success("Сообщение отправлено");
  };

  const createTicket = async () => {
    if (!subject.trim()) return;
    const res = await api.createSupportTicket(userId, subject.trim());
    if (res.ok) {
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
      <div className="flex flex-1 flex-col overflow-hidden pb-20">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 ml-auto" />
          </div>
        ) : !data?.has_ticket ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="Нет обращений"
            description="Создайте тикет, и мы ответим в ближайшее время"
            actionLabel="Создать обращение"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <>
            <div className="page-scroll flex-1 px-4 py-3 space-y-3">
              {data.messages?.map((msg, i) => {
                const isUser = msg.sender === "user";
                const safe = DOMPurify.sanitize(msg.content, { ALLOWED_TAGS: [] });
                return (
                  <motion.div
                    key={`${msg.created_at}-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        isUser
                          ? "bg-[#3390EC] text-white rounded-br-md"
                          : "bg-card border border-border rounded-bl-md"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{safe}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isUser ? "text-white/70" : "text-muted-foreground"
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
            <div className="shrink-0 border-t border-border bg-background p-3 flex gap-2">
              <input
                className="flex-1 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Сообщение..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              />
              <Button size="icon" variant="tg" onClick={sendMessage} disabled={!message.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Новое обращение</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-5 pb-8">
            <input
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm"
              placeholder="Тема обращения"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Button variant="tg" className="w-full" onClick={createTicket}>
              Создать
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
