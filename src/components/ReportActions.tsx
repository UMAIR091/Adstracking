"use client";

import { useState } from "react";
import { Printer, Link2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ReportActions({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      setCopied(true);
      toast.success("Share link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <div className="no-print flex items-center gap-2">
      <Button variant="outline" onClick={copy}>
        {copied ? <Check size={16} /> : <Link2 size={16} />} {copied ? "Copied" : "Copy share link"}
      </Button>
      <Button onClick={() => window.print()}>
        <Printer size={16} /> Download PDF
      </Button>
    </div>
  );
}
