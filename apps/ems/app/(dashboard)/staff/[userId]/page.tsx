"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { errorMessage } from "@/lib/api";
import {
  EMPLOYMENT_TYPES,
  useStaffMember,
  useUpsertStaffProfile,
  type EmploymentType,
  type StaffMember,
  type UpsertStaffProfileInput,
} from "@/lib/use-staff";
import { EMPLOYMENT_LABELS, employmentState, isTeaching } from "@/lib/staff-directory";
import { RevealAccountNumber } from "@/components/reveal-account-number";
import { SalaryEditor } from "@/components/salary-editor";

/** The API sends timestamps; a date input wants "2026-09-01". */
function dateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

interface Draft {
  staffNumber: string;
  jobTitle: string;
  employmentType: EmploymentType | "";
  startDate: string;
  endDate: string;
  bankName: string;
  bankCode: string;
  accountName: string;
}

function draftFrom(member: StaffMember): Draft {
  return {
    staffNumber: member.staffNumber ?? "",
    jobTitle: member.jobTitle ?? "",
    employmentType: member.employmentType ?? "",
    startDate: dateInputValue(member.startDate),
    endDate: dateInputValue(member.endDate),
    bankName: member.bank.bankName ?? "",
    bankCode: member.bank.bankCode ?? "",
    accountName: member.bank.accountName ?? "",
  };
}

export default function StaffRecordPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? "";
  const { data: member, isLoading, error } = useStaffMember(userId);

  if (!userId) return null;
  if (isLoading) return <p className="text-sm text-slate-500">Loading staff record…</p>;

  if (error || !member) {
    return (
      <div className="space-y-4">
        <Link href="/staff" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Staff directory
        </Link>
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load that staff record.")}
        </p>
      </div>
    );
  }

  return <StaffRecord member={member} />;
}

/**
 * One record, one draft, one save.
 *
 * The employment and bank sections are separate on screen but share the draft
 * deliberately: `PUT /v1/staff/:id` replaces the whole employment record, so a
 * form that sent only its own fields would silently blank the other section's.
 * The single exception is the account number, which is only sent when someone
 * has actually typed one — that field alone means "leave it alone" when absent.
 */
function StaffRecord({ member }: { member: StaffMember }) {
  const save = useUpsertStaffProfile(member.id);
  const state = employmentState(member, new Date());
  const fullName = `${member.firstName} ${member.lastName}`;

  const initial = useMemo(() => draftFrom(member), [member]);
  const [draft, setDraft] = useState<Draft>(initial);
  // Re-sync when the saved record comes back, so what is on screen is what the
  // server actually stored rather than what was typed at it.
  useEffect(() => setDraft(initial), [initial]);

  const [accountNumber, setAccountNumber] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = async (accountNumberPatch: Pick<UpsertStaffProfileInput, "accountNumber">, ok: string) => {
    setMessage(null);
    try {
      await save.mutateAsync({
        staffNumber: draft.staffNumber.trim(),
        jobTitle: draft.jobTitle.trim(),
        ...(draft.employmentType ? { employmentType: draft.employmentType } : {}),
        ...(draft.startDate ? { startDate: draft.startDate } : {}),
        ...(draft.endDate ? { endDate: draft.endDate } : {}),
        bankName: draft.bankName.trim(),
        bankCode: draft.bankCode.trim(),
        accountName: draft.accountName.trim(),
        ...accountNumberPatch,
      });
      setAccountNumber("");
      setMessage({ tone: "ok", text: ok });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err, "Couldn't save that record.") });
    }
  };

  const removeAccountNumber = () => {
    // An empty string clears; omitting the field leaves it alone. Asking first
    // because the two are one keystroke apart, and only the person whose
    // account it is can undo this.
    if (!window.confirm(`Remove the account number on file for ${fullName}?`)) return;
    void submit(
      { accountNumber: "" },
      "Account number removed. Payroll will skip them until a new one is entered.",
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/staff" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Staff directory
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{fullName}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {isTeaching(member) ? "Teaching staff" : "Non-teaching staff"}
          {member.email ? ` · ${member.email}` : ""}
          {state === "ENDED" ? " · no longer employed" : ""}
          {state === "FUTURE" ? " · has not started yet" : ""}
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Employment</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Staff number" value={draft.staffNumber} onChange={(staffNumber) => set({ staffNumber })} />
          <Text label="Job title" value={draft.jobTitle} onChange={(jobTitle) => set({ jobTitle })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Employment type
            <select
              value={draft.employmentType}
              onChange={(event) => set({ employmentType: event.target.value as EmploymentType | "" })}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Not stated</option>
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EMPLOYMENT_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <Text label="Start date" type="date" value={draft.startDate} onChange={(startDate) => set({ startDate })} />
          <Text label="End date" type="date" value={draft.endDate} onChange={(endDate) => set({ endDate })} />
        </div>

        <button
          type="button"
          onClick={() => void submit({}, "Saved.")}
          disabled={save.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save record"}
        </button>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bank details</h2>
          <p className="text-xs text-slate-500">
            {member.bank.hasAccountNumber ? `On file: ${member.bank.accountNumberMasked}` : "No account number on file"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Bank" value={draft.bankName} onChange={(bankName) => set({ bankName })} />
          <Text label="Bank / sort code" value={draft.bankCode} onChange={(bankCode) => set({ bankCode })} />
          <Text label="Name on the account" value={draft.accountName} onChange={(accountName) => set({ accountName })} />
        </div>

        <Text
          label={member.bank.hasAccountNumber ? "Replace the account number" : "Account number"}
          value={accountNumber}
          onChange={setAccountNumber}
          inputMode="numeric"
          autoComplete="off"
          placeholder={member.bank.hasAccountNumber ? (member.bank.accountNumberMasked ?? "") : "0123456789"}
          hint="Digits only. Stored encrypted, and shown back only as the last four."
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void submit(
                accountNumber.trim() ? { accountNumber: accountNumber.trim() } : {},
                accountNumber.trim() ? "Saved." : "Saved. The account number was left as it was.",
              )
            }
            disabled={save.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save bank details"}
          </button>
          {member.bank.hasAccountNumber && (
            <button
              type="button"
              onClick={removeAccountNumber}
              disabled={save.isPending}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-red-950/30"
            >
              Remove
            </button>
          )}
        </div>

        {member.bank.hasAccountNumber && <RevealAccountNumber userId={member.id} staffName={member.firstName} />}

        <p className="text-xs text-slate-500">
          Every reveal is recorded in the{" "}
          <Link href="/staff/access-log" className="font-semibold text-brand-600 hover:underline">
            bank-detail access log
          </Link>
          , including the ones a payroll bank file makes.
        </p>
      </section>

      {message && (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
          }
        >
          {message.text}
        </p>
      )}

      <SalaryEditor userId={member.id} />
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  placeholder?: string;
  inputMode?: "numeric";
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        {...rest}
      />
      {hint && <p className="mt-1 text-xs font-normal text-slate-500">{hint}</p>}
    </label>
  );
}
