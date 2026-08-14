import type { Metadata } from "next";
import { getBranding } from "@/lib/branding-server";
import { SchoolMark } from "@/components/school-mark";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = {
  title: "Set up your account — Wisdom Campus",
  // Nothing here should ever be indexed or previewed: the URL is the
  // credential, and a link preview is a copy of it on somebody else's server.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: { schoolSlug: string; token: string };
}) {
  const { branding } = await getBranding(params.schoolSlug);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16">
      {branding ? (
        <>
          <SchoolMark branding={branding} size="lg" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">{branding.schoolName}</h1>
        </>
      ) : (
        <h1 className="text-3xl font-bold tracking-tight">Wisdom Campus</h1>
      )}

      {/* The token is handed to a client component rather than used here, so
          the password is typed and sent from the browser and never travels
          through this server's request log on its way to the API. */}
      <AcceptInviteForm schoolSlug={params.schoolSlug} token={params.token} />
    </main>
  );
}
