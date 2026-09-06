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
import { useQuizzes, useCreateQuiz, useGenerateQuiz } from "@/lib/use-quizzes";
import { useCanAuthor } from "@/lib/use-can-author";
import { FormField } from "@/components/form-field";
import { useTranslation } from "@/lib/i18n/i18n-provider";

function createSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    schemeOfWorkId: z.string().min(1, t("valid.chooseScheme")),
    weekNumber: z.coerce.number().int().min(1, t("valid.weekRequired")),
    title: z.string().min(1, t("valid.titleRequired")),
    prompt: z.string().min(1, t("valid.firstQuestionPrompt")),
    correctAnswer: z.string().min(1, t("valid.answerRequired")),
    marks: z.coerce.number().int().min(1, t("valid.marksRequired")),
  });
}
type CreateValues = z.infer<ReturnType<typeof createSchemaFor>>;

function generateSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    schemeOfWorkId: z.string().min(1, t("valid.chooseScheme")),
    weekNumber: z.coerce.number().int().min(1, t("valid.weekRequired")),
    title: z.string().min(1, t("valid.titleRequired")),
  });
}
type GenerateValues = z.infer<ReturnType<typeof generateSchemaFor>>;

export default function QuizzesPage() {
  const { t, tPlural } = useTranslation();
  const createSchema = useMemo(() => createSchemaFor(t), [t]);
  const generateSchema = useMemo(() => generateSchemaFor(t), [t]);
  const searchParams = useSearchParams();
  const schemeOfWorkId = searchParams.get("schemeOfWorkId") ?? undefined;
  const weekNumberParam = searchParams.get("weekNumber") ?? undefined;

  const { data: schemesOfWork } = useSchemesOfWork();
  const { data: settings } = useCurriculumSettings();
  const { data: quizzes, isLoading, error } = useQuizzes(schemeOfWorkId);
  const createQuiz = useCreateQuiz();
  const generateQuiz = useGenerateQuiz();

  const [mode, setMode] = useState<"none" | "manual" | "generate">(weekNumberParam ? "manual" : "none");
  const [formError, setFormError] = useState<string | null>(null);

  // Read by students, written by staff. See use-can-author.ts.
  const canAuthor = useCanAuthor();
  const canGenerate = canAuthor && (settings ? settings.mode !== "MANUAL" : false);

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const generateForm = useForm<GenerateValues>({ resolver: zodResolver(generateSchema) });

  // See lesson-plans/page.tsx — a <select>'s defaultValue is lost while its
  // options are still loading, so set it once the list resolves.
  useEffect(() => {
    if (!schemeOfWorkId || !schemesOfWork) return;
    createForm.setValue("schemeOfWorkId", schemeOfWorkId);
    generateForm.setValue("schemeOfWorkId", schemeOfWorkId);
  }, [schemeOfWorkId, schemesOfWork, createForm, generateForm]);

  const onCreate = createForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createQuiz.mutateAsync({
        schemeOfWorkId: values.schemeOfWorkId,
        weekNumber: values.weekNumber,
        title: values.title,
        content: {
          questions: [
            {
              questionNumber: 1,
              prompt: values.prompt,
              type: "SHORT_ANSWER",
              options: [],
              correctAnswer: values.correctAnswer,
              marks: values.marks,
            },
          ],
        },
      });
      createForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("quizzes.createFailed"));
    }
  });

  const onGenerate = generateForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await generateQuiz.mutateAsync(values);
      generateForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("quizzes.generateFailed"));
    }
  });

  const schemeSelect = (
    form: typeof createForm | typeof generateForm,
    id: string,
    errorMessage?: string,
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {t("quizzes.schemeOfWork")}
      </label>
      <select
        id={id}
        {...(form as typeof createForm).register("schemeOfWorkId")}
        defaultValue={schemeOfWorkId ?? ""}
        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="" disabled>
          {t("quizzes.chooseScheme")}
        </option>
        {schemesOfWork?.map((sow) => (
          <option key={sow.id} value={sow.id}>
            {sow.subject?.name ?? t("quizzes.subjectFallback")} · {sow.academicYear} · {sow.term}
          </option>
        ))}
      </select>
      {errorMessage && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("quizzes.title")}</h1>
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
              {mode === "manual" ? t("common.cancel") : t("quizzes.createManually")}
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
              {mode === "generate" ? t("common.cancel") : t("quizzes.generateWithWisdom")}
            </button>
          )}
        </div>
      </div>

      {mode === "manual" && (
        <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          {schemeSelect(createForm, "create-schemeOfWorkId", createForm.formState.errors.schemeOfWorkId?.message)}
          <FormField
            label={t("quizzes.weekNumber")}
            type="number"
            min={1}
            defaultValue={weekNumberParam}
            error={createForm.formState.errors.weekNumber?.message}
            {...createForm.register("weekNumber")}
          />
          <FormField
            label={t("quizzes.quizTitle")}
            placeholder={t("quizzes.titlePlaceholder")}
            error={createForm.formState.errors.title?.message}
            {...createForm.register("title")}
          />
          <FormField
            label={t("quizzes.question1")}
            placeholder={t("quizzes.question1Placeholder")}
            error={createForm.formState.errors.prompt?.message}
            {...createForm.register("prompt")}
          />
          <FormField
            label={t("quizzes.question1Answer")}
            placeholder={t("quizzes.answerPlaceholder")}
            error={createForm.formState.errors.correctAnswer?.message}
            {...createForm.register("correctAnswer")}
          />
          <FormField
            label={t("quizzes.question1Marks")}
            type="number"
            min={1}
            defaultValue={1}
            error={createForm.formState.errors.marks?.message}
            {...createForm.register("marks")}
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
          <p className="text-xs text-slate-500">{t("quizzes.moreQuestions")}</p>
        </form>
      )}

      {mode === "generate" && (
        <form onSubmit={onGenerate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          {schemeSelect(generateForm, "generate-schemeOfWorkId", generateForm.formState.errors.schemeOfWorkId?.message)}
          <FormField
            label={t("quizzes.weekNumber")}
            type="number"
            min={1}
            defaultValue={weekNumberParam}
            error={generateForm.formState.errors.weekNumber?.message}
            {...generateForm.register("weekNumber")}
          />
          <FormField
            label={t("quizzes.quizTitle")}
            placeholder={t("quizzes.titlePlaceholder")}
            error={generateForm.formState.errors.title?.message}
            {...generateForm.register("title")}
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
            {t("quizzes.generate")}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load quizzes: {error.message}
        </p>
      )}

      {quizzes && quizzes.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">{t("quizzes.none")}</p>}

      {quizzes && quizzes.length > 0 && (
        <ul className="space-y-3">
          {quizzes.map((quiz) => (
            <li key={quiz.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <Link href={`/quizzes/${quiz.id}`} className="font-medium hover:underline">
                  {quiz.title}
                </Link>
                <div className="flex gap-2">
                  <span
                    className={
                      quiz.status === "PUBLISHED"
                        ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }
                  >
                    {quiz.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {quiz.source === "AI_GENERATED" ? t("quizzes.wisdomGenerated") : t("quizzes.manual")}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {quiz.schemeOfWork?.subject?.name ?? t("quizzes.subjectFallback")} ·{" "}
                {t("quizzes.week", { n: quiz.weekNumber })} ·{" "}
                {tPlural("quizzes.questionCount", quiz.content.questions.length)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
