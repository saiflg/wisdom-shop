"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useSubjects } from "@/lib/use-subjects";
import { useSchemesOfWork } from "@/lib/use-schemes-of-work";
import { useTutorSessions, useStartTutorSession, type TutorSessionStatus } from "@/lib/use-ai-teacher";
import { useAuthStore } from "@/store/auth-store";
import { FormField } from "@/components/form-field";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

function startSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    subjectId: z.string().min(1, t("valid.chooseSubject")),
    topic: z.string().min(3, t("valid.whatToLearn")),
    mode: z.enum(["ASK", "AUTO"]),
    schemeOfWorkId: z.string().optional(),
    // Kept a string on purpose. An untouched number input submits "", which
    // `z.coerce.number()` turns into 0 — and 0 then fails a `.min(1)`, so the
    // optional field rejects being left alone. `z.preprocess` fixes that but
    // makes the schema's input type diverge from its output, which the
    // resolver won't accept. Validating the text and converting at submit is
    // the version that stays simple.
    weekNumber: z
      .string()
      .optional()
      .refine((value) => !value || (/^\d+$/.test(value) && Number(value) >= 1), t("valid.weekAtLeastOne")),
  });
}
type StartValues = z.infer<ReturnType<typeof startSchemaFor>>;

const SELECT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
const STATUS_BADGE: Record<TutorSessionStatus, string> = {
  ACTIVE: `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`,
  PAUSED: `${BADGE} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`,
  ENDED: `${BADGE} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`,
};
const STATUS_LABEL: Record<TutorSessionStatus, TranslationKey> = {
  ACTIVE: "aiTeacher.statusACTIVE",
  PAUSED: "aiTeacher.statusPAUSED",
  ENDED: "aiTeacher.statusENDED",
};

