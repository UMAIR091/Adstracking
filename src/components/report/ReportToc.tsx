"use client";

import { useEffect, useState } from "react";
import { reportFonts } from "@/lib/reportFonts";

type Item = { id: string; n: string; label: string };

/**
 * The "In this report" rail. Built from the sections that actually rendered
 * (every report Section and the verdict carry data-report-section), so it can
 * only ever list what this report contains — never a section the data didn't
 * support. Watches the report for changes, because the authenticated view
 * renders the document after hydration.
 *
 * It sits on the page, outside the always-light report sheet, so it uses the
 * theme-aware ink greys rather than the light-only --report-* tokens.
 */
export function ReportToc({ targetId, children }: { targetId: string; children?: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const scan = () =>
      setItems(
        Array.from(target.querySelectorAll<HTMLElement>("[data-report-section]")).map((el) => ({
          id: el.id,
          n: el.dataset.reportSection ?? "",
          label: el.dataset.reportLabel ?? "",
        }))
      );
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(target, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [targetId]);

  function go(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: reduce ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav
      aria-label="In this report"
      className={`${reportFonts} no-print sticky top-[84px] hidden w-[210px] shrink-0 flex-col gap-0.5 font-report min-[1080px]:flex`}
    >
      <p className="px-3 pb-2.5 font-report-mono text-[11px] uppercase tracking-[0.08em] text-ink-500">In this report</p>
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          onClick={(e) => go(e, it.id)}
          className="flex items-baseline gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <span className="w-4 shrink-0 font-report-mono text-[11px] text-ink-500">{it.n}</span>
          <span className="min-w-0">{it.label}</span>
        </a>
      ))}
      {children && <div className="mt-4 flex flex-col gap-2 border-t border-ink-200 px-3 pt-3.5">{children}</div>}
    </nav>
  );
}
