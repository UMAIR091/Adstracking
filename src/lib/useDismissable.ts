"use client";

import { useEffect, useRef, type RefObject } from "react";

// Consistent open-menu behavior across the app (audit P2 #9): closes on outside
// click and on Escape, and restores focus to the trigger when it closes.
//
// Usage:
//   const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
//   return <div ref={ref}>…menu…</div>
// Put the ref on the menu's outer container (ideally wrapping the trigger too,
// so clicking the trigger to toggle isn't treated as an "outside" click).
// A menu portaled out of that container passes its own ref as `panel`, so
// clicks inside it don't count as outside either.
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  panel?: RefObject<HTMLElement | null>
) {
  const ref = useRef<T>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember what was focused when the menu opened, to restore on close.
    triggerRef.current = document.activeElement as HTMLElement | null;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (panel?.current?.contains(target)) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      // Restore focus to the trigger element on close (keyboard users don't lose
      // their place).
      triggerRef.current?.focus?.();
    };
  }, [open, onClose, panel]);

  return ref;
}
