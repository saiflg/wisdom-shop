"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useCreateSchool, useSchools } from "@/lib/use-schools";
import { StatusBadge } from "@/components/status-badge";

export default function SchoolsPage() {
  const { data: schools, isLoading, error } = useSchools();
  const createSchool = useCreateSchool();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      await createSchool.mutateAsync({
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
        adminEmail: String(form.get("adminEmail") ?? ""),
        adminPassword: String(form.get("adminPassword") ?? ""),
        adminFirstName: String(form.get("adminFirstName") ?? ""),
        adminLastName: String(form.get("adminLastName") ?? ""),
      });
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't onboard that school.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Every school runs in its own database. This console manages their lifecycle — never their day-to-day
            records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-platform-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-800"
        >
          {showForm ? "Cancel" : "Onboard school"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" name="name" required />
            <Field label="Slug" name="slug" required placeholder="demo-academy" />
            <Field label="Admin first name" name="adminFirstName" required />
            <Field label="Admin last name" name="adminLastName" required />
            <Field label="Admin email" name="adminEmail" type="email" required />
            <Field label="Admin password" name="adminPassword" type="password" required />
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <p className="text-xs text-slate-500">
            Creates the school&apos;s database, applies migrations and seeds its first admin. This can take a few
            seconds.
          </p>
          <button
            type="submit"
            disabled={createSchool.isPending}
            className="rounded-lg bg-platform-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-800 disabled:opacity-60"
          >
            {createSchool.isPending ? "Provisioning…" : "Onboard"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error.message}
        </p>
      )}

      {schools && schools.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No schools yet.</p>}

      {schools && schools.length > 0 && (
        <ul className="space-y-2">
          {schools.map((school) => (
            <li
              key={school.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-5 py-4 dark:border-slate-800"
            >
              <div className="min-w-0">
                <Link href={`/schools/${school.id}`} className="font-medium hover:underline">
                  {school.name}
                </Link>
                <p className="truncate text-sm text-slate-500">
                  {school.slug} · {school.databaseName}
                  {school.licenseKey && " · from shop license"}
                </p>
              </div>
              <StatusBadge status={school.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>
  );
}
