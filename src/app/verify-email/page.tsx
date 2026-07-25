import { VerifyEmail } from "@/components/VerifyEmail";

export const metadata = { title: "Verify your email · ReportFlow" };

export default function VerifyEmailPage({ searchParams }: { searchParams: { email?: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <VerifyEmail email={searchParams.email ?? ""} />
    </main>
  );
}
