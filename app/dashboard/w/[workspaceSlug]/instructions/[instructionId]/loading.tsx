export default function InstructionLoading() {
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]"
      aria-busy="true"
    >
      <div className="grid content-start gap-4">
        <div className="size-14 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-56 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid content-start gap-6">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <span className="sr-only">Loading instruction</span>
    </div>
  );
}
