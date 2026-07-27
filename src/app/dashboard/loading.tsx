import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

// The skeleton mirrors the real layout block for block, so the page doesn't
// visibly reflow when data arrives — the shapes stay put and only fill in.
export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Stat row — same responsive steps as StatRow */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-4 w-24" />
              <Skeleton className="mt-1.5 h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI panel + next scheduled */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-64" />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-ink-100 p-4">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1.5 h-3 w-2/3" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="mt-4 h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-32" />
            <Skeleton className="mt-6 h-3 w-24" />
          </CardContent>
        </Card>
      </div>

      {/* Performance KPIs */}
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-8 w-20" />
                <Skeleton className="mt-2 h-3 w-28" />
                <Skeleton className="mt-3 h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Timeline + recent reports */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((c) => (
          <Card key={c}>
            <CardContent className="p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-56" />
              <div className="mt-5 space-y-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
