import Link from "next/link";

// Consent line shown under the login/signup form — required disclosure that
// creating an account accepts the legal terms.
export function AuthLegalNote() {
  return (
    <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-ink-400">
      By continuing you agree to our{" "}
      <Link href="/terms" className="font-medium text-ink-500 hover:text-ink-800 hover:underline">Terms of Service</Link>{" "}
      and{" "}
      <Link href="/privacy" className="font-medium text-ink-500 hover:text-ink-800 hover:underline">Privacy Policy</Link>
      . Your data is only used to generate your reports and is never sold.
    </p>
  );
}
