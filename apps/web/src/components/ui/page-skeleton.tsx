/** Instant placeholder while a route segment resolves (loading.tsx). */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-5 w-40 rounded-md bg-surface-overlay" />
        <div className="h-4 w-72 max-w-full rounded-md bg-surface-overlay" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border-subtle bg-surface-raised" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border-subtle bg-surface-raised" />
      <div className="h-40 rounded-xl border border-border-subtle bg-surface-raised" />
    </div>
  );
}
