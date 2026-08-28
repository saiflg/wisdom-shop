"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useCanAuthor } from "@/lib/use-can-author";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";

type MeetingState = "CANCELLED" | "FINISHED" | "LIVE" | "SOON" | "SCHEDULED";

const STATE_LABEL: Record<MeetingState, string> = {
  LIVE: "Happening now",
  SOON: "Starting shortly",
  SCHEDULED: "Scheduled",
  FINISHED: "Finished",
  CANCELLED: "Cancelled",
};

const STATE_STYLE: Record<MeetingState, string> = {
  LIVE: "bg-emerald-600 text-white",
  SOON: "bg-blue-600 text-white",
  SCHEDULED: "bg-slate-500 text-white",
  FINISHED: "bg-slate-400 text-white",
  CANCELLED: "bg-amber-500 text-white",
};

interface Lesson {
  id: string;
  title: string;
  subject: { id: string; name: string } | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  createdByName: string;
  state: MeetingState;
  canJoin: boolean;
  /** Null until the lesson is close enough to join, for anybody who is not staff. */
  meetingUrl: string | null;
}

const KEY = ["live-classroom"];

function useLessons(classId: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, classId],
    enabled: enabled && Boolean(classId),
    queryFn: () =>
      apiFetch<Lesson[]>(`/v1/live-classroom?classId=${classId}`, { headers: authHeaders(accessToken) }),
  });
}

/**
 * Live lessons.
 *
 * This schedules a link to a meeting the school runs elsewhere. It does not
 * host video, and the page says so — a screen implying the school had its own
 * classroom would have children turning up to something that does not exist.
 */
export default function LiveClassroomPage() {
  const isStaff = useCanAuthor();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState("");
  const { data: lessons, isLoading } = useLessons(classId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live classroom</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Scheduled online lessons. The school runs the meeting itself on Zoom, Meet or Teams — this is where
          the time and the link live, so a class can find them in one place.
        </p>
      </div>

      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Class
        <select
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Choose a class…</option>
          {classes?.map((schoolClass) => (
            <option key={schoolClass.id} value={schoolClass.id}>
              {schoolClass.name} · {schoolClass.academicYear}
            </option>
          ))}
        </select>
      </label>

      {isStaff && classId && <ScheduleLesson classId={classId} />}

      {isLoading && classId && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {classId && lessons?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nothing scheduled for this class.</p>
      )}

      <div className="space-y-2">
        {lessons?.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} isStaff={isStaff} />
        ))}
      </div>
    </div>
  );
}

function LessonRow({ lesson, isStaff }: { lesson: Lesson; isStaff: boolean }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthQueryState().accessToken;
  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/live-classroom/${lesson.id}/cancel`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {lesson.title}
            {lesson.subject && <span className="ml-2 text-xs text-slate-500">{lesson.subject.name}</span>}
          </p>
          <p className="text-xs text-slate-500">
            {new Date(lesson.startsAt).toLocaleString()} · {lesson.createdByName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_STYLE[lesson.state]}`}>
            {STATE_LABEL[lesson.state]}
          </span>

          {/* The link only exists once it is time. A child given it on Monday
              for a Friday lesson can open an empty meeting room unsupervised
              at any point in between. */}
          {lesson.meetingUrl && lesson.canJoin && (
            <a
              href={lesson.meetingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
            >
              Join
            </a>
          )}
          {!lesson.canJoin && lesson.state === "SCHEDULED" && (
            <span className="text-xs text-slate-500">Link appears 15 minutes before</span>
          )}

          {isStaff && !lesson.cancelledAt && lesson.state !== "FINISHED" && (
            <button
              type="button"
              onClick={() => cancel.mutateAsync()}
              disabled={cancel.isPending}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function ScheduleLesson({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthQueryState().accessToken;
  const { data: subjects } = useSubjects();
  const schedule = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch("/v1/live-classroom", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const [form, setForm] = useState({ title: "", subjectId: "", meetingUrl: "", startsAt: "", endsAt: "" });
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await schedule.mutateAsync({
            classId,
            subjectId: form.subjectId || undefined,
            title: form.title.trim(),
            meetingUrl: form.meetingUrl.trim(),
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString(),
          });
          setForm({ ...form, title: "", meetingUrl: "" });
        } catch (err) {
          // Where "links have to be from zoom.us, meet.google.com…" surfaces.
          setError(err instanceof ApiError ? err.message : "Could not schedule that");
        }
      }}
      className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Schedule a lesson</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
          maxLength={200}
          placeholder="Fractions revision"
          aria-label="Title"
          className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <select
          value={form.subjectId}
          onChange={(event) => setForm({ ...form, subjectId: event.target.value })}
          aria-label="Subject"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">No subject</option>
          {subjects?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
          required
          aria-label="Starts"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          type="datetime-local"
          value={form.endsAt}
          onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
          required
          aria-label="Ends"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <input
        value={form.meetingUrl}
        onChange={(event) => setForm({ ...form, meetingUrl: event.target.value })}
        required
        maxLength={500}
        placeholder="https://meet.google.com/abc-defg-hij"
        aria-label="Meeting link"
        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <p className="mt-2 text-xs text-slate-500">
        Zoom, Google Meet, Teams, Whereby or Jitsi, over https. Other addresses are refused — children click
        whatever is put in front of them.
      </p>
      <button
        type="submit"
        disabled={schedule.isPending || !form.title.trim() || !form.meetingUrl.trim()}
        className="mt-3 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {schedule.isPending ? "Scheduling…" : "Schedule"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
