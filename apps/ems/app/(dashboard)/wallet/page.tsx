"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import {
  ENTRY_KINDS,
  toMinorUnits,
  usePortalChildren,
  useRecordWalletEntry,
  useWalletStatement,
  type WalletEntry,
  type WalletEntryKind,
} from "@/lib/use-wallet";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useMoney } from "@/lib/i18n/use-money";
import { formattingLocale } from "@/lib/i18n/formatting";

/**
 * Money a family has placed with the school for a child to draw on.
 *
 * Staff pick any student; a parent or student sees only their own, which the
 * API enforces independently — this screen narrowing the list is a courtesy,
 * not the security boundary.
 */
export default function WalletPage() {
  const { t } = useTranslation();
  const isStaff = useCanAuthor();
  const { data: students } = useStudents();
  const { data: children, isError: portalUnavailable } = usePortalChildren(!isStaff);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);

  const options = isStaff
    ? (students ?? []).map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` }))
    : (children ?? []).map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName}` }));

  // A family with one child should not be asked to choose it.
  const only = options.length === 1 ? options[0] : undefined;
  const chosen = studentProfileId ?? only?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("wallet.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("wallet.intro")}
        </p>
      </div>

      {!isStaff && portalUnavailable && (
        <p className="text-sm text-amber-600">
          {t("shared.portalOff")}
        </p>
      )}

      {options.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isStaff ? t("shared.student") : t("shared.child")}
          <select
            value={chosen ?? ""}
            onChange={(event) => setStudentProfileId(event.target.value || null)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">{t("shared.choose")}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {chosen ? (
        <WalletPanel studentProfileId={chosen} isStaff={isStaff} />
      ) : (
        options.length > 1 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("wallet.chooseSomeone")}</p>
        )
      )}
    </div>
  );
}

function WalletPanel({ studentProfileId, isStaff }: { studentProfileId: string; isStaff: boolean }) {
  const formatAmount = useMoney();
  const { t, locale } = useTranslation();
  const { data, isLoading } = useWalletStatement(studentProfileId);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("wallet.balance")}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatAmount(data.wallet.balanceCents)}</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {data.wallet.student.user.firstName} {data.wallet.student.user.lastName}
        </p>
      </section>

      {isStaff && <RecordEntry studentProfileId={studentProfileId} />}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("wallet.statement")}</h2>
        {data.entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t("wallet.nothingMoved")}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
            {data.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EntryRow({ entry }: { entry: WalletEntry }) {
  const formatAmount = useMoney();
  const { locale } = useTranslation();
  const credit = entry.amountCents > 0;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{entry.description}</p>
        <p className="text-xs text-slate-500">
          {new Date(entry.createdAt).toLocaleString(formattingLocale(locale))} · {entry.recordedByName}
          {/* Shown because it is the thing a parent quotes back when they
              disagree about whether a payment landed. */}
          {entry.reference && ` · ref ${entry.reference}`}
        </p>
      </div>
      <div className="text-end">
        <p className={`text-sm font-semibold tabular-nums ${credit ? "text-emerald-600" : "text-slate-900 dark:text-slate-100"}`}>
          {credit ? "+" : ""}
          {formatAmount(entry.amountCents)}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">balance {formatAmount(entry.balanceAfterCents)}</p>
      </div>
    </li>
  );
}

function RecordEntry({ studentProfileId }: { studentProfileId: string }) {
  const { t } = useTranslation();
  const record = useRecordWalletEntry(studentProfileId);
  const [kind, setKind] = useState<WalletEntryKind>("TOPUP");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const minor = toMinorUnits(amount);
  const valid = Number.isInteger(minor) && minor > 0 && description.trim().length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNote(null);
    try {
      const result = await record.mutateAsync({
        kind,
        amountCents: minor,
        description: description.trim(),
        reference: reference.trim() || undefined,
      });
      // Said out loud. A bursar who clicks twice needs to know the second
      // click moved nothing, or they will go looking for the missing money.
      setNote(
        result.duplicate
          ? t("wallet.duplicateReference")
          : t("wallet.recorded"),
      );
      setAmount("");
      setDescription("");
      setReference("");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("wallet.recordFailed"));
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("wallet.recordMovement")}</h2>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          {t("shared.kind")}
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as WalletEntryKind)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {ENTRY_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {t("shared.amount")}
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="5000.00"
            className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="min-w-[14rem] flex-1 text-xs text-slate-500">
          {t("wallet.whatFor")}
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            placeholder={t("wallet.descriptionPlaceholder")}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Reference (optional)
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={120}
            placeholder={t("wallet.referencePlaceholder")}
            className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {ENTRY_KINDS.find((option) => option.value === kind)?.hint}
        {t("wallet.kindDecides")}
      </p>

      <button
        type="submit"
        disabled={record.isPending || !valid}
        className="mt-3 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {record.isPending ? t("wallet.recording") : t("wallet.record")}
      </button>
      {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </form>
  );
}
