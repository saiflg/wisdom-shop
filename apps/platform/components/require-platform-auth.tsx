"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePlatformAuthStore } from "@/store/platform-auth-store";

/**
 * The session lives in memory only — there is no silent refresh in this
 * portal yet, so a reload returns the operator to the login screen. That is
 * a deliberate trade for an operator console: short-lived access with no
 * persisted platform token is the safer default, and adding refresh here
 * means re-doing the cookie plumbing the school portal has.
 */
export function RequirePlatformAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = usePlatformAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== "authenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;
  return <>{children}</>;
}
