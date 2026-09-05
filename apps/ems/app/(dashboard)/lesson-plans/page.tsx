"use client";

import { useEffect, useState, useMemo } from "react";
import type { TranslationKey } from "@/lib/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useSchemesOfWork } from "@/lib/use-schemes-of-work";
import { useCurriculumSettings } from "@/lib/use-curriculum-settings";
import { useLessonPlans, useCreateLessonPlan, useGenerateLessonPlan } from "@/lib/use-lesson-plans";
import { useCanAuthor } from "@/lib/use-can-author";
import { FormField } from "@/components/form-field";
import { useTranslation } from "@/lib/i18n/i18n-provider";

function createSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    schemeOfWorkId: z.string().min(1, t("valid.chooseScheme")),
    weekNumber: z.coerce.number().int().min(1, t("valid.weekRequired")),
    objectives: z.string().min(1, t("valid.oneObjective")),
    materials: z.string().min(1, t("valid.oneMaterial")),
    introduction: z.string().min(1, t("valid.introRequired")),
    developmentSteps: z.string().min(1, t("valid.oneStep")),
    conclusion: z.string().min(1, t("valid.conclusionRequired")),
    assessment: z.string().min(1, t("valid.assessmentRequired")),
    homework: z.string().min(1, t("valid.homeworkRequired")),
  });
}
type CreateValues = z.infer<ReturnType<typeof createSchemaFor>>;

function generateSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    schemeOfWorkId: z.string().min(1, t("valid.chooseScheme")),
    weekNumber: z.coerce.number().int().min(1, t("valid.weekRequired")),
  });
}
type GenerateValues = z.infer<ReturnType<typeof generateSchemaFor>>;

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LessonPlansPage() {
  const { t } = useTranslation();
  const createSchema = useMemo(() => createSchemaFor(t), [t]);
  const generateSchema = useMemo(() => generateSchemaFor(t), [t]);
  const searchParams = useSearchParams();
  const schemeOfWorkId = searchParams.get("schemeOfWorkId") ?? undefined;
  const weekNumberParam = searchParams.get("weekNumber") ?? undefined;

  const { data: schemesOfWork } = useSchemesOfWork();
  const { data: settings } = useCurriculumSettings();
  const { data: plans, isLoading, error } = useLessonPlans(schemeOfWorkId);
  const createPlan = useCreateLessonPlan();
  const generatePlan = useGenerateLessonPlan();

  const [mode, setMode] = useState<"none" | "manual" | "generate">(weekNumberParam ? "manual" : "none");
  const [formError, setFormError] = useState<string | null>(null);

  // Students and guardians read teaching material; they never write it. The
  // API has always refused them — this stops the console offering anyway,
  // which is the same "control that looks real and does nothing" this
  // project refuses elsewhere, aimed at the people least able to interpret
  // the failure.
  const canAuthor = useCanAuthor();
  const canGenerate = canAuthor && (settings ? settings.mode !== "MANUAL" : false);

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const generateForm = useForm<GenerateValues>({ resolver: zodResolver(generateSchema) });

  // The <select> can't show a prefilled option until its option list has
  // loaded — a native `defaultValue` set before that finishes silently
  // falls back to the first option, so we set it explicitly once the
  // scheme-of-work list actually arrives.
  useEffect(() => {
    if (!schemeOfWorkId || !schemesOfWork) return;
    createForm.setValue("schemeOfWorkId", schemeOfWorkId);
    generateForm.setValue("schemeOfWorkId", schemeOfWorkId);
  }, [schemeOfWorkId, schemesOfWork, createForm, generateForm]);

  const onCreate = createForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createPlan.mutateAsync({
        schemeOfWorkId: values.schemeOfWorkId,
        weekNumber: values.weekNumber,
        content: {
          objectives: linesToList(values.objectives),
          materials: linesToList(values.materials),
          introduction: values.introduction,
          developmentSteps: linesToList(values.developmentSteps),
          conclusion: values.conclusion,
          assessment: values.assessment,
          homework: values.homework,
        },
      });
      createForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("lessonPlans.createFailed"));
    }
  });

  const onGenerate = generateForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await generatePlan.mutateAsync(values);
      generateForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("lessonPlans.generateFailed"));
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("lessonPlans.title")}</h1>
        <div className="flex gap-2">
          {canAuthor && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setMode(mode === "manual" ? "none" : "manual");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {mode === "manual" ? t("common.cancel") : t("shared.createManually")}
            </button>
          )}
          {canGenerate && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setMode(mode === "generate" ? "none" : "generate");
              }}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {mode === "generate" ? t("common.cancel") : t("shared.generateWithWisdom")}
            </button>
          )}
        </div>
      </div>

      {mode === "manual" && (
        <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div>
            <label htmlFor="create-schemeOfWorkId" className="block text-sm font-medium">
              {t("shared.schemeOfWork")}
            </label>
            <select
              id="create-schemeOfWorkId"
              {...createForm.register("schemeOfWorkId")}
              defaultValue={schemeOfWorkId ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                {t("shared.chooseScheme")}
              </option>
              {schemesOfWork?.map((sow) => (
                <option key={sow.id} value={sow.id}>
                  {sow.subject?.name ?? t("shared.subjectFallback")} · {sow.academicYear} · {sow.term}
                </option>
              ))}
            </select>
            {createForm.formState.errors.schemeOfWorkId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {createForm.formState.errors.schemeOfWorkId.message}
              </p>
            )}
          </div>
          <FormField
            label={t("lessonPlans.weekNumber")}
            type="number"
            min={1}
            defaultValue={weekNumberParam}
            error={createForm.formState.errors.weekNumber?.message}
            {...createForm.register("weekNumber")}
          />
          <div>
            <label htmlFor="create-objectives" className="block text-sm font-medium">
              Objectives (one per line)
            </label>
            <textarea
              id="create-objectives"
              rows={2}
              {...createForm.register("objectives")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            {createForm.formState.errors.objectives && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createForm.formState.errors.objectives.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="create-materials" className="block text-sm font-medium">
              Materials (one per line)
            </label>
            <textarea
              id="create-materials"
              rows={2}
              {...createForm.register("materials")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            {createForm.formState.errors.materials && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createForm.formState.errors.materials.message}</p>
            )}
          </div>
          <FormField
            label={t("lessonPlans.introduction")}
            error={createForm.formState.errors.introduction?.message}
            {...createForm.register("introduction")}
          />
          <div>
            <label htmlFor="create-developmentSteps" className="block text-sm font-medium">
              Development steps (one per line)
            </label>
            <textarea
              id="create-developmentSteps"
              rows={3}
              {...createForm.register("developmentSteps")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            {createForm.formState.errors.developmentSteps && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {createForm.formState.errors.developmentSteps.message}
              </p>
            )}
          </div>
          <FormField
            label={t("lessonPlans.conclusion")}
            error={createForm.formState.errors.conclusion?.message}
            {...createForm.register("conclusion")}
          />
          <FormField
            label={t("lessonPlans.assessment")}
            error={createForm.formState.errors.assessment?.message}
            {...createForm.register("assessment")}
          />
          <FormField
            label={t("lessonPlans.homework")}
            error={createForm.formState.errors.homework?.message}
            {...createForm.register("homework")}
          />
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={createForm.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("common.create")}
          </button>
        </form>
      )}

      {mode === "generate" && (
        <form onSubmit={onGenerate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div>
            <label htmlFor="generate-schemeOfWorkId" className="block text-sm font-medium">
              {t("shared.schemeOfWork")}
            </label>
            <select
              id="generate-schemeOfWorkId"
              {...generateForm.register("schemeOfWorkId")}
              defaultValue={schemeOfWorkId ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                {t("shared.chooseScheme")}
              </option>
              {schemesOfWork?.map((sow) => (
                <option key={sow.id} value={sow.id}>
                  {sow.subject?.name ?? t("shared.subjectFallback")} · {sow.academicYear} · {sow.term}
                </option>
              ))}
            </select>
            {generateForm.formState.errors.schemeOfWorkId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {generateForm.formState.errors.schemeOfWorkId.message}
              </p>
            )}
          </div>
          <FormField
            label={t("lessonPlans.weekNumber")}
            type="number"
            min={1}
            defaultValue={weekNumberParam}
            error={generateForm.formState.errors.weekNumber?.message}
            {...generateForm.register("weekNumber")}
          />
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={generateForm.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("shared.generate")}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load lesson plans: {error.message}
        </p>
      )}

      {plans && plans.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">{t("lessonPlans.none")}</p>}

      {plans && plans.length > 0 && (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <Link href={`/lesson-plans/${plan.id}`} className="font-medium hover:underline">
                  {plan.schemeOfWork?.subject?.name ?? t("shared.subjectFallback")} · Week {plan.weekNumber}
                </Link>
                <div className="flex gap-2">
                  <span
                    className={
                      plan.status === "PUBLISHED"
                        ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }
                  >
                    {plan.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {plan.source === "AI_GENERATED" ? t("shared.wisdomGenerated") : t("shared.manual")}
                  </span>
                </div>
              </div>
              {plan.schemeOfWork && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {plan.schemeOfWork.academicYear} · {plan.schemeOfWork.term}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
