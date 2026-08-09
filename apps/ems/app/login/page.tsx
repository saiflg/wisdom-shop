import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBranding } from "@/lib/branding-server";
import { LoginForm } from "./login-form";
import { SchoolMark } from "@/components/school-mark";

export const metadata: Metadata = {
  title: "Sign in — Wisdom Campus",
  description: "Sign in to your school's Wisdom Campus dashboard.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { schoolSlug?: string };
}) {
  // The host is asked first; the slug is the fallback for deployments with no
  // base domain and for the shop's handoff links, which carry it explicitly.
  //
  // Taken from the middleware's header rather than straight from
  // `searchParams`, so this page and the root layout can never resolve
  // different schools — that mismatch is exactly what produced a page
  // wearing one school's name in the platform's default colours.
  const { branding } = await getBranding(
    headers().get("x-school-slug") ?? searchParams.schoolSlug,
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16">
      {branding ? (
        <>
          <SchoolMark branding={branding} size="lg" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">{branding.schoolName}</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {branding.tagline ?? "Sign in to your school's dashboard."}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Sign in to manage your school&apos;s classes, students and teachers.
          </p>
        </>
      )}
      {/* When the school is already known, the form carries its slug rather
          than asking for it — but it is still sent to the API, which goes on
          requiring it. The hostname decides which login page you are looking
          at; it is never what proves who you are. */}
      <LoginForm
        defaultSchoolSlug={branding?.schoolSlug ?? searchParams.schoolSlug}
        schoolKnown={branding !== null}
      />
    </main>
  );
}
