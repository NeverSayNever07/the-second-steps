import { Card, CardContent } from "@/components/ui/card";

export default function WorkspaceLoading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      </div>
      <Card>
        <CardContent className="grid gap-3 py-6">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only">Loading</span>
    </div>
  );
}
