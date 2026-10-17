"use client";

// The 1-minute walkthrough of connecting and disconnecting a data source
// (public/videos/connect-data-source.mp4, recorded from the real screens with
// demo data; captions are burned in, so it works muted). Two entry points: a
// card for empty states, where someone is about to connect their first source,
// and a small link for headers. Either opens the video in a dialog, with the
// same focus handling as the app's other dialogs.
import * as React from "react";
import { createPortal } from "react-dom";
import { PlayCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const HOW_TO_VIDEO = {
  src: "/videos/connect-data-source.mp4",
  poster: "/videos/connect-data-source.jpg",
  title: "How to connect a data source",
  length: "1 min",
};

export function HowToVideo({ variant = "link" }: { variant?: "card" | "link" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {variant === "card" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-surface p-3 text-left transition-colors hover:border-ink-300 focus-ring"
        >
          <span className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HOW_TO_VIDEO.poster} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-ink-900/20 transition-colors group-hover:bg-ink-900/30">
              <PlayCircle size={30} className="text-white drop-shadow" aria-hidden />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-900">{HOW_TO_VIDEO.title}</span>
            <span className="mt-0.5 block text-sm text-ink-500">
              A {HOW_TO_VIDEO.length} walkthrough: add a platform, sign in, pick the account, and disconnect one.
            </span>
          </span>
        </button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <PlayCircle size={15} aria-hidden /> Watch how · {HOW_TO_VIDEO.length}
        </Button>
      )}
      {open && <VideoDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function VideoDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("video")?.focus();
    return () => prev?.focus?.();
  }, [mounted]);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button, video, [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-overlay/60 animate-fade-in" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
          <h2 id="howto-title" className="text-sm font-semibold text-ink-900">
            {HOW_TO_VIDEO.title} · {HOW_TO_VIDEO.length}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <video
          src={HOW_TO_VIDEO.src}
          poster={HOW_TO_VIDEO.poster}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="block aspect-video w-full bg-black"
        >
          Your browser can&apos;t play this video.
        </video>
      </div>
    </div>,
    document.body
  );
}
