"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { useClasses } from "@/lib/use-classes";
import {
  useAssignClasses,
  useCreateSection,
  useDeleteSection,
  useSections,
  useUpdateSection,
  type Section,
} from "@/lib/use-sections";
import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * The parts a school divides itself into — Primary, Secondary, Islamiyyah.
 *
 * Not class streams: "Grade 5A" and "Grade 5B" are classes, and the letter is
 * already part of the class name. A section is the wing those classes sit in,
 * the same idea staff records already carry as free text, which is why staff
 * turnover can be read "by section".
 */
export default function SectionsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsSchoolAdmin();
  const { data: sections, isLoading } = useSections();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("sections.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("sections.intro")}
        </p>
      </div>

      {isAdmin && <NewSection />}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {sections?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("sections.none")}
        </p>
      )}

      <div className="space-y-3">
        {sections?.map((section) => (
          <SectionRow key={section.id} section={section} isAdmin={isAdmin} />
        ))}
      </div>
    </div>
  );
}

function NewSection() {
  const { t } = useTranslation();
  const create = useCreateSection();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      setName("");
      setDescription("");
    } catch (err) {
      // The duplicate-name conflict is the one a person actually hits, and
      // the API wording already says what happened.
      setError(err instanceof ApiError ? err.message : t("sections.addFailed"));
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("sections.add")}</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder={t("sections.namePlaceholder")}
          aria-label={t("sections.name")}
          className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={300}
          placeholder={t("sections.coversPlaceholder")}
          aria-label={t("sections.covers")}
          className="min-w-[16rem] flex-[2] rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? t("shared.adding") : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function SectionRow({ section, isAdmin }: { section: Section; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = section._count?.classes ?? 0;

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{section.name}</p>
          {section.description && (
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{section.description}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {/* t("sections.noClasses") rather than "0 classes": an empty section is
                a setup step somebody has not finished, not a statistic. */}
            {count === 0 ? t("sections.noClasses") : `${count} ${count === 1 ? "class" : "classes"}`}
            {section.head &&
            ` · ${t("sections.headedBy", {
              name: `${section.head.firstName} ${section.head.lastName}`,
            })}`}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {open ? t("sections.done") : t("sections.edit")}
          </button>
        )}
      </div>

      {open && <SectionEditor section={section} onDone={() => setOpen(false)} />}
    </section>
  );
}

function SectionEditor({ section, onDone }: { section: Section; onDone: () => void }) {
  const { t } = useTranslation();
  const { data: classes } = useClasses();
  const assign = useAssignClasses(section.id);
  const update = useUpdateSection(section.id);
  const remove = useDeleteSection();
  const [name, setName] = useState(section.name);
  const [description, setDescription] = useState(section.description ?? "");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /*
   * Which classes are ticked, before anything is saved.
   *
   * Seeded from the classes whose sectionId is this section rather than from
   * the section list, so the tick boxes and the class list can never
   * disagree — they are the same fact read from one place.
   */
  const current = chosen ?? (classes ?? []).filter((c) => c.sectionId === section.id).map((c) => c.id);

  const toggle = (id: string) =>
    setChosen(current.includes(id) ? current.filter((c) => c !== id) : [...current, id]);

  const save = async () => {
    setNote(null);
    try {
      // Sent together when either has changed. Editing one field at a time
      // was the original mistake here: a description typed wrongly could not
      // be corrected at all, so the only remedy was deleting the section and
      // starting again — which takes its classes with it.
      const renamed = name.trim() && name.trim() !== section.name;
      const redescribed = description.trim() !== (section.description ?? "");
      if (renamed || redescribed) {
        await update.mutateAsync({
          ...(renamed ? { name: name.trim() } : {}),
          ...(redescribed ? { description: description.trim() } : {}),
        });
      }
      await assign.mutateAsync(current);
      onDone();
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("sections.saveFailed"));
    }
  };

  const destroy = async () => {
    setNote(null);
    try {
      await remove.mutateAsync(section.id);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("sections.removeFailed"));
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div>
        <label
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          htmlFor={`section-name-${section.id}`}
        >
          {t("sections.nameLabel")}
        </label>
        <input
          id={`section-name-${section.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          className="mt-1 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <label
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          htmlFor={`section-description-${section.id}`}
        >
          {t("sections.covers")}
        </label>
        <input
          id={`section-description-${section.id}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={300}
          placeholder={t("sections.coversPlaceholder")}
          className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("sections.classesIn")}</p>
        {classes?.length === 0 && <p className="mt-1 text-sm text-slate-500">{t("sections.schoolHasNoClasses")}</p>}
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {classes?.map((schoolClass) => {
            // A class belongs to one section, so ticking it here is also how
            // it leaves the one it was in. Saying so beats an admin
            // discovering it by looking at the other section afterwards.
            const elsewhere = schoolClass.sectionId && schoolClass.sectionId !== section.id;
            return (
              <li key={schoolClass.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={current.includes(schoolClass.id)}
                    onChange={() => toggle(schoolClass.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 truncate">
                    {schoolClass.name}
                    <span className="ms-1 text-xs text-slate-500">{schoolClass.academicYear}</span>
                    {elsewhere && !current.includes(schoolClass.id) && (
                      <span className="ms-1 text-xs text-amber-600">· in another section</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={assign.isPending || update.isPending}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {assign.isPending || update.isPending ? t("shared.saving") : t("shared.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={destroy}
          disabled={remove.isPending}
          className="ms-auto rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-900"
        >
          {t("sections.remove")}
        </button>
      </div>

      {/* Said before it is done, not after. Removing a section is the one
          control here that touches classes an admin did not open this screen
          to change. */}
      <p className="text-xs text-slate-500">
        {t("sections.removeNote")}
      </p>
      {note && <p className="text-xs text-red-600">{note}</p>}
    </div>
  );
}
