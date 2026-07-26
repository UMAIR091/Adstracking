"use client";

// Searchable Help Center index (launch audit P1-6). Pure client-side search over
// title/summary/keywords/body — instant, no backend needed at this scale.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, LifeBuoy } from "lucide-react";
import type { HelpArticle } from "@/lib/help/articles";
import { HELP_CATEGORIES } from "@/lib/help/articles";
import { Input } from "@/components/ui/input";

export function HelpCenter({ articles }: { articles: HelpArticle[] }) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return articles;
    return articles.filter((a) =>
      `${a.title} ${a.summary} ${a.body} ${(a.keywords ?? []).join(" ")}`.toLowerCase().includes(term)
    );
  }, [q, articles]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input
          placeholder="Search help articles…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 pl-11 text-base"
          aria-label="Search help articles"
          autoFocus
        />
      </div>

      {q.trim() ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-500">{results.length} result{results.length === 1 ? "" : "s"}</p>
          {results.map((a) => <ArticleRow key={a.slug} a={a} />)}
          {results.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-ink-500">
              No articles match. Try different words, or contact support below.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {HELP_CATEGORIES.map((cat) => {
            const list = articles.filter((a) => a.category === cat);
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-400">{cat}</h2>
                <div className="space-y-2">{list.map((a) => <ArticleRow key={a.slug} a={a} />)}</div>
              </div>
            );
          })}
        </div>
      )}

      <Link
        href="/contact"
        className="flex items-center justify-between rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3.5 transition-colors hover:bg-brand-50"
      >
        <div className="flex items-center gap-3">
          <LifeBuoy size={20} className="text-brand-600" />
          <div>
            <p className="text-sm font-medium text-ink-900">Still need help?</p>
            <p className="text-xs text-ink-500">Contact our support team — we're happy to help.</p>
          </div>
        </div>
        <ChevronRight size={18} className="text-ink-400" />
      </Link>
    </div>
  );
}

function ArticleRow({ a }: { a: HelpArticle }) {
  return (
    <Link
      href={`/help/${a.slug}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-slate-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-900">{a.title}</p>
        <p className="truncate text-xs text-ink-500">{a.summary}</p>
      </div>
      <ChevronRight size={16} className="flex-shrink-0 text-ink-400" />
    </Link>
  );
}
