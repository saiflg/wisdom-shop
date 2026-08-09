"use client";

import { useParams } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { ExamBuilder } from "@/components/exam-builder";
import { ExamPlayer } from "@/components/exam-player";

/**
 * One exam — a completely different page depending on who is looking.
 *
 * Split by role here rather than inside one component, because the two views
 * share nothing: a teacher's page loads the paper *with* its answer key, and
 * a student's must never be able to. Keeping them apart means there is no
 * branch inside a single render tree where the wrong one could be reached.
 */
export default function ExamPage() {
  const params = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const isStaff = Boolean(user?.roles.some((role) => role === "SCHOOL_ADMIN" || role === "TEACHER"));

  if (!params?.id) return null;
  return isStaff ? <ExamBuilder examId={params.id} /> : <ExamPlayer examId={params.id} />;
}
