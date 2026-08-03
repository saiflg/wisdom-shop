import { LoginForm } from "./login-form";

export default function PlatformLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-platform-500">Platform console</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Wisdom Campus</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Operator access only. School staff sign in through their own school portal.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
