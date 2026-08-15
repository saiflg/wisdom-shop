"use client";

import { useClassMembers } from "@/lib/use-class-chat";
import { PersonPhoto } from "./person-photo";

/**
 * Who is in the room, above the conversation.
 *
 * The question a child actually has when they open a class chat is "is
 * anybody there" — asking it should not mean leaving the chat for the class
 * page. Online first, because that is the whole point of the strip.
 *
 * The dot is never the only signal: every name carries a screen-reader label
 * in words, since colour alone is invisible to the people who most need to
 * know whether anyone is about.
 */
export function ClassPresenceStrip({ classId }: { classId: string }) {
  const { data } = useClassMembers(classId);
  if (!data) return null;

  const students = data.students ?? [];
  const online = students.filter((student) => student.online);

  // Staff are listed separately and always shown: a class wants to know
  // whether a teacher is watching, and that is a different question from
  // which of their friends is about.
  const teacherOnline = data.classTeacher?.online ? data.classTeacher : null;

  if (students.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
      <span className="shrink-0 text-xs font-medium text-slate-500">
        {online.length === 0
          ? "Nobody else here right now"
          : `${online.length} here now`}
      </span>

      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {/* Online first, then the rest — sorted by the API already, but the
            filter makes the intent explicit rather than relying on it. */}
        {[...online, ...students.filter((student) => !student.online)]
          .slice(0, 12)
          .map((student) => (
            <li key={student.id} className="relative shrink-0" title={`${student.name} · ${student.label}`}>
              <span className={student.online ? "" : "opacity-40"}>
                <PersonPhoto userId={student.id} name={student.name} size="sm" />
              </span>
              {student.online && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-950"
                  aria-hidden
                />
              )}
              <span className="sr-only">
                {student.name} — {student.label}
              </span>
            </li>
          ))}
      </ul>

      {teacherOnline && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {teacherOnline.name.split(" ")[0]} is here
        </span>
      )}
    </div>
  );
}
