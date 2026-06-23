export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-ink-900 ${className}`}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v18h18" />
          <rect x="7" y="11" width="3" height="6" rx="1" />
          <rect x="12" y="7" width="3" height="10" rx="1" />
          <rect x="17" y="13" width="3" height="4" rx="1" />
        </svg>
      </span>
      ReportFlow
    </span>
  );
}
