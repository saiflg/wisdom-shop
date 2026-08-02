"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useStudents } from "@/lib/use-students";
import { useTeachers } from "@/lib/use-teachers";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import { useSchemesOfWork } from "@/lib/use-schemes-of-work";
import { useLessonPlans } from "@/lib/use-lesson-plans";
import { useQuizzes } from "@/lib/use-quizzes";
import { useCurriculumSettings } from "@/lib/use-curriculum-settings";
import { useAuthStore } from "@/store/auth-store";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Every widget is driven by data that actually exists — no placeholder
 * charts. Modules that aren't built yet are absent rather than faked.
 */
export default function DashboardPage() {
  const { t } = useTranslation();
  const schoolSlug = useAuthStore((s) => s.user?.schoolSlug);

  const students = useStudents();
  const teachers = useTeachers();
  const classes = useClasses();
  const subjects = useSubjects();
  const schemes = useSchemesOfWork();
  const lessonPlans = useLessonPlans();
  const quizzes = useQuizzes();
  const settings = useCurriculumSettings();

  const modeKey: TranslationKey =
    settings.data?.mode === "AI_AUTOMATIC"
      ? "dashboard.modeAiAutomatic"
      : settings.data?.mode === "HYBRID"
        ? "dashboard.modeHybrid"
        : "dashboard.modeManual";

  const publishedSchemes = schemes.data?.filter((scheme) => scheme.status === "PUBLISHED").length;
  const publishedQuizzes = quizzes.data?.filter((quiz) => quiz.status === "PUBLISHED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("dashboard.welcome")}
          {schoolSlug ? ` · ${schoolSlug}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.students")} value={students.data?.length} href="/students" />
        <StatCard label={t("dashboard.teachers")} value={teachers.data?.length} href="/teachers" />
        <StatCard label={t("dashboard.classes")} value={classes.data?.length} href="/classes" />
        <StatCard label={t("dashboard.subjects")} value={subjects.data?.length} href="/subjects" />
        <StatCard
          label={t("dashboard.curriculum")}
          value={schemes.data?.length}
          detail={publishedSchemes === undefined ? undefined : `${publishedSchemes} ${t("dashboard.published")}`}
          href="/schemes-of-work"
        />
        <StatCard label={t("dashboard.lessonPlans")} value={lessonPlans.data?.length} href="/lesson-plans" />
        <StatCard
          label={t("dashboard.quizzes")}
          value={quizzes.data?.length}
          detail={publishedQuizzes === undefined ? undefined : `${publishedQuizzes} ${t("dashboard.published")}`}
          href="/quizzes"
        />
        <StatCard label={t("dashboard.curriculumMode")} textValue={t(modeKey)} href="/curriculum-settings" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  textValue,
  detail,
  href,
}: {
  label: string;
  value?: number;
  textValue?: string;
  detail?: string;
  href: string;
}) {
  const { t } = useTranslation();
  const display = textValue ?? (value === undefined ? null : String(value));

  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 p-5 transition hover:border-brand-400 hover:shadow-sm dark:border-slate-800 dark:hover:border-brand-600"
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">
        {display ?? <span className="text-base font-normal text-slate-400">{t("common.loading")}</span>}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </Link>
  );
}
