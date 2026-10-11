import Link from "next/link";

// Consent line shown under the login/signup form — required disclosure that
// creating an account accepts the legal terms.
export function AuthLegalNote() {
  return (
    <p className="mt-6 max-w-[440px] text-center text-xs leading-[1.55] text-site-muted">
      By continuing you agree to our{" "}
      <Link href="/terms" className="font-medium text-site-muted hover:text-site-fg hover:underline">Terms of Service</Link>{" "}
      and{" "}
      <Link href="/privacy" className="font-medium text-site-muted hover:text-site-fg hover:underline">Privacy Policy</Link>
      . Your data is only used to generate your reports and is never sold.
    </p>
  );
}
