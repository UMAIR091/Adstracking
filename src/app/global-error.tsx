"use client";

// Catches errors in the ROOT layout itself (which the per-segment error.tsx
// can't) and reports them to Sentry. Must render its own <html>/<body> because
// it replaces the whole document on a root error.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "0 1rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#0f172a" }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: "#64748b" }}>
            An unexpected error occurred. Please try again — it&apos;s usually temporary.
          </p>
          <button
            onClick={() => reset()}
            style={{ marginTop: 20, padding: "10px 20px", fontSize: 14, fontWeight: 500, color: "#fff", background: "#4f46e5", border: 0, borderRadius: 8, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
