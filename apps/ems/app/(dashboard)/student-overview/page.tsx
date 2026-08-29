"use client";

import { useState } from "react";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import { usePortalChildren } from "@/lib/use-wallet";
import {
  formatAmount,
  formatMinute,
  useStudentOverview,
} from "@/lib/use-student-overview";

/**
 * Everything about one child, in one view.
 *
 * The rule running through this screen is that a figure the school has no
 * basis for is shown as "not recorded", never as zero. A child with no
 * attendance registers has no attendance rate — and 0% would be read at a
 * parents' evening as a child who never came.
 */
export default function StudentOverviewPage() {
  const isStaff = useCanAuthor();
  const { data: students } = useStudents();
  const { data: children } = usePortalChildren(!isStaff);
  const [chosen, setChosen] = useState<string | null>(null);

  const options = isStaff
    ? (students ?? []).map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` }))
    : (children ?? []).map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName}` }));

  const only = options.length === 1 ? (options[0]?.id ?? null) : null;
  const current = chosen ?? only;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Student dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Where one child stands — attendance, fees, behaviour, books, bus and bed, in one place.
        </p>
      </div>

      {options.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isStaff ? "Student" : "Child"}
          <select
            value={current ?? ""}
            onChange={(event) => setChosen(event.target.value || null)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {current ? <Overview studentProfileId={current} /> : null}
    </div>
  );
}

function Overview({ studentProfileId }: { studentProfileId: string }) {
  const { data, isLoading } = useStudentOverview(studentProfileId);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{data.student.name}</p>
        <p className="text-xs text-slate-500">
          {data.student.class ? `${data.student.class.name} · ${data.student.class.academicYear}` : "Not in a class"}
          {data.student.studentCode && ` · ${data.student.studentCode}`}
        </p>
      </div>

      {/* Listed, not scored. A child is not a risk rating, and one number
          combining fees, attendance and behaviour would invite exactly that
          reading while hiding which of the three needs doing something
          about. */}
      {data.flags.length > 0 && (
        <section className="rounded-2xl border border-amber-300 p-4 dark:border-amber-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Worth a look
          </p>
          <ul className="mt-2 space-y-1">
            {data.flags.map((flag) => (
              <li key={flag} className="text-sm text-amber-700 dark:text-amber-300">
                {flag}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Attendance">
          {data.attendanceRate === null ? (
            <NotRecorded>No registers yet</NotRecorded>
          ) : (
            <>
              <Big>{data.attendanceRate}%</Big>
              <Small>over {data.attendanceDays} days</Small>
            </>
          )}
        </Card>

        <Card label="Fees">
          {data.balanceCents === null ? (
            // Not "0.00 owed": a family who has not been billed is in a
            // different position from one who has settled.
            <NotRecorded>Never invoiced</NotRecorded>
          ) : (
            <>
              <Big tone={data.balanceCents > 0 ? "bad" : "good"}>
                {formatAmount(Math.abs(data.balanceCents))}
              </Big>
              <Small>
                {data.balanceCents > 0
                  ? "still owed"
                  : data.balanceCents < 0
                    ? "overpaid"
                    : "paid up"}
              </Small>
            </>
          )}
        </Card>

        <Card label="Behaviour">
          {data.behaviour === null ? (
            // A child nothing has been written about is not a child assessed
            // and found blameless.
            <NotRecorded>Nothing recorded</NotRecorded>
          ) : (
            <>
              <Big>{data.behaviour.netPoints}</Big>
              <Small>
                {data.behaviour.merits} merit{data.behaviour.merits === 1 ? "" : "s"} ·{" "}
                {data.behaviour.concerns} concern{data.behaviour.concerns === 1 ? "" : "s"}
              </Small>
            </>
          )}
        </Card>

        <Card label="Wallet">
          {data.walletCents === null ? (
            <NotRecorded>No wallet</NotRecorded>
          ) : (
            <>
              <Big>{formatAmount(data.walletCents)}</Big>
              <Small>available</Small>
            </>
          )}
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Panel title="Library">
          {data.loans.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing out.</p>
          ) : (
            <ul className="space-y-1">
              {data.loans.map((loan) => (
                <li key={loan.title} className="text-sm">
                  {loan.title}
                  <span className={`ms-2 text-xs ${loan.overdue ? "text-red-600" : "text-slate-500"}`}>
                    {loan.overdue ? "overdue" : `due ${new Date(loan.dueOn).toLocaleDateString()}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Transport">
          {data.transport ? (
            <p className="text-sm">
              {data.transport.route}
              <span className="block text-xs text-slate-500">
                {data.transport.stop ?? "no stop set"} · {formatMinute(data.transport.pickupMinute)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Not on a route.</p>
          )}
        </Panel>

        <Panel title="Boarding">
          {data.hostel ? (
            <p className="text-sm">
              {data.hostel.block}
              <span className="block text-xs text-slate-500">{data.hostel.room}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Not boarding.</p>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Big({ children, tone }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <p
      className={`text-2xl font-bold tabular-nums ${
        tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""
      }`}
    >
      {children}
    </p>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

/** Said plainly, and styled so it cannot be mistaken for a figure. */
function NotRecorded({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm italic text-slate-400">{children}</p>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
