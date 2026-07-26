import { Brand } from "@/components/Brand";
import { Wrench } from "lucide-react";

export const metadata = { title: "Under maintenance · ReportFlow", robots: { index: false } };

export default function MaintenancePage() {
  const message = process.env.NEXT_PUBLIC_INCIDENT_MESSAGE;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="mb-6"><Brand className="text-lg" /></div>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Wrench size={26} />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-ink-900">We&apos;ll be right back</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        {message || "ReportFlow is undergoing scheduled maintenance to make things better. Your data is safe and we'll be back online shortly."}
      </p>
    </main>
  );
}
