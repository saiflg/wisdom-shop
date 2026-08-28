/**
 * The headline facts about one child, and — more importantly — which of them
 * the school has no basis to state.
 *
 * Every figure here is nullable, and that is the whole design. A child with
 * no attendance registers yet has no attendance rate; reporting 0% would say
 * they never came, and 100% would say they never missed. Both are inventions,
 * and both would be read off this screen in a conversation with a parent.
 */

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface OverviewParts {
  attendance: AttendanceCounts;
  /** Invoiced and paid, in minor units. */
  invoicedCents: number;
  paidCents: number;
  invoiceCount: number;
  behaviour: { merits: number; concerns: number; netPoints: number; records: number };
  libraryOut: number;
  libraryOverdue: number;
  walletCents: number | null;
  hasWallet: boolean;
}

export interface StudentOverview {
  /** Percent, to one decimal. Null when nothing has been recorded. */
  attendanceRate: number | null;
  attendanceDays: number;
  /** Minor units still owed. Null when the child has never been invoiced. */
  balanceCents: number | null;
  invoicedCents: number;
  paidCents: number;
  behaviour: { merits: number; concerns: number; netPoints: number } | null;
  libraryOut: number;
  libraryOverdue: number;
  walletCents: number | null;
  /** Things worth an adult's attention, most pressing first. */
  flags: string[];
}

/**
 * Attendance as a percentage of the days actually recorded.
 *
 * EXCUSED is counted as present, not as an absence and not as a day that
 * never happened. A child excused for a medical appointment did not truant,
 * and a rate that punished them for it would be quoted back at a family who
 * did everything right.
 */
export function attendanceRate(counts: AttendanceCounts): number | null {
  const recorded = counts.present + counts.absent + counts.late + counts.excused;
  if (recorded === 0) return null;
  const attended = counts.present + counts.late + counts.excused;
  return Math.round((attended / recorded) * 1000) / 10;
}

/**
 * What is still owed, or null when there is nothing to owe it against.
 *
 * Null rather than zero for a child who has never been invoiced. Zero says
 * "paid up", and a family who has not yet been billed is in a different
 * position from one who has settled.
 */
export function balanceOf(invoicedCents: number, paidCents: number, invoiceCount: number): number | null {
  if (invoiceCount === 0) return null;
  return invoicedCents - paidCents;
}

/**
 * The things somebody should look at, most pressing first.
 *
 * Deliberately short and deliberately not a score. A child is not a risk
 * rating, and a single number combining fees, attendance and behaviour would
 * invite exactly that reading — while hiding which of the three actually
 * needs doing something about.
 */
export function flagsFor(parts: OverviewParts): string[] {
  const flags: string[] = [];

  if (parts.libraryOverdue > 0) {
    flags.push(
      parts.libraryOverdue === 1
        ? "1 library book overdue"
        : `${parts.libraryOverdue} library books overdue`,
    );
  }

  const rate = attendanceRate(parts.attendance);
  if (rate !== null && rate < 90) flags.push(`Attendance is ${rate}%`);

  const balance = balanceOf(parts.invoicedCents, parts.paidCents, parts.invoiceCount);
  if (balance !== null && balance > 0) flags.push("Fees outstanding");

  // Concerns are flagged only when they outweigh merits. A child with four
  // merits and one concern is having a good term, and surfacing the concern
  // on its own would misrepresent them to whoever opens this next.
  if (parts.behaviour.concerns > parts.behaviour.merits) {
    flags.push("More concerns than merits recorded");
  }

  return flags;
}

export function buildOverview(parts: OverviewParts): StudentOverview {
  const counts = parts.attendance;
  return {
    attendanceRate: attendanceRate(counts),
    attendanceDays: counts.present + counts.absent + counts.late + counts.excused,
    balanceCents: balanceOf(parts.invoicedCents, parts.paidCents, parts.invoiceCount),
    invoicedCents: parts.invoicedCents,
    paidCents: parts.paidCents,
    // Null rather than zeroes when nothing has been written about them, so
    // the screen can say "nothing recorded" instead of showing a child with
    // a clean sheet as though it had been assessed.
    behaviour:
      parts.behaviour.records === 0
        ? null
        : {
            merits: parts.behaviour.merits,
            concerns: parts.behaviour.concerns,
            netPoints: parts.behaviour.netPoints,
          },
    libraryOut: parts.libraryOut,
    libraryOverdue: parts.libraryOverdue,
    walletCents: parts.hasWallet ? parts.walletCents : null,
    flags: flagsFor(parts),
  };
}
