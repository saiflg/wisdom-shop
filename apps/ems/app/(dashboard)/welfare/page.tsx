"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useIsSchoolAdmin } from "@/lib/use-can-author";

type WelfareKind = "MEDICAL" | "HARDSHIP" | "BEREAVEMENT" | "LOAN" | "OTHER";
type WelfareStatus = "REQUESTED" | "APPROVED" | "PAID" | "DECLINED";

const KIND_LABEL: Record<WelfareKind, string> = {
  MEDICAL: "Medical assistance",
  HARDSHIP: "Hardship",
  BEREAVEMENT: "Bereavement",
  LOAN: "Loan",
  OTHER: "Something else",
};

const STATUS_LABEL: Record<WelfareStatus, string> = {
  REQUESTED: "Waiting for a decision",
  APPROVED: "Approved, not yet paid",
  PAID: "Paid",
  DECLINED: "Declined",
};

const STATUS_STYLE: Record<WelfareStatus, string> = {
  REQUESTED: "bg-blue-600 text-white",
  APPROVED: "bg-amber-500 text-white",
  PAID: "bg-emerald-600 text-white",
  DECLINED: "bg-slate-500 text-white",
};

const TRANSITION_LABEL: Record<WelfareStatus, string> = {
  APPROVED: "Approve",
  DECLINED: "Decline",
  PAID: "Record payment",
  REQUESTED: "Ask again",
};

interface WelfareRequest {
  id: string;
  kind: WelfareKind;
  reason: string;
  amountCents: number;
  status: WelfareStatus;
  decidedByName: string | null;
  decisionNote: string | null;
  reference: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
  availableTransitions: WelfareStatus[];
}

interface WelfareList {
  requests: WelfareRequest[];
  summary: {
    committedCents: number;
    paidCents: number;
    outstandingCents: number;
    pendingCents: number;
    byKind: { kind: WelfareKind; amountCents: number; count: number }[];
  };
}

const KEY = ["welfare"];

function formatAmount(cents: number): string {
  const major = Math.floor(Math.abs(cents) / 100).toLocaleString("en-NG");
  return `${major}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}

function useWelfare() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<WelfareList>("/v1/welfare", { headers: authHeaders(accessToken) }),
  });
}

function useAskForHelp() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: WelfareKind; reason: string; amountCents: number }) =>
      apiFetch("/v1/welfare", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

function useDecide(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: WelfareStatus; note?: string }) =>
      apiFetch(`/v1/welfare/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Staff welfare, medical assistance included.
 *
 * Medical is a kind here rather than its own screen. Giving it a separate
 * page would have been its own disclosure — anybody watching would learn what
 * the separate page was for, and the whole point is that a colleague cannot
 * tell why somebody asked for help.
 *
 * Nobody sees anybody else's request unless they are an administrator, and
 * nobody decides their own.
 */
export default function WelfarePage() {
  const isAdmin = useIsSchoolAdmin();
  const { data, isLoading } = useWelfare();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welfare</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Asking the school for help — medical bills, hardship, bereavement, a loan.
          {isAdmin
            ? " You can see every request, and you cannot decide your own."
            : " Only you and the school administrators can see what you write here."}
        </p>
      </div>

      <AskForHelp />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {data && isAdmin && <Summary summary={data.summary} />}

      {data?.requests.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nothing here yet.</p>
      )}

      <div className="space-y-3">
        {data?.requests.map((request) => (
          <RequestCard key={request.id} request={request} isAdmin={isAdmin} />
        ))}
      </div>
    </div>
  );
}

function Summary({ summary }: { summary: WelfareList["summary"] }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap gap-8">
        <Stat label="Committed" value={formatAmount(summary.committedCents)} />
        <Stat label="Paid" value={formatAmount(summary.paidCents)} />
        <Stat label="Owing" value={formatAmount(summary.outstandingCents)} />
        <Stat label="Waiting" value={formatAmount(summary.pendingCents)} hint="not a commitment yet" />
      </div>
      {summary.byKind.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          {/* Counts beside amounts: one large bill and twelve small ones are
              the same figure and a very different picture. */}
          {summary.byKind
            .map((k) => `${KIND_LABEL[k.kind]} ${formatAmount(k.amountCents)} (${k.count})`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function AskForHelp() {
  const ask = useAskForHelp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "MEDICAL" as WelfareKind, reason: "", amount: "" });
  const [error, setError] = useState<string | null>(null);

  const cents = Math.round(Number(form.amount) * 100);
  const valid = form.reason.trim() && Number.isInteger(cents) && cents > 0;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
      >
        Ask for help
      </button>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await ask.mutateAsync({ kind: form.kind, reason: form.reason.trim(), amountCents: cents });
          setForm({ ...form, reason: "", amount: "" });
          setOpen(false);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not send that request");
        }
      }}
      className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ask for help</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value as WelfareKind })}
          aria-label="What kind of help"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {(Object.keys(KIND_LABEL) as WelfareKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
        <input
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          inputMode="decimal"
          placeholder="50000.00"
          aria-label="Amount"
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <input
        value={form.reason}
        onChange={(event) => setForm({ ...form, reason: event.target.value })}
        required
        maxLength={1000}
        placeholder="What it is for"
        aria-label="What it is for"
        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <p className="mt-2 text-xs text-slate-500">
        Only you and the school administrators will see this. Somebody other than you has to decide it.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={ask.isPending || !valid}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {ask.isPending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function RequestCard({ request, isAdmin }: { request: WelfareRequest; isAdmin: boolean }) {
  const decide = useDecide(request.id);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const moves = request.availableTransitions;

  const go = async (to: WelfareStatus) => {
    setMessage(null);
    try {
      await decide.mutateAsync({ to, note: note.trim() || undefined });
      setNote("");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not do that");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {KIND_LABEL[request.kind]}
            <span className="ml-2 tabular-nums text-slate-600 dark:text-slate-400">
              {formatAmount(request.amountCents)}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{request.reason}</p>
          <p className="mt-1 text-xs text-slate-500">
            {isAdmin && `${request.user.firstName} ${request.user.lastName} · `}
            {new Date(request.createdAt).toLocaleDateString()}
            {request.decidedByName && ` · decided by ${request.decidedByName}`}
          </p>
          {request.decisionNote && <p className="mt-1 text-xs text-amber-600">{request.decisionNote}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[request.status]}`}>
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      {moves.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          {moves.includes("DECLINED") && (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder="Why? (required to decline)"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {moves.map((to) => (
              <button
                key={to}
                type="button"
                onClick={() => go(to)}
                disabled={decide.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  to === "APPROVED" || to === "PAID"
                    ? "bg-brand-gradient text-white"
                    : "border border-slate-300 dark:border-slate-700"
                }`}
              >
                {TRANSITION_LABEL[to]}
              </button>
            ))}
          </div>
        </div>
      )}

      {moves.length === 0 && request.status === "REQUESTED" && (
        <p className="mt-2 text-xs text-slate-500">
          Waiting for somebody else. A request cannot be decided by the person who made it.
        </p>
      )}

      {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
    </section>
  );
}
