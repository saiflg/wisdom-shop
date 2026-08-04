"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useOutbox, useRetryMessage, type MessageStatus, type OutboxMessage } from "@/lib/use-messaging";

const STATUSES: MessageStatus[] = ["SENT", "QUEUED", "FAILED", "SKIPPED"];

const STATUS_STYLE: Record<MessageStatus, string> = {
  SENT: "bg-emerald-600 text-white",
  QUEUED: "bg-slate-500 text-white",
  FAILED: "bg-red-600 text-white",
  // Deliberately not red: nothing went wrong, there was nowhere to send.
  SKIPPED: "bg-amber-500 text-white",
};

export default function OutboxPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MessageStatus | undefined>(undefined);
  const { data: messages, isLoading } = useOutbox(status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("messaging.outbox.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("messaging.outbox.intro")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatus(undefined)}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold transition",
            status === undefined
              ? "bg-brand-gradient text-white"
              : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
          )}
        >
          {t("messaging.outbox.all")}
        </button>
        {STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatus(option)}
            className={clsx(
              "rounded-full px-3 py-1 text-xs font-semibold transition",
              status === option
                ? STATUS_STYLE[option]
                : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
            )}
          >
            {t(`messaging.status.${option}` as TranslationKey)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {messages?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("messaging.outbox.none")}</p>
      )}

      <div className="space-y-3">
        {messages?.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: OutboxMessage }) {
  const { t } = useTranslation();
  const retry = useRetryMessage();
  const [note, setNote] = useState<string | null>(null);

  const onRetry = async () => {
    setNote(null);
    try {
      await retry.mutateAsync(message.id);
      setNote(t("messaging.outbox.retried"));
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("messaging.outbox.retryFailed"));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {t(`messaging.event.${message.event}` as TranslationKey)}
            <span className="ml-2 text-xs text-slate-500">
              {t(`messaging.channel.${message.channel}` as TranslationKey)}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {t("messaging.outbox.recipient")}: {message.recipientName}
            {!message.recipientAddress.startsWith("unavailable:") && ` · ${message.recipientAddress}`}
          </p>
          {message.studentProfile && (
            <p className="text-xs text-slate-500">
              {t("messaging.outbox.about")}: {message.studentProfile.user.firstName}{" "}
              {message.studentProfile.user.lastName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[message.status])}>
            {t(`messaging.status.${message.status}` as TranslationKey)}
          </span>
          {message.status !== "SENT" && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retry.isPending}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("messaging.outbox.retry")}
            </button>
          )}
        </div>
      </div>

      {message.subject && <p className="mt-2 text-sm font-medium">{message.subject}</p>}
      {message.body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{message.body}</p>
      )}

      {/* The reason matters more than the status: "no gateway configured" is
          a setup task, not an incident. */}
      {message.statusReason && <p className="mt-2 text-xs text-amber-600">{message.statusReason}</p>}
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </section>
  );
}
