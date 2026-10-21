export default function MarketingLoading() {
  return (
    <div className="grid gap-4" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded bg-muted" />
      ))}
      <span className="sr-only">Loading marketing</span>
    </div>
  );
}
