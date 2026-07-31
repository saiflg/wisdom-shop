"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCreateUser } from "@/lib/use-settings";
import { useAuthStore } from "@/store/auth-store";

/** Mirrors the server: VENDOR follows vendor approval and is refused here. */
const ASSIGNABLE_ROLES = ["SUPPORT", "EDITOR", "MANAGER", "AFFILIATE", "ADMIN", "SUPER_ADMIN", "DEVELOPER"];
const PRIVILEGED = ["ADMIN", "SUPER_ADMIN", "DEVELOPER"];

export function CreateUserForm() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.roles.includes("SUPER_ADMIN") ?? false;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "",
    markEmailVerified: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const create = useCreateUser();
  const availableRoles = ASSIGNABLE_ROLES.filter((r) => isSuperAdmin || !PRIVILEGED.includes(r));

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setCreated(null);

    try {
      const result = await create.mutateAsync({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        roles: form.role ? [form.role] : [],
        markEmailVerified: form.markEmailVerified,
      });
      setCreated(result.email);
      setForm({ email: "", password: "", firstName: "", lastName: "", role: "", markEmailVerified: true });
    } catch (err) {
      // The server explains refusals (duplicate email, escalation, weak
      // password) — show its wording rather than inventing one.
      setError(err instanceof ApiError ? err.message : "Couldn't create that user.");
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Create user
        </button>
        {created && (
          <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Created {created}.
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
    >
      <h2 className="text-lg font-semibold">Create a user</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        For staff who will never register publicly, or an account made on a customer&apos;s
        behalf. The password rules are the same as public sign-up.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cu-first" className="block text-sm font-medium">First name</label>
          <input
            id="cu-first"
            required
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="cu-last" className="block text-sm font-medium">Last name</label>
          <input
            id="cu-last"
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="cu-email" className="block text-sm font-medium">Email</label>
          <input
            id="cu-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="cu-password" className="block text-sm font-medium">Password</label>
          <input
            id="cu-password"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={`mt-1.5 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-slate-500">
            At least 10 characters with upper and lower case, a number and a symbol.
          </p>
        </div>
        <div>
          <label htmlFor="cu-role" className="block text-sm font-medium">Role (optional)</label>
          <select
            id="cu-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className={`mt-1.5 ${inputClass}`}
          >
            <option value="">Customer only</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role.toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {!isSuperAdmin && (
            <p className="mt-1 text-xs text-slate-500">Only a super admin can assign admin-level roles.</p>
          )}
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.markEmailVerified}
              onChange={(e) => setForm({ ...form, markEmailVerified: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            Mark email as already verified
          </label>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Creating…" : "Create user"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
