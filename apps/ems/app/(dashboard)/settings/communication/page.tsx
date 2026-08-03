"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { FormField } from "@/components/form-field";
import { SecretField } from "@/components/secret-field";
import {
  useCommunicationSettings,
  useTestGateway,
  useUpdateEmailGateway,
  useUpdatePushGateway,
  useUpdateSmsGateway,
  useUpdateWhatsAppGateway,
} from "@/lib/use-settings";

/**
 * Uncontrolled forms on purpose: secret inputs must start empty (blank means
 * "keep what's stored"), so seeding them from server state would be wrong,
 * and non-secret fields are simple enough not to need controlled state.
 */
export default function CommunicationSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCommunicationSettings();

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {error.message}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.communicationTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("settings.communicationIntro")}</p>
      </div>

      <EmailSection data={data.email} />
      <SmsSection data={data.sms} />
      <WhatsAppSection data={data.whatsapp} />
      <PushSection data={data.push} />
    </div>
  );
}

function GatewayCard({
  title,
  configured,
  children,
}: {
  title: string;
  configured: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span
          className={
            configured
              ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }
        >
          {configured ? t("settings.configured") : t("settings.notConfigured")}
        </span>
      </div>
      {children}
    </section>
  );
}

/** Shared save/test feedback, so each section doesn't reinvent it. */
function useSectionState() {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const report = (tone: "ok" | "error", text: string) => setMessage({ tone, text });
  const fromError = (err: unknown, fallback: string) =>
    report("error", err instanceof ApiError ? err.message : fallback);
  return { message, report, fromError, clear: () => setMessage(null) };
}

function Feedback({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <p
      role={message.tone === "error" ? "alert" : undefined}
      className={
        message.tone === "error"
          ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
          : "text-sm text-emerald-600 dark:text-emerald-400"
      }
    >
      {message.text}
    </p>
  );
}

const SAVE_BUTTON =
  "rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
const TEST_BUTTON =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900";

function EmailSection({ data }: { data: import("@/lib/use-settings").EmailGatewayView }) {
  const { t } = useTranslation();
  const update = useUpdateEmailGateway();
  const test = useTestGateway("email");
  const { message, report, fromError, clear } = useSectionState();
  const [testTo, setTestTo] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    try {
      await update.mutateAsync({
        host: String(form.get("host") ?? "") || undefined,
        port: form.get("port") ? Number(form.get("port")) : undefined,
        username: String(form.get("username") ?? "") || undefined,
        encryption: String(form.get("encryption") ?? "TLS"),
        senderName: String(form.get("senderName") ?? "") || undefined,
        senderEmail: String(form.get("senderEmail") ?? "") || undefined,
        ...(password ? { password } : {}),
      });
      report("ok", t("common.saved"));
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <GatewayCard title={t("settings.email")} configured={data.configured}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("settings.emailHost")} name="host" defaultValue={data.host ?? ""} placeholder="smtp.example.com" />
          <FormField label={t("settings.emailPort")} name="port" type="number" min={1} max={65535} defaultValue={data.port ?? 587} />
          <FormField label={t("settings.emailUsername")} name="username" defaultValue={data.username ?? ""} />
          <div>
            <label htmlFor="encryption" className="block text-sm font-medium">
              {t("settings.emailEncryption")}
            </label>
            <select
              id="encryption"
              name="encryption"
              defaultValue={data.encryption}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="TLS">TLS</option>
              <option value="SSL">SSL</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <FormField label={t("settings.emailSenderName")} name="senderName" defaultValue={data.senderName ?? ""} />
          <FormField
            label={t("settings.emailSenderEmail")}
            name="senderEmail"
            type="email"
            defaultValue={data.senderEmail ?? ""}
          />
        </div>

        <SecretField
          label={t("settings.emailPassword")}
          name="password"
          storedMask={data.password}
          onClear={async () => {
            clear();
            try {
              await update.mutateAsync({ password: null });
              report("ok", t("common.saved"));
            } catch (err) {
              fromError(err, t("settings.saveFailed"));
            }
          }}
        />

        <Feedback message={message} />

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" disabled={update.isPending} className={SAVE_BUTTON}>
            {t("common.save")}
          </button>
          <div className="flex items-end gap-2">
            <div className="w-56">
              <FormField
                label={t("settings.testRecipient")}
                name="testTo"
                type="email"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder={data.senderEmail ?? ""}
              />
            </div>
            <button
              type="button"
              disabled={test.isPending}
              className={TEST_BUTTON}
              onClick={async () => {
                clear();
                try {
                  const result = await test.mutateAsync(testTo ? { to: testTo } : {});
                  report("ok", `${t("settings.testSucceeded")} (${result.sentTo})`);
                } catch (err) {
                  fromError(err, t("settings.testFailed"));
                }
              }}
            >
              {t("settings.sendTest")}
            </button>
          </div>
        </div>
      </form>
    </GatewayCard>
  );
}

