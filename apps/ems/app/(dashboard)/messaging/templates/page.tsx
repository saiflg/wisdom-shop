"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import {
  EVENT_PLACEHOLDERS,
  unknownPlaceholders,
  useMessageTemplates,
  useUpdateTemplate,
  type MessageTemplate,
} from "@/lib/use-messaging";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

export default function MessageTemplatesPage() {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useMessageTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("messaging.templates.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("messaging.templates.intro")}
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}

      <div className="space-y-4">
        {templates?.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: MessageTemplate }) {
  const { t } = useTranslation();
  const update = useUpdateTemplate();

  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Re-seed when the query refetches, so a save elsewhere doesn't leave this
  // card showing stale wording.
  useEffect(() => {
    setSubject(template.subject ?? "");
    setBody(template.body);
    setEnabled(template.enabled);
  }, [template]);

  const allowed = EVENT_PLACEHOLDERS[template.event] ?? [];
  const bad = [...new Set([...unknownPlaceholders(body, template.event), ...unknownPlaceholders(subject, template.event)])];

  const onSave = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({
        id: template.id,
        subject: template.channel === "EMAIL" ? subject : undefined,
        body,
        enabled,
      });
      setMessage({ tone: "ok", text: t("messaging.templates.saved") });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : t("messaging.templates.saveFailed"),
      });
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          {t(`messaging.event.${template.event}` as TranslationKey)}
          <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {t(`messaging.channel.${template.channel}` as TranslationKey)}
          </span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("messaging.templates.enabled")}
        </label>
      </div>

      {template.channel === "EMAIL" ? (
        <div className="mt-3">
          <label className="block text-sm font-medium">{t("messaging.templates.subject")}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t("messaging.templates.smsNoSubject")}</p>
      )}

      <div className="mt-3">
        <label className="block text-sm font-medium">{t("messaging.templates.body")}</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={INPUT} />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {t("messaging.templates.placeholders")}{" "}
        {allowed.map((name) => (
          <code
            key={name}
            className="me-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] dark:bg-slate-800"
          >{`{{${name}}}`}</code>
        ))}
      </p>

      {/* Surfaced as you type rather than as a 400 after saving. The API
          validates independently and remains the authority. */}
      {bad.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          {t("messaging.templates.unknown")}:{" "}
          {bad.map((name) => (
            <code key={name} className="me-1">{`{{${name}}}`}</code>
          ))}
        </p>
      )}

      {message && (
        <p className={clsx("mt-2 text-sm", message.tone === "ok" ? "text-emerald-600" : "text-red-600")}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={update.isPending || bad.length > 0}
        className="mt-3 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {t("messaging.templates.save")}
      </button>
    </section>
  );
}
