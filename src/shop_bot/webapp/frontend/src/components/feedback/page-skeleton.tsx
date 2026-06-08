import { Skeleton } from "@/components/ui/skeleton";

export type PageSkeletonVariant =
  | "hero"
  | "wallet"
  | "detail"
  | "list"
  | "chat"
  | "profile"
  | "settings";

function HeaderBar() {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-border/30 px-4">
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-5 w-32" />
      <div className="flex-1" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
  );
}

function ListRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function PageSkeleton({
  variant = "hero",
  rows = 4,
  showHeader = false,
}: {
  variant?: PageSkeletonVariant;
  rows?: number;
  showHeader?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col animate-in fade-in duration-300">
      {showHeader && <HeaderBar />}
      <div className="space-y-4 p-4">
        {variant === "hero" && (
          <>
            <Skeleton className="h-44 w-full rounded-3xl" />
            <div className="grid grid-cols-2 gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-36 w-full rounded-2xl" />
          </>
        )}

        {variant === "wallet" && (
          <>
            <Skeleton className="h-40 w-full rounded-3xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          </>
        )}

        {variant === "detail" && (
          <>
            <Skeleton className="h-48 w-full rounded-3xl" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-11 rounded-2xl" />
              <Skeleton className="h-11 rounded-2xl" />
            </div>
            <Skeleton className="h-11 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <ListRows count={2} />
          </>
        )}

        {variant === "list" && <ListRows count={rows} />}

        {variant === "chat" && (
          <>
            <Skeleton className="h-14 w-full rounded-2xl" />
            <div className="space-y-3 pt-2">
              <Skeleton className="h-16 w-[78%] rounded-2xl rounded-bl-sm" />
              <Skeleton className="h-14 w-[65%] ml-auto rounded-2xl rounded-br-sm" />
              <Skeleton className="h-20 w-[72%] rounded-2xl rounded-bl-sm" />
            </div>
          </>
        )}

        {variant === "profile" && (
          <>
            <Skeleton className="h-28 w-full rounded-3xl" />
            <Skeleton className="h-5 w-28 mb-1" />
            <ListRows count={3} />
          </>
        )}

        {variant === "settings" && (
          <>
            <Skeleton className="h-5 w-24" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-5 w-28 mt-2" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </>
        )}
      </div>
    </div>
  );
}
