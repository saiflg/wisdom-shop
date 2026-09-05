"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useSubjects } from "@/lib/use-subjects";
import {
  useAddLessonResource,
  useLessonResources,
  useRemoveLessonResource,
  type LessonResourceRow,
} from "@/lib/use-lesson-resources";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const KINDS = [
  { value: "VIDEO", label: "demos.kindVIDEO" },
  { value: "DOCUMENT", label: "demos.kindDOCUMENT" },
  { value: "LINK", label: "demos.kindLINK" },
] as const satisfies readonly { value: string; label: TranslationKey }[];

/**
 * The videos and documents the AI Teacher is allowed to offer a student.
 *
 * The whole point of this screen is *who chooses the link*. Asked for "a good
 * video about fractions", a model will invent a plausible YouTube address
 * without hesitation, and the failure mode is a child sent to whatever
 * happens to live at that address. So staff curate, and the lesson only
 * decides which of the school's own demonstrations fits what the student is
 * working on.
 *
 * The API has accepted these since the AI Teacher was built. Nothing in the
 * app reached it, so no school could add one, and the panel in the lesson was
 * permanently empty — the feature existed everywhere except where somebody
 * could use it.
 */
export default function DemonstrationsPage() {
  const { t } = useTranslation();
  const subjects = useSubjects();
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const resources = useLessonResources(subjectFilter || undefined);
  const add = useAddLessonResource();
  const remove = useRemoveLessonResource();

  const [form, setForm] = useState({
    subjectId: "",
    title: "",
    url: "",
    kind: "VIDEO" as LessonResourceRow["kind"],
    keywords: "",
    hasCaptions: false,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    setSaved(false);
    try {
      await add.mutateAsync({
        subjectId: form.subjectId,
        title: form.title.trim(),
        url: form.url.trim(),
        kind: form.kind,
        ...(form.keywords.trim() ? { keywords: form.keywords.trim() } : {}),
        hasCaptions: form.hasCaptions,
      });
      setForm({ ...form, title: "", url: "", keywords: "", hasCaptions: false });
      setSaved(true);
    } catch (err) {
      setProblem(errorMessage(err, t("demos.addFailed")));
    }
  };

  const field =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("demos.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("demos.intro")}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t("demos.subject")}
            <select
              required
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              className={field}
            >
              <option value="">{t("demos.chooseSubject")}</option>
              {subjects.data?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.gradeLevel ? ` · ${subject.gradeLevel}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            {t("demos.kind")}
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as LessonResourceRow["kind"] })}
              className={field}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(k.label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          {t("demos.workTitle")}
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t("demos.titlePlaceholder")}
            className={field}
          />
        </label>

        <label className="block text-sm font-medium">
          {t("demos.link")}
          <input
            required
            type="url"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            className={field}
          />
          {/* Only YouTube and Vimeo play inside the lesson; anything else is
              shown as a link the student follows knowingly, because putting an
              arbitrary origin in an iframe hands it a frame in a child's
              session. */}
          <span className="mt-1 block text-xs text-slate-500">
            {t("demos.linkHint")}
          </span>
        </label>

        <label className="block text-sm font-medium">
          {t("demos.keywords")} <span className="font-normal text-slate-500">{t("demos.optional")}</span>
          <input
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
            placeholder={t("demos.keywordsPlaceholder")}
            className={field}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {t("demos.keywordsHint")}
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.hasCaptions}
            onChange={(e) => setForm({ ...form, hasCaptions: e.target.checked })}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            {t("demos.captioned")}
            <span className="block text-xs text-slate-500">
              {t("demos.captionedHint")}
            </span>
          </span>
        </label>

        {problem && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {problem}
          </p>
        )}
        {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("demos.added")}</p>}

        <button
          type="submit"
          disabled={add.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {add.isPending ? t("demos.adding") : t("demos.add")}
        </button>
      </form>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("demos.whatOnOffer")}
          </h2>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">{t("demos.allSubjects")}</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        {resources.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">{t("common.loading")}</p>
        ) : (resources.data?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {t("demos.none")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {resources.data?.map((resource) => (
              <li
                key={resource.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{resource.title}</p>
                  <p className="text-xs text-slate-500">
                    {resource.subject?.name ?? "—"} · {t(`demos.kind${resource.kind}`)}
                    {resource.hasCaptions ? ` · ${t("demos.hasCaptions")}` : ""}
                    {resource.embedUrl
                      ? ` · ${t("demos.playsInLesson")}`
                      : ` · ${t("demos.opensNewTab")}`}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">{resource.url}</p>
                  {resource.keywords && (
                    <p className="text-xs italic text-slate-500">
                      {t("demos.matches", { keywords: resource.keywords })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void remove.mutateAsync(resource.id).catch(() => undefined)}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                >
                  {t("demos.withdraw")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
