"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, errorMessage } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useAuthStore } from "@/store/auth-store";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const TYPES: { value: string; key: TranslationKey }[] = [
  { value: "ANNUAL", key: "leave.typeANNUAL" },
  { value: "SICK", key: "leave.typeSICK" },
  { value: "MATERNITY", key: "leave.typeMATERNITY" },
  { value: "PATERNITY", key: "leave.typePATERNITY" },
  { value: "COMPASSIONATE", key: "leave.typeCOMPASSIONATE" },
  { value: "STUDY", key: "leave.typeSTUDY" },
  { value: "UNPAID", key: "leave.typeUNPAID" },
];

interface LeaveRequest {
  id: string;
  userId: string;
  typeLabel: string;
  type: string;
  dates: string;
  workingDays: number;
  reason: string | null;
  status: "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELLED";
  decidedByName: string | null;
  decisionNote: string | null;
  canCancel: boolean;
  staffName?: string;
}

interface Balance {
  entitlementDays: number;
  takenDays: number;
  pendingDays: number;
  remainingDays: number;
  untracked: boolean;
  summary: string;
}

const TONE: Record<LeaveRequest["status"], string> = {
  REQUESTED: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/**
 * Asking for time off, and the office answering.
 *
 * One screen for both, because in a school they are usually the same person's
 * job on different days. What each sees differs: everybody sees their own
 * balance and history; an administrator additionally sees what is waiting and
 * who will be away.
 */
export default function LeavePage() {
  const { t } = useTranslation();
  const { accessToken, enabled } = useAuthQueryState();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.roles.includes("SCHOOL_ADMIN") ?? false;
  const queryClient = useQueryClient();

  const [type, setType] = useState("ANNUAL");
  const [fromDate, setFrom] = useState("");
  const [toDate, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: ["leave", "mine", user?.id],
    enabled: enabled && Boolean(user?.id),
    queryFn: () =>
      apiFetch<{ balance: Balance; requests: LeaveRequest[] }>(`/v1/staff/${user!.id}/leave`, {
        headers: authHeaders(accessToken),
      }),
  });

  const office = useQuery({
    queryKey: ["leave", "overview"],
    enabled: enabled && isAdmin,
    queryFn: () =>
      apiFetch<{ pending: LeaveRequest[]; upcoming: LeaveRequest[]; pendingDays: number }>("/v1/staff/leave", {
        headers: authHeaders(accessToken),
      }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["leave"] });
  };

  const ask = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch("/v1/staff/leave", { method: "POST", headers: authHeaders(accessToken), body }),
    onSuccess: refresh,
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiFetch(`/v1/staff/leave/${id}/decide`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { approve },
      }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/staff/leave/${id}/cancel`, { method: "PATCH", headers: authHeaders(accessToken) }),
    onSuccess: refresh,
  });

  const submit = async () => {
    setProblem(null);
    try {
      await ask.mutateAsync({ type, fromDate, toDate, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setFrom("");
      setTo("");
      setReason("");
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't send that request."));
    }
  };

  const balance = mine.data?.balance;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("leave.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("leave.intro")}
        </p>
      </div>

      {balance && (
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("leave.yourAllowance")}</p>
          <p className="mt-1 text-lg font-bold">{balance.summary}</p>
          {balance.untracked && (
            <p className="mt-1 text-xs text-slate-500">
              {t("leave.noAllowance")}
            </p>
          )}
          {!balance.untracked && balance.remainingDays < 0 && (
            <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {t("leave.overAllowance")}
            </p>
          )}
        </div>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <p className="font-semibold">{t("leave.askForTimeOff")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">
            {t("leave.kind")}
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>{t(option.key)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            {t("leave.firstDay")}
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFrom(event.target.value);
                if (toDate < event.target.value) setTo(event.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <label className="text-sm font-medium">
            {t("leave.lastDay")}
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          {type === "UNPAID" ? t("leave.whyUnpaid") : t("leave.anythingToKnow")}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        {problem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={ask.isPending || !fromDate || !toDate}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {ask.isPending ? t("leave.sending") : t("leave.sendRequest")}
        </button>
      </section>

      {isAdmin && office.data && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("leave.waitingForDecision")}
            {office.data.pendingDays > 0 && (
              <span className="ms-2 font-normal normal-case text-slate-400">
                {office.data.pendingDays} days in total
              </span>
            )}
          </h2>
          {office.data.pending.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("leave.nothingWaiting")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {office.data.pending.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {request.staffName}
                      <span className="ms-2 font-normal text-slate-500">{request.typeLabel}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{request.dates}</p>
                    {request.reason && <p className="text-xs italic text-slate-500">“{request.reason}”</p>}
                  </div>
                  {/* Both buttons, always: an approve-only row makes declining
                      feel like a failure rather than a decision. */}
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void decide.mutateAsync({ id: request.id, approve: true }).catch(() => undefined)}
                      disabled={decide.isPending}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {t("leave.approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide.mutateAsync({ id: request.id, approve: false }).catch(() => undefined)}
                      disabled={decide.isPending}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                    >
                      {t("leave.decline")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {office.data.upcoming.length > 0 && (
            <>
              <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("leave.awaySoon")}</h2>
              <ul className="mt-2 space-y-1">
                {office.data.upcoming.map((request) => (
                  <li key={request.id} className="flex flex-wrap justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium">{request.staffName}</span>
                      <span className="text-slate-500"> · {request.typeLabel}</span>
                    </span>
                    <span className="text-slate-500">{request.dates}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("leave.yourRequests")}</h2>
        {(mine.data?.requests.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("leave.noRequests")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {mine.data?.requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {request.typeLabel}
                    <span className="ms-2 font-normal text-slate-500">{request.dates}</span>
                  </p>
                  {request.reason && <p className="text-xs italic text-slate-500">“{request.reason}”</p>}
                  {request.decidedByName && (
                    <p className="text-xs text-slate-500">
                      {request.status === "APPROVED" ? t("leave.approved") : t("leave.declined")} by {request.decidedByName}
                      {request.decisionNote ? ` — “${request.decisionNote}”` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[request.status]}`}>
                    {request.status.toLowerCase()}
                  </span>
                  {request.canCancel && (
                    <button
                      type="button"
                      onClick={() => void cancel.mutateAsync(request.id).catch(() => undefined)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {t("leave.takeItBack")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
