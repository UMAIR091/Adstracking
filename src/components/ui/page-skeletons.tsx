import { Skeleton } from "@/components/ui/skeleton";

// Loading shapes for the app's route loading.tsx files. Each mirrors its page
// block for block (header, stat strip, cards, table rows) so nothing reflows
// when the data arrives — the shapes stay put and only fill in.

const card = "rounded-card border border-ink-200 bg-surface";

function Header({ eyebrow = false, actions = 1 }: { eyebrow?: boolean; actions?: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        {eyebrow && <Skeleton className="h-3 w-32" />}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-[38px] w-28 rounded-control" />
        ))}
      </div>
    </div>
  );
}

export function StatStripSkeleton({ cells = 4 }: { cells?: number }) {
  return (
    <div className={`grid grid-cols-1 gap-px overflow-hidden ${card} bg-ink-200 ${cells === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className="space-y-2 bg-surface px-[18px] py-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ListCardSkeleton({ rows = 5, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className={`overflow-hidden ${card}`}>
      {header && (
        <div className="border-b border-ink-100 bg-ink-50 px-[18px] py-2.5">
          <Skeleton className="h-3 w-40" />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 px-[18px] py-[13px] ${i ? "border-t border-ink-100" : ""}`}>
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

function SideCardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={`${card} space-y-3 px-[18px] py-4`}>
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-[9px]" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Home: header, stat strip, attention + clients beside up next + activity. */
export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Header eyebrow actions={2} />
      <StatStripSkeleton />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="flex flex-col gap-5">
          <ListCardSkeleton rows={3} header={false} />
          <ListCardSkeleton rows={5} />
        </div>
        <div className="flex flex-col gap-5">
          <SideCardSkeleton />
          <SideCardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}

/** A list page: header, a toolbar of search + filters, and the table. */
export function ListPageSkeleton({ actions = 1, filters = 2, rows = 6 }: { actions?: number; filters?: number; rows?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <Header actions={actions} />
      <div className="flex flex-wrap gap-2.5">
        <Skeleton className="h-10 min-w-[220px] flex-1 rounded-control" />
        {Array.from({ length: filters }, (_, i) => (
          <Skeleton key={i} className="h-10 w-56 rounded-control" />
        ))}
      </div>
      <ListCardSkeleton rows={rows} />
    </div>
  );
}

/** Integrations: header, summary strip, accounts table, catalogue cards. */
export function IntegrationsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <Header actions={0} />
      <StatStripSkeleton cells={3} />
      <ListCardSkeleton rows={4} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2.5 rounded-xl border border-ink-200 bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[34px] w-[34px] rounded-[9px]" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A client's workspace: breadcrumb, identity header, tabs, pipeline. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3.5 w-40" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-[52px] w-[52px] rounded-[13px]" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-[38px] w-28 rounded-control" />
          <Skeleton className="h-[38px] w-36 rounded-control" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-ink-200 pb-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      <div className={`${card} p-[18px]`}>
        <Skeleton className="h-4 w-36" />
        <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border border-ink-100 p-3.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      <ListCardSkeleton rows={3} header={false} />
    </div>
  );
}

/** Settings pages: title, then form cards (the nav is in the layout). */
export function SettingsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={`${card} space-y-4 p-5`}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className="h-10 w-full rounded-control" />
          <Skeleton className="h-10 w-full rounded-control" />
        </div>
      ))}
    </div>
  );
}
