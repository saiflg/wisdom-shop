"use client";

import { useAuthStore } from "@/store/auth-store";

/**
 * May this person create and edit teaching material?
 *
 * Lesson plans, schemes of work, subjects, classes and quizzes are all
 * staff-authored and student-readable. The API has always enforced that with
 * `@Roles("SCHOOL_ADMIN", "TEACHER")`; what it could not do is stop the
 * console *offering* a student a "New lesson plan" form that would then be
 * refused — which is this project's standing complaint about controls that
 * look real and do nothing, aimed at the people least able to interpret the
 * failure.
 *
 * One hook rather than a role check per page, so a sixth page cannot get it
 * subtly different.
 */
export function useCanAuthor(): boolean {
  const roles = useAuthStore((state) => state.user?.roles);
  return Boolean(roles?.some((role) => role === "SCHOOL_ADMIN" || role === "TEACHER"));
}

/** Narrower: things only an administrator sets up, like subjects and classes. */
export function useIsSchoolAdmin(): boolean {
  const roles = useAuthStore((state) => state.user?.roles);
  return Boolean(roles?.includes("SCHOOL_ADMIN"));
}
