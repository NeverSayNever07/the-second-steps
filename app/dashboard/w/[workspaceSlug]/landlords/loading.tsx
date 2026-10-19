import { Card, CardContent } from "@/components/ui/card";

export default function LandlordsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <CardContent className="grid gap-3 py-6">
          <div className="h-9 animate-pulse rounded bg-muted" />
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only">Loading landlords</span>
    </div>
  );
}
