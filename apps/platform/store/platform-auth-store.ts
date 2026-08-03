import { create } from "zustand";

export interface PlatformSessionUser {
  id: string;
  roles: string[];
}

interface PlatformAuthState {
  accessToken: string | null;
  user: PlatformSessionUser | null;
  status: "idle" | "authenticated" | "unauthenticated";
  setSession: (accessToken: string, user: PlatformSessionUser) => void;
  clearSession: () => void;
}

/**
 * Entirely separate from the school portal's auth store, and running on its
 * own origin — a platform token is never reachable from school-portal
 * JavaScript, and the two token families are signed with different secrets
 * server-side.
 */
export const usePlatformAuthStore = create<PlatformAuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  setSession: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  clearSession: () => set({ accessToken: null, user: null, status: "unauthenticated" }),
}));

export function platformAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
