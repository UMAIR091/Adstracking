import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// Mirrors the client page's section order — Performance, then Data sources,
// then Reporting — so the page fills in place instead of reflowing.
export default function ClientDetailLoading() {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* 1 — Performance leads the page. */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-ink-100 pb-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="mt-3 h-8 w-20" />
                <Skeleton className="mt-2 h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 2 — Data sources: only the connected ones, so a short stack. */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-ink-100 pb-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3.5 w-48" />
          </div>
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="mt-4 h-10 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 3 — Reporting. */}
      <div>
        <div className="mb-4 space-y-2 border-b border-ink-100 pb-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
