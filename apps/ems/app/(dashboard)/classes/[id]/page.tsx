"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { errorMessage } from "@/lib/api";
import { useClassMembers } from "@/lib/use-class-chat";
import { ClassChat } from "@/components/class-chat";
import { PersonPhoto } from "@/components/person-photo";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const LEADERSHIP_KEYS: Record<string, TranslationKey> = {
  PRINCIPAL: "classDetail.rolePrincipal",
  VICE_PRINCIPAL: "classDetail.roleVicePrincipal",
  HEAD_TEACHER: "classDetail.roleHeadTeacher",
};

/**
 * One class: who is in it, who teaches it, and the conversation.
 *
 * The same page for a student and for a teacher, because the answer to "who
 * is in my class" is the same for both. What differs is what the API sends
 * them — roll numbers to staff, names to classmates — rather than which
 * component renders.
 */
/**
 * The leadership title, or whatever the school called the job.
 *
 * The lookup is bound to a const before it is used: indexing a Record twice
 * gives the compiler two unrelated expressions under
 * noUncheckedIndexedAccess, so the null check on the first does not narrow
 * the second.
 */
function leadershipLabel(
  t: (key: TranslationKey) => string,
  leader: { role: string; jobTitle?: string | null },
): string {
  const key = LEADERSHIP_KEYS[leader.role];
  return key ? t(key) : (leader.jobTitle ?? leader.role);
}

export default function ClassPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const classId = params?.id ?? "";
  const { data, isLoading, error } = useClassMembers(classId);

  if (!classId) return null;
  if (isLoading) return <p className="text-sm text-slate-500">{t("classDetail.loading")}</p>;

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/classes" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Classes
        </Link>
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, t("errs.openClass"))}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/classes" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{data.class.name}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {data.class.gradeLevel ? `${data.class.gradeLevel} · ` : ""}
          {data.class.academicYear} · {data.students.length}{" "}
          {data.students.length === 1 ? "student" : "students"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("classDetail.whoTeaches")}</h2>

            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{t("classDetail.classTeacher")}</dt>
                <dd className="mt-0.5 font-medium">
                  {data.classTeacher ? (
                    <>
                      {data.classTeacher.name}
                      {data.classTeacher.online && (
                        <span className="ms-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                          {t("classDetail.online")}
                        </span>
                      )}
                    </>
                  ) : (
                    // Worth saying loudly: a class with no teacher assigned is
                    // also a class whose teachers cannot post in its chat.
                    <span className="text-amber-700 dark:text-amber-400">{t("classDetail.notAssigned")}</span>
                  )}
                </dd>
              </div>

              {data.subjectTeachers.length > 0 && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{t("classDetail.subjectTeachers")}</dt>
                  <dd className="mt-0.5 space-y-1">
                    {data.subjectTeachers.map((teacher) => (
                      <p key={`${teacher.id}-${teacher.subject}`}>
                        {teacher.name} <span className="text-slate-500">· {teacher.subject}</span>
                      </p>
                    ))}
                  </dd>
                </div>
              )}

              {data.leadership.length > 0 && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{t("classDetail.leadership")}</dt>
                  <dd className="mt-0.5 space-y-1">
                    {data.leadership.map((leader) => (
                      <p key={leader.id}>
                        {leader.name}{" "}
                        <span className="text-slate-500">
                          · {leadershipLabel(t, leader)}
                        </span>
                      </p>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("classDetail.members")}</h2>
            {data.students.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t("classDetail.nobodyEnrolled")}</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {data.students.map((student) => (
                  <li key={student.id} className="flex items-center gap-2 text-sm">
                    <span className="relative shrink-0">
                      <PersonPhoto userId={student.id} name={student.name} size="sm" />
                      {student.online && (
                        <span
                          className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950"
                          aria-hidden
                        />
                      )}
                    </span>
                    <span className="min-w-0 truncate">{student.name}</span>
                    {/* Read out for screen readers rather than left as colour
                        alone, which nobody using one would ever learn. */}
                    {student.label && <span className="sr-only">{student.label}</span>}
                    {student.presence === "RECENTLY" && (
                      <span className="shrink-0 text-xs text-slate-400" aria-hidden>
                        recently
                      </span>
                    )}
                    {student.studentCode && (
                      <span className="ms-auto shrink-0 font-mono text-xs text-slate-500">{student.studentCode}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <ClassChat classId={classId} />
      </div>
    </div>
  );
}
