"use client";

// Guided first-run onboarding (journey audit P0-2). Turns the empty "My Agency"
// workspace into a branded one BEFORE the first report, communicating the
// white-label value up front. Three short steps, skippable but shown once.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, Palette, Building2, Send, Sparkles, PartyPopper, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoUpload } from "@/components/LogoUpload";
import { track, ANALYTICS } from "@/lib/analytics";

const SWATCHES = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#0f172a"];
const LANGUAGES = [
  { code: "en", label: "English" }, { code: "es", label: "Español" }, { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" }, { code: "pt", label: "Português" }, { code: "nl", label: "Nederlands" }, { code: "it", label: "Italiano" },
];

type Agency = {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
  timezone: string | null;
  report_language: string | null;
};

export function OnboardingWizard({ agency }: { agency: Agency }) {
  const router = useRouter();
  const supabase = createClient();

  const detectedTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  }, []);
  const zones = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyIntl = Intl as any;
    const all: string[] = typeof anyIntl.supportedValuesOf === "function" ? anyIntl.supportedValuesOf("timeZone") : [];
    return all.length ? all : ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Australia/Sydney"];
  }, []);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(agency.name === "My Agency" ? "" : agency.name);
  const [logo, setLogo] = useState(agency.logo_url ?? "");
  const [color, setColor] = useState(agency.brand_color || "#4f46e5");
  const [senderName, setSenderName] = useState(agency.email_sender_name ?? "");
  const [replyTo, setReplyTo] = useState(agency.email_reply_to ?? "");
  const [timezone, setTimezone] = useState(agency.timezone ?? detectedTz);
  const [language, setLanguage] = useState(agency.report_language ?? "en");
  const [saving, setSaving] = useState(false);

  const STEPS = ["Your brand", "Report delivery", "You're set"];

  async function persist(extra: Record<string, unknown>) {
    const { error } = await supabase
      .from("agencies")
      .update({
        name: name.trim() || "My Agency",
        logo_url: logo || null,
        brand_color: color,
        email_sender_name: senderName.trim() || null,
        email_reply_to: replyTo.trim() || null,
        timezone,
        report_language: language,
        ...extra,
      })
      .eq("id", agency.id);
    if (error) throw new Error(error.message);
  }

  async function finish(target: string) {
    setSaving(true);
    try {
      await persist({ onboarding_completed_at: new Date().toISOString() });
      track(ANALYTICS.onboardingCompleted, { has_logo: !!logo });
      router.push(target);
      router.refresh();
    } catch (e) {
      setSaving(false);
      toast.error((e as Error).message || "Couldn't save. Please try again.");
    }
  }

  async function skip() {
    setSaving(true);
    try {
      // Skipping still marks onboarding done so the user isn't trapped, but keeps
      // whatever they've entered so far.
      await persist({ onboarding_completed_at: new Date().toISOString() });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setSaving(false);
      router.push("/dashboard");
    }
  }

  const canContinueStep0 = name.trim().length > 0 && !!logo; // minimum branding: name + logo

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Progress */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i < step ? "bg-brand-500 text-white" : i === step ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500" : "bg-ink-100 text-ink-500"}`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-brand-500" : "bg-ink-100"}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <Header icon={Building2} title="Make it yours" subtitle="Your logo and colour appear on every report, email and PDF — clients see your agency, never ReportFlow." />
            <div>
              <Label htmlFor="ob-name">Agency name</Label>
              <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Digital" autoFocus />
            </div>
            <div>
              <Label>Logo</Label>
              <LogoUpload value={logo} onChange={setLogo} folder={`agency-${agency.id}`} />
            </div>
            <div>
              <Label>Brand colour</Label>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button key={s} type="button" onClick={() => setColor(s)} aria-label={`Use ${s}`} className={`h-8 w-8 rounded-full ring-offset-2 transition ${color.toLowerCase() === s.toLowerCase() ? "ring-2 ring-ink-400" : ""}`} style={{ background: s }} />
                ))}
                <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
                  <Palette size={15} className="text-ink-500" />
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" aria-label="Custom colour" />
                </label>
              </div>
            </div>
            {!canContinueStep0 && (
              <p className="text-xs text-ink-500">Add your agency name and logo to continue — this is what makes your reports white-labeled.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Header icon={Send} title="How reports reach clients" subtitle="Set the sender clients see and your defaults. You can change all of this later in Settings." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="ob-sender">Sender name</Label>
                <Input id="ob-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder={name || "Your Agency"} />
                <p className="mt-1 text-xs text-ink-500">Shown as the email &quot;from&quot; name.</p>
              </div>
              <div>
                <Label htmlFor="ob-reply">Reply-to email</Label>
                <Input id="ob-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="you@agency.com" />
                <p className="mt-1 text-xs text-ink-500">Where client replies go.</p>
              </div>
              <div>
                <Label htmlFor="ob-tz">Timezone</Label>
                <select id="ob-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <p className="mt-1 text-xs text-ink-500">Used for scheduled delivery.</p>
              </div>
              <div>
                <Label htmlFor="ob-lang">Report language</Label>
                <select id="ob-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-ink-500">Language for AI-written insights.</p>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600">
              <PartyPopper size={26} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink-900">You&apos;re all set{name ? `, ${name}` : ""} 🎉</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">
                Your reports are now branded. Next: add a client and connect their Google Search Console, GA4 or Meta Ads — you&apos;ll have your first report in minutes.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-800"><Sparkles size={15} className="text-brand-500" /> What you get</div>
              <ul className="mt-2 space-y-1 text-sm text-ink-600">
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-500" /> AI-written executive summaries from real data</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-500" /> Scheduled, branded delivery on autopilot</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-500" /> Shareable live links + PDF exports</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-7 flex items-center justify-between">
          {step > 0 && step < 2 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={saving}><ArrowLeft size={16} /> Back</Button>
          ) : <span />}

          <div className="flex items-center gap-2">
            {step < 2 && (
              <Button variant="ghost" onClick={skip} disabled={saving} className="text-ink-500">Skip for now</Button>
            )}
            {step === 0 && (
              <Button onClick={() => setStep(1)} disabled={!canContinueStep0}>Continue <ArrowRight size={16} /></Button>
            )}
            {step === 1 && (
              <Button onClick={() => setStep(2)} disabled={saving}>Continue <ArrowRight size={16} /></Button>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => finish("/dashboard")} disabled={saving}>Go to dashboard</Button>
                <Button onClick={() => finish("/dashboard/clients/new")} disabled={saving}>{saving ? "Saving…" : "Add your first client"} <ArrowRight size={16} /></Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={20} />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{subtitle}</p>
      </div>
    </div>
  );
}
