import { formatMinute } from "./timetable-rules";

/**
 * Turns "we run 08:00 to 14:00 with eight lessons and a break after the
 * fourth" into actual period boundaries.
 *
 * A school states the shape of its day once; typing eight start and end times
 * by hand is slower and is how a day ends up with a gap or an overlap that
 * nobody spots until two classes are booked into the same minute.
 *
 * Leftover minutes are reported rather than absorbed. If eight lessons and a
 * thirty-minute break do not divide the day evenly, the remainder is real and
 * a head teacher should see it — silently stretching the last period is how
 * a timetable stops matching the bell.
 */

export interface DayShape {
  dayStartMinute: number;
  dayEndMinute: number;
  periodsPerDay: number;
  /** Break placed after this many periods. Null or 0 means no break. */
  breakAfterPeriod?: number | null;
  breakLengthMinutes?: number;
}

export interface DerivedPeriod {
  label: string;
  startMinute: number;
  endMinute: number;
  isTeaching: boolean;
}

export interface DerivedDay {
  periods: DerivedPeriod[];
  /** Minutes of the day not covered, because the division was not exact. */
  leftoverMinutes: number;
  periodLengthMinutes: number;
}

/** The shortest lesson worth timetabling. Below this, something is wrong. */
const MIN_PERIOD_MINUTES = 5;

export function validateDayShape(shape: DayShape): string | null {
  const { dayStartMinute, dayEndMinute, periodsPerDay } = shape;

  if (!Number.isInteger(dayStartMinute) || !Number.isInteger(dayEndMinute)) {
    return "The school day needs whole-minute start and end times";
  }
  if (dayStartMinute < 0 || dayEndMinute > 24 * 60) {
    return "The school day must fall inside a single day";
  }
  if (dayEndMinute <= dayStartMinute) {
    return "The school day ends at or before it starts";
  }
  if (!Number.isInteger(periodsPerDay) || periodsPerDay < 1) {
    return "A school day needs at least one period";
  }

  const breakAfter = shape.breakAfterPeriod ?? 0;
  const breakLength = breakAfter > 0 ? (shape.breakLengthMinutes ?? 0) : 0;

  if (breakAfter < 0 || breakAfter > periodsPerDay) {
    return `A break cannot come after period ${breakAfter} when there are only ${periodsPerDay}`;
  }
  if (breakAfter > 0 && breakLength <= 0) {
    return "A break needs a length";
  }

  const teachingMinutes = dayEndMinute - dayStartMinute - breakLength;
  if (teachingMinutes < periodsPerDay * MIN_PERIOD_MINUTES) {
    // Refused rather than producing two-minute lessons, which would look
    // like the software had misunderstood rather than the request being
    // impossible.
    return `${periodsPerDay} periods and a ${breakLength}-minute break do not fit between ${formatMinute(
      dayStartMinute,
    )} and ${formatMinute(dayEndMinute)}`;
  }

  return null;
}

/**
 * Derives the day.
 *
 * Periods are laid end to end from the start time, so they touch exactly —
 * the timetable's own rule allows touching periods and forbids overlapping
 * ones, and building them by accumulation rather than by multiplying an
 * index means rounding cannot make them drift apart.
 */
export function derivePeriods(shape: DayShape): DerivedDay {
  const problem = validateDayShape(shape);
  if (problem) throw new Error(problem);

  const breakAfter = shape.breakAfterPeriod ?? 0;
  const breakLength = breakAfter > 0 ? (shape.breakLengthMinutes ?? 0) : 0;

  const teachingMinutes = shape.dayEndMinute - shape.dayStartMinute - breakLength;
  const periodLengthMinutes = Math.floor(teachingMinutes / shape.periodsPerDay);
  const leftoverMinutes = teachingMinutes - periodLengthMinutes * shape.periodsPerDay;

  const periods: DerivedPeriod[] = [];
  let cursor = shape.dayStartMinute;

  for (let index = 1; index <= shape.periodsPerDay; index += 1) {
    periods.push({
      label: `Period ${index}`,
      startMinute: cursor,
      endMinute: cursor + periodLengthMinutes,
      isTeaching: true,
    });
    cursor += periodLengthMinutes;

    if (breakAfter > 0 && index === breakAfter) {
      periods.push({
        label: "Break",
        startMinute: cursor,
        endMinute: cursor + breakLength,
        isTeaching: false,
      });
      cursor += breakLength;
    }
  }

  return { periods, leftoverMinutes, periodLengthMinutes };
}
