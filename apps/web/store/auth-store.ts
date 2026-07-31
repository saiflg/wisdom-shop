import { create } from "zustand";

export interface SessionUser {
  id: string;
  email: string;
  roles: string[];
}

interface AuthState {
  accessToken: string | null;
  user: SessionUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setSession: (accessToken: string, user: SessionUser) => void;
  clearSession: () => void;
  setStatus: (status: AuthState["status"]) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  setSession: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  clearSession: () => set({ accessToken: null, user: null, status: "unauthenticated" }),
  setStatus: (status) => set({ status }),
}));
