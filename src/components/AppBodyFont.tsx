"use client";

import { useEffect } from "react";

// Dialogs portalled into <body> (confirm, feedback, connect, cancel) sit outside
// the `.app-root` wrapper that carries the Geist font variables, so the layout
// also puts those variable classes on <body> while the app is mounted.
// globals.css reads them there (with a fallback until this runs).
export function AppBodyFont({ className }: { className: string }) {
  useEffect(() => {
    const classes = className.split(" ").filter(Boolean);
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [className]);
  return null;
}
