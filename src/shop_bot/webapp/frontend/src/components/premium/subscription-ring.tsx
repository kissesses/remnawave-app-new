export function SubscriptionRing({ percent, size = 96 }: { percent: number; size?: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  const gradId = `ring-grad-${size}`;

  return (
    <div className="relative shrink-0 premium-ring-glow" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--premium-glow-2))" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className="premium-ring-track"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-gradient-primary">
          {Math.round(p)}%
        </span>
      </div>
    </div>
  );
}
