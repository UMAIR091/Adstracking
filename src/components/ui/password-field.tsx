"use client";

// Reusable password input (audit P1 #7): show/hide toggle, live strength meter,
// and a real-time requirements checklist. Used on signup and password-reset.
import { useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { passwordChecks, type PasswordChecks } from "@/lib/password";

// Re-exported for existing import sites (forms import from here).
export { passwordChecks, type PasswordChecks };

const STRENGTH = [
  { label: "Too short", color: "bg-danger-400", text: "text-danger-600" },
  { label: "Weak", color: "bg-danger-400", text: "text-danger-600" },
  { label: "Fair", color: "bg-warning-400", text: "text-warning-600" },
  { label: "Good", color: "bg-success-400", text: "text-success-600" },
  { label: "Strong", color: "bg-success-500", text: "text-success-600" },
];

const inputClass =
  "field w-full py-2 pr-10";

export function PasswordField({
  value,
  onChange,
  id = "password",
  label = "Password",
  autoComplete = "new-password",
  showMeter = true,
  placeholder = "At least 8 characters",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  label?: string;
  autoComplete?: string;
  showMeter?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const c = passwordChecks(value);
  const strength = STRENGTH[value.length === 0 ? 0 : Math.max(1, c.score)];

  return (
    <div>
      {label ? (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-700">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          aria-describedby={showMeter ? `${id}-reqs` : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-700 focus-ring"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {showMeter && value.length > 0 && (
        <div id={`${id}-reqs`} className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-full flex-1 rounded-full transition-colors ${i < c.score ? strength.color : "bg-ink-200"}`}
                />
              ))}
            </div>
            <span className={`text-xs font-medium ${strength.text}`}>{strength.label}</span>
          </div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            <Req ok={c.length}>8+ characters</Req>
            <Req ok={c.letter}>A letter</Req>
            <Req ok={c.number}>A number</Req>
          </ul>
        </div>
      )}
    </div>
  );
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${ok ? "text-success-600" : "text-ink-500"}`}>
      {ok ? <Check size={13} className="shrink-0" /> : <X size={13} className="shrink-0 text-ink-400" />}
      {children}
    </li>
  );
}
