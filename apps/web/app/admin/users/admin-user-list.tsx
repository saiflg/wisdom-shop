"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAdminUsers, useGrantRole, useRevokeRole } from "@/lib/use-admin";
import { useAuthStore } from "@/store/auth-store";
import { CreateUserForm } from "./create-user-form";

/**
 * VENDOR is deliberately absent: it follows vendor approval and the server
 * refuses to assign it here, so offering it would only produce a 403.
 */
const ASSIGNABLE_ROLES = [
  "SUPPORT",
  "EDITOR",
  "MANAGER",
  "AFFILIATE",
  "ADMIN",
  "SUPER_ADMIN",
  "DEVELOPER",
];

/** Roles only a SUPER_ADMIN may manage — mirrors the server's policy. */
const PRIVILEGED = ["ADMIN", "SUPER_ADMIN", "DEVELOPER"];

export function AdminUserList() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selectedRole, setSelectedRole] = useState("SUPPORT");
  const [actionError, setActionError] = useState<string | null>(null);

  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.roles.includes("SUPER_ADMIN") ?? false;

  const { data, isLoading, error } = useAdminUsers(applied || undefined);
  const grant = useGrantRole();
  const revoke = useRevokeRole();

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      // The server explains refusals (escalation, self-lockout, derived
      // roles) — show its message rather than inventing one.
      setActionError(err instanceof ApiError ? err.message : "That change was refused.");
    }
  }

  const availableRoles = ASSIGNABLE_ROLES.filter((r) => isSuperAdmin || !PRIVILEGED.includes(r));

  return (
    <div className="space-y-5">
      <CreateUserForm />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
        }}
        className="flex flex-wrap gap-3"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search users"
          className={`${inputClass} min-w-[16rem] flex-1`}
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="role-to-grant" className="text-sm text-slate-600 dark:text-slate-400">
          Role to grant:
        </label>
        <select
          id="role-to-grant"
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className={inputClass}
        >
          {availableRoles.map((role) => (
            <option key={role} value={role}>
              {role.toLowerCase().replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {!isSuperAdmin && (
          <span className="text-xs text-slate-500">
            Only a super admin can manage admin-level roles.
          </span>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading users…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load users: {error.message}
        </p>
      )}

      {data && data.data.length > 0 && (
        <ul className="space-y-3">
          {data.data.map((user) => (
            <li key={user.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {user.firstName} {user.lastName}
                    {user.id === currentUser?.id && (
                      <span className="ml-2 text-xs text-slate-500">(you)</span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {user.emailVerifiedAt ? "Email verified" : "Email unverified"}
                    {user.twoFactorEnabled && " · 2FA on"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => grant.mutateAsync({ userId: user.id, role: selectedRole }))}
                  disabled={grant.isPending}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                >
                  Grant {selectedRole.toLowerCase().replace(/_/g, " ")}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium dark:border-slate-800"
                  >
                    {role.toLowerCase().replace(/_/g, " ")}
                    {role !== "CUSTOMER" && role !== "VENDOR" && (
                      <button
                        type="button"
                        onClick={() => run(() => revoke.mutateAsync({ userId: user.id, role }))}
                        disabled={revoke.isPending}
                        aria-label={`Revoke ${role}`}
                        className="text-red-600 disabled:opacity-60 dark:text-red-400"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
