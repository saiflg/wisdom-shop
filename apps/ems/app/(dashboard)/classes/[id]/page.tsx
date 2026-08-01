"use client";

import { useParams } from "next/navigation";
import { useClass } from "@/lib/use-classes";

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: klass, isLoading, error } = useClass(params.id);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load this class: {error.message}
      </p>
    );
  }
  if (!klass) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{klass.name}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {klass.gradeLevel ? `${klass.gradeLevel} · ` : ""}
          {klass.academicYear}
          {klass.homeroomTeacher && ` · Homeroom: ${klass.homeroomTeacher.firstName} ${klass.homeroomTeacher.lastName}`}
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Enrolled students</h2>
        {(!klass.enrollments || klass.enrollments.length === 0) && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No students enrolled yet.</p>
        )}
        {klass.enrollments && klass.enrollments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {klass.enrollments.map((enrollment) => (
              <li key={enrollment.id} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
                {enrollment.studentProfile.user.firstName} {enrollment.studentProfile.user.lastName}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
