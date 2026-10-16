import { VerifyEmail } from "@/components/VerifyEmail";

export const metadata = { title: "Verify your email · Anavyst" };

export default async function VerifyEmailPage(props: { searchParams: Promise<{ email?: string; from?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <VerifyEmail email={searchParams.email ?? ""} justSent={searchParams.from !== "login"} />
    </main>
  );
}
