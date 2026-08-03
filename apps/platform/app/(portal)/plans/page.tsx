"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { formatMoney, usePlans, useCreatePlan, useUpdatePlan, type Plan } from "@/lib/use-billing";

export default function PlansPage() {
  const { data: plans, isLoading, error } = usePlans();
  const createPlan = useCreatePlan();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const major = Number(form.get("priceMajor") ?? 0);
    try {
      await createPlan.mutateAsync({
        code: String(form.get("code") ?? ""),
        name: String(form.get("name") ?? ""),
        // Converted to minor units here, at the boundary, and kept integer
        // everywhere after — Math.round guards against 45.10 * 100 = 4509.999.
        priceCents: Math.round(major * 100),
        currency: String(form.get("currency") ?? "NGN").toUpperCase(),
        interval: String(form.get("interval") ?? "MONTHLY"),
        ...(form.get("maxStudents") ? { maxStudents: Number(form.get("maxStudents")) } : {}),
      });
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that plan.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Repricing a plan only affects new subscriptions — existing customers keep the price they signed up at.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="shrink-0 rounded-lg bg-platform-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-800"
        >
          {showForm ? "Cancel" : "New plan"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" name="code" required placeholder="growth" />
            <Field label="Name" name="name" required placeholder="Growth" />
            <Field label="Price" name="priceMajor" type="number" step="0.01" min="0" required placeholder="45000.00" />
            <Field label="Currency" name="currency" required placeholder="NGN" maxLength={3} />
            <div>
              <label htmlFor="interval" className="block text-sm font-medium">
                Interval
              </label>
              <select
                id="interval"
                name="interval"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <Field label="Max students (blank = unlimited)" name="maxStudents" type="number" min="1" />
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={createPlan.isPending}
            className="rounded-lg bg-platform-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-800 disabled:opacity-60"
          >
            Create plan
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error.message}
        </p>
      )}
      {plans && plans.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No plans yet.</p>}

      {plans && plans.length > 0 && (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const update = useUpdatePlan(plan.id);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-5 py-4 dark:border-slate-800">
      <div className="min-w-0">
        <p className="font-medium">
          {plan.name}
          <span className="ml-2 font-mono text-xs text-slate-500">{plan.code}</span>
        </p>
        <p className="text-sm text-slate-500">
          {formatMoney(plan.priceCents, plan.currency)} / {plan.interval.toLowerCase()}
          {plan.maxStudents ? ` · up to ${plan.maxStudents} students` : " · unlimited students"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={
            plan.isActive
              ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }
        >
          {plan.isActive ? "Active" : "Retired"}
        </span>
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ isActive: !plan.isActive })}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          {plan.isActive ? "Retire" : "Reinstate"}
        </button>
      </div>
    </li>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  step,
  min,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  maxLength?: number;
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
        step={step}
        min={min}
        maxLength={maxLength}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-slate-700 dark:bg-slate-900"
      />
    </div>
  );
}
