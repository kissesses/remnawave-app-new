import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMoney, cn } from "@/lib/utils";

interface ProfileHeroCardProps {
  displayName: string;
  username?: string;
  userId: number;
  avatarUrl?: string;
  initials: string;
  balance: number;
  activeKeys: number;
  totalKeys: number;
  referralCount?: number;
  trialUsed?: boolean;
  trialAvailable?: boolean;
  onBalanceClick?: () => void;
  onKeysClick?: () => void;
  onReferralsClick?: () => void;
}

function normalizeProfileHandle(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/[^\w]/g, "");
}

function shouldShowUsername(displayName: string, username?: string): boolean {
  if (!username?.trim()) return false;
  return normalizeProfileHandle(username) !== normalizeProfileHandle(displayName);
}

function StatPill({
  value,
  label,
  onClick,
}: {
  value: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const className = cn(
    "profile-stat-pill w-full transition-transform active:scale-[0.98]",
    onClick && "cursor-pointer hover:bg-black/30",
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <p className="profile-stat-pill__value">{value}</p>
        <p className="profile-stat-pill__label">{label}</p>
      </button>
    );
  }

  return (
    <div className={className}>
      <p className="profile-stat-pill__value">{value}</p>
      <p className="profile-stat-pill__label">{label}</p>
    </div>
  );
}

export function ProfileHeroCard({
  displayName,
  username,
  userId,
  avatarUrl,
  initials,
  balance,
  activeKeys,
  totalKeys,
  referralCount = 0,
  trialUsed,
  trialAvailable,
  onBalanceClick,
  onKeysClick,
  onReferralsClick,
}: ProfileHeroCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="profile-hero surface-elevated overflow-hidden rounded-xl"
    >
      <div className="profile-hero__glow" />
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/15 shadow-lg">
            <AvatarImage src={avatarUrl} alt="" />
            <AvatarFallback className="rounded-2xl text-lg font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="truncate text-lg font-bold tracking-tight">{displayName}</h2>
            {shouldShowUsername(displayName, username) && (
              <p className="mt-0.5 truncate text-sm text-primary">
                @{username!.replace(/^@/, "")}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              ID <span className="font-medium text-foreground">{userId}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trialAvailable && (
                <Badge variant="success" className="text-[10px]">
                  Триал доступен
                </Badge>
              )}
              {trialUsed && !trialAvailable && (
                <Badge variant="secondary" className="text-[10px]">
                  Триал использован
                </Badge>
              )}
              {activeKeys > 0 && (
                <Badge variant="success" className="text-[10px]">
                  {activeKeys} активн.
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatPill value={formatMoney(balance)} label="Баланс" onClick={onBalanceClick} />
          <StatPill
            value={`${activeKeys}/${totalKeys}`}
            label="Ключи"
            onClick={onKeysClick}
          />
          <StatPill value={referralCount} label="Рефералы" onClick={onReferralsClick} />
        </div>
      </div>
    </motion.div>
  );
}
