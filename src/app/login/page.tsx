import { AuthForm } from "@/components/AuthForm";
import { AuthLegalNote } from "@/components/AuthLegalNote";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthForm mode="login" />
      <AuthLegalNote />
    </main>
  );
}
