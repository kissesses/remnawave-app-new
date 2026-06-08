import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, LogIn, UserPlus } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { api, setAuthToken } from "@/lib/api";

export function EmailAuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    const res =
      mode === "login"
        ? await api.emailLogin(email.trim(), password)
        : await api.emailRegister(email.trim(), password);
    setLoading(false);
    if (res.ok && res.token) {
      setAuthToken(res.token);
      toast.success(mode === "login" ? "Вход выполнен" : "Аккаунт создан");
      navigate("/", { replace: true });
      window.location.reload();
    } else {
      toast.error(res.error ?? "Ошибка авторизации");
    }
  };

  return (
    <>
      <Header title="Email-вход" showBack />
      <div className="page-scroll space-y-5 p-4">
        <div className="premium-hero">
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">
                {mode === "login" ? "Вход по email" : "Регистрация"}
              </h1>
              <p className="text-sm text-muted-foreground">Для браузера без Telegram</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={loading || !email || !password}
            onClick={() => void submit()}
          >
            {mode === "login" ? (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                {loading ? "Вход…" : "Войти"}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                {loading ? "Создание…" : "Создать аккаунт"}
              </>
            )}
          </Button>
        </div>

        <button
          type="button"
          className="w-full text-center text-sm text-primary font-medium"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </>
  );
}
