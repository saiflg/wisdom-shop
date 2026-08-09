"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Branding } from "./branding";

/**
 * The school this browser tab belongs to, resolved once on the server and
 * handed down.
 *
 * Read-only and never refetched on the client: the value comes from the
 * request's own hostname, so it cannot change without a navigation. A
 * client-side fetch would also mean every page briefly rendering the
 * default blue before repainting in the school's colour — the flash the
 * server-rendered <style> in layout.tsx exists to avoid.
 */
const BrandingContext = createContext<Branding | null>(null);

export function BrandingProvider({
  branding,
  children,
}: {
  branding: Branding | null;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

/** Null when the host identifies no school — callers show the platform's own name. */
export function useBranding(): Branding | null {
  return useContext(BrandingContext);
}
