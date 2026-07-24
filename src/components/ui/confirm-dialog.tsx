"use client";

// Promise-based confirmation dialog — a branded, accessible replacement for the
// native window.confirm(). Mount <ConfirmProvider> once (in the dashboard
// layout); call const confirm = useConfirm() anywhere under it and
// `if (!(await confirm({ ... }))) return;` exactly where window.confirm() used
// to sit.
//
// Accessibility: role="alertdialog", labelled + described by its title/body,
// Escape and backdrop-click cancel, focus moves into the dialog on open and is
// restored to the trigger on close, and Tab is trapped within the dialog.
import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). Default false. */
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ ...opts, resolve }));
  }, []);

  const close = React.useCallback(
    (ok: boolean) => {
      setPending((p) => {
        p?.resolve(ok);
        return null;
      });
    },
    []
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmModal pending={pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmModal({ pending, onClose }: { pending: Pending; onClose: (ok: boolean) => void }) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Focus the confirm button on open; restore focus to the previously focused
  // element on close.
  React.useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    confirmBtnRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  // Escape cancels; Tab is trapped within the dialog.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      // Backdrop click cancels (only when the backdrop itself is the target).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <div className="absolute inset-0 bg-ink-900/40 animate-fade-in" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={pending.description ? "confirm-desc" : undefined}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-ink-900">
          {pending.title}
        </h2>
        {pending.description && (
          <div id="confirm-desc" className="mt-2 text-sm leading-relaxed text-ink-600">
            {pending.description}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onClose(false)}>
            {pending.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            ref={confirmBtnRef}
            variant={pending.destructive ? "destructive" : "default"}
            onClick={() => onClose(true)}
          >
            {pending.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