export default function AiTeacherPage() {
  const { t, tPlural } = useTranslation();
  const schema = useMemo(() => startSchemaFor(t), [t]);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: subjects } = useSubjects();
  const { data: schemesOfWork } = useSchemesOfWork();
  const { data: sessions, isLoading, error } = useTutorSessions();
  const startSession = useStartTutorSession();

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // A guardian may read their children's lessons but not hold one — the
  // transcript is the child's record, so the form is simply absent for them.
  const isGuardian = Boolean(user?.roles.includes("GUARDIAN")) && !user?.roles.some((r) => r === "SCHOOL_ADMIN" || r === "TEACHER");

  const form = useForm<StartValues>({
    resolver: zodResolver(schema),
    defaultValues: { mode: "AUTO" },
  });

  const onStart = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await startSession.mutateAsync({
        subjectId: values.subjectId,
        topic: values.topic,
        mode: values.mode,
        ...(values.schemeOfWorkId ? { schemeOfWorkId: values.schemeOfWorkId } : {}),
        ...(values.weekNumber ? { weekNumber: Number(values.weekNumber) } : {}),
      });
      router.push(`/ai-teacher/${session.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("aiTeacher.startFailed"));
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav.academics.aiTeaching")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {isGuardian
              ? t("aiTeacher.guardianIntro")
              : t("aiTeacher.studentIntro")}
          </p>
        </div>
        {!isGuardian && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setOpen(!open);
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {open ? t("common.cancel") : t("aiTeacher.startLesson")}
          </button>
        )}
      </div>

      {open && (
        <form
          onSubmit={onStart}
          className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
        >
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1.5 text-sm font-medium">{t("aiTeacher.howLearn")}</legend>
            {(
              [
                {
                  value: "AUTO" as const,
                  title: t("aiTeacher.modeAutoTitle"),
                  blurb: t("aiTeacher.modeAutoBlurb"),
                },
                {
                  value: "ASK" as const,
                  title: t("aiTeacher.modeAskTitle"),
                  blurb: t("aiTeacher.modeAskBlurb"),
                },
              ]
            ).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-slate-300 p-3 transition hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:has-[:checked]:bg-brand-950/30"
              >
                <input type="radio" value={option.value} {...form.register("mode")} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{option.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="subjectId" className="block text-sm font-medium">
                {t("aiTeacher.subject")}
              </label>
              <select id="subjectId" {...form.register("subjectId")} defaultValue="" className={SELECT}>
                <option value="" disabled>
                  {t("aiTeacher.chooseSubject")}
                </option>
                {subjects?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.gradeLevel ? ` · ${subject.gradeLevel}` : ""}
                  </option>
                ))}
              </select>
              {form.formState.errors.subjectId && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {form.formState.errors.subjectId.message}
                </p>
              )}
            </div>

            <FormField
              label={t("aiTeacher.whatLearn")}
              placeholder={t("aiTeacher.topicPlaceholder")}
              error={form.formState.errors.topic?.message}
              {...form.register("topic")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="schemeOfWorkId" className="block text-sm font-medium">
                {t("aiTeacher.followScheme")}{" "}
                <span className="font-normal text-slate-500">{t("aiTeacher.optional")}</span>
              </label>
              <select id="schemeOfWorkId" {...form.register("schemeOfWorkId")} defaultValue="" className={SELECT}>
                <option value="">{t("aiTeacher.justTopic")}</option>
                {schemesOfWork?.map((sow) => (
                  <option key={sow.id} value={sow.id}>
                    {sow.subject?.name ?? t("shared.subjectFallback")} · {sow.academicYear} · {sow.term}
                  </option>
                ))}
              </select>
              {/* Anchoring to a week is what makes the tutor teach the topic
                  the way this class is being taught it, rather than in
                  general. */}
              <p className="mt-1 text-xs text-slate-500">
                Pick one and the week&apos;s objectives shape how the lesson is taught.
              </p>
            </div>

            <FormField
              label={t("aiTeacher.weekNumber")}
              type="number"
              min={1}
              placeholder="1"
              error={form.formState.errors.weekNumber?.message}
              {...form.register("weekNumber")}
            />
          </div>

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <button
            type="submit"
            disabled={startSession.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {startSession.isPending ? t("aiTeacher.starting") : t("aiTeacher.start")}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-500">{t("aiTeacher.loadingLessons")}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{t("aiTeacher.lessonsFailed")}</p>}

      {sessions && sessions.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("aiTeacher.noLessons")}
        </p>
      )}

      <ul className="space-y-2">
        {sessions?.map((session) => (
          <li key={session.id}>
            <Link
              href={`/ai-teacher/${session.id}`}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition hover:border-brand-400 dark:border-slate-800"
            >
              <div className="min-w-0">
                {/* The scheme's lesson, not the word typed on the way in —
                    otherwise a child's tutoring record reads "adverb",
                    "vowels", "noun" for three lessons all teaching parts of
                    speech, which looks like a broken product to a parent. */}
                <p className="truncate font-semibold">{session.displayTitle ?? session.topic}</p>
                {session.followsScheme && (
                  <p className="truncate text-xs text-slate-500">
                    {t("aiTeacher.youAskedAbout", { topic: session.topic })}
                  </p>
                )}
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {session.subject?.name}
                  {session.startedByUser
                    ? ` · ${session.startedByUser.firstName} ${session.startedByUser.lastName}`
                    : ""}
                  {session.mode === "AUTO"
                    ? ` · ${t("aiTeacher.percentThrough", { percent: session.percent })}`
                    : typeof session._count?.turns === "number"
                      ? ` · ${tPlural("aiTeacher.messageCount", session._count.turns)}`
                      : ""}
                </p>
                {session.mode === "AUTO" && (
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                    role="progressbar"
                    aria-valuenow={session.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("aiTeacher.progressOf", {
                      title: session.displayTitle ?? session.topic,
                    })}
                  >
                    <div className="h-full bg-brand-600" style={{ width: `${session.percent}%` }} />
                  </div>
                )}
              </div>
              <span className={STATUS_BADGE[session.status]}>{t(STATUS_LABEL[session.status])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