function SmsSection({ data }: { data: import("@/lib/use-settings").SmsGatewayView }) {
  const { t } = useTranslation();
  const update = useUpdateSmsGateway();
  const test = useTestGateway("sms");
  const { message, report, fromError, clear } = useSectionState();
  const [testTo, setTestTo] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const apiKey = String(form.get("apiKey") ?? "");
    const apiSecret = String(form.get("apiSecret") ?? "");
    try {
      await update.mutateAsync({
        providerName: String(form.get("providerName") ?? "") || undefined,
        baseUrl: String(form.get("baseUrl") ?? "") || undefined,
        senderId: String(form.get("senderId") ?? "") || undefined,
        ...(apiKey ? { apiKey } : {}),
        ...(apiSecret ? { apiSecret } : {}),
      });
      report("ok", t("common.saved"));
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <GatewayCard title={t("settings.sms")} configured={data.configured}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">{t("settings.smsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("settings.smsProvider")} name="providerName" defaultValue={data.providerName ?? ""} />
          <FormField
            label={t("settings.smsBaseUrl")}
            name="baseUrl"
            defaultValue={data.baseUrl ?? ""}
            placeholder="https://api.example.com/send"
          />
          <FormField label={t("settings.smsSenderId")} name="senderId" defaultValue={data.senderId ?? ""} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SecretField label={t("settings.smsApiKey")} name="apiKey" storedMask={data.apiKey} />
          <SecretField label={t("settings.smsApiSecret")} name="apiSecret" storedMask={data.apiSecret} />
        </div>

        <Feedback message={message} />

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" disabled={update.isPending} className={SAVE_BUTTON}>
            {t("common.save")}
          </button>
          <div className="flex items-end gap-2">
            <div className="w-56">
              <FormField
                label={t("settings.testRecipient")}
                name="smsTestTo"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="+2348000000000"
              />
            </div>
            <button
              type="button"
              disabled={test.isPending || !testTo}
              className={TEST_BUTTON}
              onClick={async () => {
                clear();
                try {
                  const result = await test.mutateAsync({ to: testTo });
                  report("ok", `${t("settings.testSucceeded")} (${result.sentTo})`);
                } catch (err) {
                  fromError(err, t("settings.testFailed"));
                }
              }}
            >
              {t("settings.sendTest")}
            </button>
          </div>
        </div>
      </form>
    </GatewayCard>
  );
}

function WhatsAppSection({ data }: { data: import("@/lib/use-settings").WhatsAppGatewayView }) {
  const { t } = useTranslation();
  const update = useUpdateWhatsAppGateway();
  const test = useTestGateway("whatsapp");
  const { message, report, fromError, clear } = useSectionState();
  const [testTo, setTestTo] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const accessToken = String(form.get("accessToken") ?? "");
    const webhookVerifyToken = String(form.get("webhookVerifyToken") ?? "");
    try {
      await update.mutateAsync({
        phoneNumberId: String(form.get("phoneNumberId") ?? "") || undefined,
        businessAccountId: String(form.get("businessAccountId") ?? "") || undefined,
        webhookUrl: String(form.get("webhookUrl") ?? "") || undefined,
        ...(accessToken ? { accessToken } : {}),
        ...(webhookVerifyToken ? { webhookVerifyToken } : {}),
      });
      report("ok", t("common.saved"));
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <GatewayCard title={t("settings.whatsapp")} configured={data.configured}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("settings.whatsappPhoneNumberId")}
            name="phoneNumberId"
            defaultValue={data.phoneNumberId ?? ""}
          />
          <FormField
            label={t("settings.whatsappBusinessAccountId")}
            name="businessAccountId"
            defaultValue={data.businessAccountId ?? ""}
          />
          <FormField label={t("settings.whatsappWebhookUrl")} name="webhookUrl" defaultValue={data.webhookUrl ?? ""} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SecretField label={t("settings.whatsappAccessToken")} name="accessToken" storedMask={data.accessToken} />
          <SecretField
            label={t("settings.whatsappVerifyToken")}
            name="webhookVerifyToken"
            storedMask={data.webhookVerifyToken}
          />
        </div>

        <Feedback message={message} />

        <div className="flex flex-wrap items-end gap-3">
          <button type="submit" disabled={update.isPending} className={SAVE_BUTTON}>
            {t("common.save")}
          </button>
          <div className="flex items-end gap-2">
            <div className="w-56">
              <FormField
                label={t("settings.testRecipient")}
                name="waTestTo"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="+2348000000000"
              />
            </div>
            <button
              type="button"
              disabled={test.isPending || !testTo}
              className={TEST_BUTTON}
              onClick={async () => {
                clear();
                try {
                  const result = await test.mutateAsync({ to: testTo });
                  report("ok", `${t("settings.testSucceeded")} (${result.sentTo})`);
                } catch (err) {
                  fromError(err, t("settings.testFailed"));
                }
              }}
            >
              {t("settings.sendTest")}
            </button>
          </div>
        </div>
      </form>
    </GatewayCard>
  );
}

function PushSection({ data }: { data: import("@/lib/use-settings").PushGatewayView }) {
  const { t } = useTranslation();
  const update = useUpdatePushGateway();
  const { message, report, fromError, clear } = useSectionState();

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clear();
    const form = new FormData(event.currentTarget);
    const credentials = String(form.get("credentials") ?? "");
    try {
      await update.mutateAsync({
        providerName: String(form.get("providerName") ?? "") || undefined,
        ...(credentials ? { credentials } : {}),
      });
      report("ok", t("common.saved"));
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <GatewayCard title={t("settings.push")} configured={data.configured}>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label={t("settings.pushProvider")} name="providerName" defaultValue={data.providerName ?? ""} />
        <SecretField label={t("settings.pushCredentials")} name="credentials" storedMask={data.credentials} />

        <Feedback message={message} />

        <button type="submit" disabled={update.isPending} className={SAVE_BUTTON}>
          {t("common.save")}
        </button>
      </form>
    </GatewayCard>
  );
}
