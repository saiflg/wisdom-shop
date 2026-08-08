import { compositeKey, type ImportSpec, type RowPlan } from "./import-engine";
import type { ExportColumn } from "./workbook";

/**
 * What each entity looks like as a spreadsheet.
 *
 * One definition per entity rather than one endpoint per entity: the rules
 * that make import safe — dry run, row numbering, key matching — are the same
 * whatever is being imported, and duplicating them five times is how five
 * subtly different behaviours end up shipping.
 *
 * `apply` is deliberately given a plain client and one row. It is the only
 * part that writes, and keeping it small keeps the dangerous surface small.
 */
export interface EntityDefinition {
  name: string;
  label: string;
  /** Columns the export and the downloadable template both use. */
  columns: ExportColumn[];
  spec: ImportSpec;
  loadExistingKeys(client: TenantClient): Promise<Set<string>>;
  exportRows(client: TenantClient): Promise<Record<string, string>[]>;
  apply(client: TenantClient, row: RowPlan): Promise<void>;
}

/**
 * Structurally typed rather than importing the generated Prisma client type,
 * which keeps this file readable and avoids a hard dependency on generated
 * code that changes shape every migration.
 */
type TenantClient = {
  studentProfile: AnyDelegate;
  user: AnyDelegate;
  staffProfile: AnyDelegate;
  guardianLink: AnyDelegate;
  subject: AnyDelegate;
  class: AnyDelegate;
  timetableEntry: AnyDelegate;
  timetablePeriod: AnyDelegate;
  assessment: AnyDelegate;
  mark: AnyDelegate;
  schemeOfWork: AnyDelegate;
};

type AnyDelegate = {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args?: unknown) => Promise<Record<string, unknown> | null>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  upsert?: (args: unknown) => Promise<Record<string, unknown>>;
};

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const isoDate = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : text(value);

// ─────────────────────────────────────────────────────────────── students

const students: EntityDefinition = {
  name: "students",
  label: "Students",
  columns: [
    { header: "Admission number", field: "studentCode" },
    { header: "First name", field: "firstName" },
    { header: "Last name", field: "lastName" },
    { header: "Email", field: "email" },
    { header: "Date of birth", field: "dateOfBirth" },
  ],
  spec: {
    keyField: "studentCode",
    columns: [
      { field: "studentCode", headers: ["Admission number", "studentCode"], required: true },
      { field: "firstName", headers: ["First name"], required: true },
      { field: "lastName", headers: ["Last name"], required: true },
      { field: "email", headers: ["Email"] },
      { field: "dateOfBirth", headers: ["Date of birth"], kind: "date" },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.studentProfile.findMany({
      where: { deletedAt: null, studentCode: { not: null } },
      select: { studentCode: true },
    });
    return new Set(rows.map((row) => text(row.studentCode)));
  },

  async exportRows(client) {
    const rows = await client.studentProfile.findMany({
      where: { deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => {
      const user = row.user as Record<string, unknown>;
      return {
        studentCode: text(row.studentCode),
        firstName: text(user.firstName),
        lastName: text(user.lastName),
        email: text(user.email),
        dateOfBirth: isoDate(row.dateOfBirth),
      };
    });
  },

  async apply(client, row) {
    const { studentCode, firstName, lastName, email, dateOfBirth } = row.values;
    const existing = await client.studentProfile.findFirst({
      where: { studentCode, deletedAt: null },
      include: { user: true },
    });

    const userData = {
      firstName,
      lastName,
      ...(email ? { email } : {}),
    };

    if (existing) {
      await client.user.update({ where: { id: existing.userId as string }, data: userData });
      await client.studentProfile.update({
        where: { id: existing.id as string },
        data: { ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}) },
      });
      return;
    }

    await client.studentProfile.create({
      data: {
        studentCode,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        user: { create: { ...userData, roles: ["STUDENT"] } },
      },
    });
  },
};

// ────────────────────────────────────────────────────────────────── staff

const staff: EntityDefinition = {
  name: "staff",
  label: "Staff",
  columns: [
    { header: "Staff number", field: "staffNumber" },
    { header: "First name", field: "firstName" },
    { header: "Last name", field: "lastName" },
    { header: "Email", field: "email" },
    { header: "Job title", field: "jobTitle" },
    { header: "Employment type", field: "employmentType" },
    { header: "Start date", field: "startDate" },
    { header: "Bank name", field: "bankName" },
    { header: "Bank code", field: "bankCode" },
    { header: "Account name", field: "accountName" },
    // Masked, always. A spreadsheet of every staff member's full account
    // number is a serious leak the moment it is forwarded, and this file is
    // built to be emailed around. The full value has its own audited route.
    { header: "Account number (masked)", field: "accountNumberMasked" },
  ],
  spec: {
    keyField: "staffNumber",
    columns: [
      { field: "staffNumber", headers: ["Staff number"], required: true },
      { field: "firstName", headers: ["First name"], required: true },
      { field: "lastName", headers: ["Last name"], required: true },
      { field: "email", headers: ["Email"] },
      { field: "jobTitle", headers: ["Job title"] },
      {
        field: "employmentType",
        headers: ["Employment type"],
        kind: "choice",
        choices: ["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"],
      },
      { field: "startDate", headers: ["Start date"], kind: "date" },
      { field: "bankName", headers: ["Bank name"] },
      { field: "bankCode", headers: ["Bank code"] },
      { field: "accountName", headers: ["Account name"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.staffProfile.findMany({
      where: { deletedAt: null, staffNumber: { not: null } },
      select: { staffNumber: true },
    });
    return new Set(rows.map((row) => text(row.staffNumber)));
  },

  async exportRows(client) {
    const rows = await client.staffProfile.findMany({
      where: { deletedAt: null },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => {
      const user = row.user as Record<string, unknown>;
      return {
        staffNumber: text(row.staffNumber),
        firstName: text(user.firstName),
        lastName: text(user.lastName),
        email: text(user.email),
        jobTitle: text(row.jobTitle),
        employmentType: text(row.employmentType),
        startDate: isoDate(row.startDate),
        bankName: text(row.bankName),
        bankCode: text(row.bankCode),
        accountName: text(row.accountName),
        // Filled in by the service, which holds the decryption key.
        accountNumberMasked: text(row.accountNumberMasked),
      };
    });
  },

  /**
   * Staff import never touches the account number.
   *
   * There is no column for it and no branch that writes it — bank details are
   * changed one person at a time, through a route that validates them, rather
   * than in bulk from a file that has been round-tripped through email.
   */
  async apply(client, row) {
    const { staffNumber, firstName, lastName, email, jobTitle, employmentType, startDate } = row.values;
    const { bankName, bankCode, accountName } = row.values;

    const existing = await client.staffProfile.findFirst({
      where: { staffNumber, deletedAt: null },
      include: { user: true },
    });

    const profileData = {
      jobTitle: jobTitle ?? null,
      employmentType: employmentType ?? null,
      startDate: startDate ? new Date(startDate) : null,
      bankName: bankName ?? null,
      bankCode: bankCode ?? null,
      accountName: accountName ?? null,
    };

    if (existing) {
      await client.user.update({
        where: { id: existing.userId as string },
        data: { firstName, lastName, ...(email ? { email } : {}) },
      });
      await client.staffProfile.update({ where: { id: existing.id as string }, data: profileData });
      return;
    }

    const user = await client.user.create({
      data: { firstName, lastName, ...(email ? { email } : {}), roles: ["TEACHER"] },
    });
    await client.staffProfile.create({
      data: { userId: user.id as string, staffNumber, ...profileData },
    });
  },
};

// ──────────────────────────────────────────────────────────────── parents

const parents: EntityDefinition = {
  name: "parents",
  label: "Parents and guardians",
  columns: [
    { header: "Email", field: "email" },
    { header: "First name", field: "firstName" },
    { header: "Last name", field: "lastName" },
    { header: "Phone", field: "phone" },
    { header: "Child admission number", field: "studentCode" },
    { header: "Relationship", field: "relationship" },
  ],
  spec: {
    // Email rather than a guardian number: schools do not issue those, and a
    // parent's address is what they are already identified by everywhere else.
    keyField: "email",
    columns: [
      { field: "email", headers: ["Email"], required: true },
      { field: "firstName", headers: ["First name"], required: true },
      { field: "lastName", headers: ["Last name"], required: true },
      { field: "phone", headers: ["Phone"] },
      { field: "studentCode", headers: ["Child admission number", "studentCode"], required: true },
      { field: "relationship", headers: ["Relationship"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.user.findMany({
      where: { deletedAt: null, roles: { has: "GUARDIAN" }, email: { not: null } },
      select: { email: true },
    });
    return new Set(rows.map((row) => text(row.email)));
  },

  async exportRows(client) {
    const links = await client.guardianLink.findMany({
      include: { guardianUser: true, studentProfile: true },
      orderBy: { createdAt: "asc" },
    });
    return links.map((link) => {
      const guardian = link.guardianUser as Record<string, unknown>;
      const student = link.studentProfile as Record<string, unknown>;
      return {
        email: text(guardian.email),
        firstName: text(guardian.firstName),
        lastName: text(guardian.lastName),
        phone: text(guardian.phone),
        studentCode: text(student.studentCode),
        relationship: text(link.relationship),
      };
    });
  },

  /**
   * A parent row that names a child the school does not have is an error, not
   * an invitation to create one. Importing parents must never quietly invent
   * students — the admission number is far more likely to be a typo.
   */
  async apply(client, row) {
    const { email, firstName, lastName, phone, studentCode, relationship } = row.values;

    const student = await client.studentProfile.findFirst({ where: { studentCode, deletedAt: null } });
    if (!student) throw new Error(`No student with admission number ${studentCode}`);

    let guardian = await client.user.findFirst({ where: { email, deletedAt: null } });
    if (guardian) {
      await client.user.update({
        where: { id: guardian.id as string },
        data: { firstName, lastName, ...(phone ? { phone } : {}) },
      });
    } else {
      guardian = await client.user.create({
        data: { email, firstName, lastName, ...(phone ? { phone } : {}), roles: ["GUARDIAN"] },
      });
    }

    const link = await client.guardianLink.findFirst({
      where: { guardianUserId: guardian.id as string, studentProfileId: student.id as string },
    });
    if (!link) {
      await client.guardianLink.create({
        data: {
          guardianUserId: guardian.id as string,
          studentProfileId: student.id as string,
          relationship: relationship || "Guardian",
        },
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────── subjects

const subjects: EntityDefinition = {
  name: "subjects",
  label: "Subjects",
  columns: [
    { header: "Name", field: "name" },
    { header: "Grade level", field: "gradeLevel" },
  ],
  spec: {
    keyField: "name",
    columns: [
      { field: "name", headers: ["Name", "Subject"], required: true },
      { field: "gradeLevel", headers: ["Grade level"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.subject.findMany({ where: { deletedAt: null }, select: { name: true } });
    return new Set(rows.map((row) => text(row.name)));
  },

  async exportRows(client) {
    const rows = await client.subject.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return rows.map((row) => ({ name: text(row.name), gradeLevel: text(row.gradeLevel) }));
  },

  async apply(client, row) {
    const { name, gradeLevel } = row.values;
    const existing = await client.subject.findFirst({ where: { name, deletedAt: null } });
    if (existing) {
      await client.subject.update({
        where: { id: existing.id as string },
        data: { gradeLevel: gradeLevel ?? null },
      });
      return;
    }
    await client.subject.create({ data: { name, gradeLevel: gradeLevel ?? null } });
  },
};

// ──────────────────────────────────────────────────────────────── classes

const classes: EntityDefinition = {
  name: "classes",
  label: "Classes",
  columns: [
    { header: "Name", field: "name" },
    { header: "Academic year", field: "academicYear" },
    { header: "Grade level", field: "gradeLevel" },
  ],
  spec: {
    keyField: "name",
    columns: [
      { field: "name", headers: ["Name", "Class"], required: true },
      { field: "academicYear", headers: ["Academic year"], required: true },
      { field: "gradeLevel", headers: ["Grade level"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.class.findMany({ where: { deletedAt: null }, select: { name: true } });
    return new Set(rows.map((row) => text(row.name)));
  },

  async exportRows(client) {
    const rows = await client.class.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return rows.map((row) => ({
      name: text(row.name),
      academicYear: text(row.academicYear),
      gradeLevel: text(row.gradeLevel),
    }));
  },

  async apply(client, row) {
    const { name, academicYear, gradeLevel } = row.values;
    const existing = await client.class.findFirst({ where: { name, deletedAt: null } });
    if (existing) {
      await client.class.update({
        where: { id: existing.id as string },
        data: { academicYear, gradeLevel: gradeLevel ?? null },
      });
      return;
    }
    await client.class.create({ data: { name, academicYear, gradeLevel: gradeLevel ?? null } });
  },
};

// ─────────────────────────────────────────────────────────── timetable
//
// The first entity whose identity is a *slot* rather than a person: a lesson
// is identified by class, day and period together. One row per lesson rather
// than a week-shaped grid, because a grid's meaning lives in its column
// positions and a spreadsheet with a column inserted would silently move
// every lesson along by one.

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

const timetable: EntityDefinition = {
  name: "timetable",
  label: "Timetable",
  columns: [
    { header: "Class", field: "className" },
    { header: "Day", field: "day" },
    { header: "Period", field: "period" },
    { header: "Subject", field: "subject" },
    { header: "Teacher email", field: "teacherEmail" },
  ],
  spec: {
    keyField: "className",
    additionalKeyFields: ["day", "period"],
    columns: [
      { field: "className", headers: ["Class"], required: true },
      { field: "day", headers: ["Day"], required: true, kind: "choice", choices: WEEKDAYS },
      { field: "period", headers: ["Period"], required: true },
      { field: "subject", headers: ["Subject"], required: true },
      // Email rather than a name: two teachers can share a name, and an
      // import that guesses between them puts someone in the wrong room.
      { field: "teacherEmail", headers: ["Teacher email", "Teacher"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.timetableEntry.findMany({
      include: { class: true, period: true },
    });
    return new Set(
      rows.map((row) =>
        compositeKey([
          text((row.class as Record<string, unknown>)?.name),
          text(row.weekday),
          text((row.period as Record<string, unknown>)?.label),
        ]),
      ),
    );
  },

  async exportRows(client) {
    const rows = await client.timetableEntry.findMany({
      include: { class: true, subject: true, period: true, teacher: true },
      orderBy: [{ weekday: "asc" }],
    });
    return rows.map((row) => ({
      className: text((row.class as Record<string, unknown>)?.name),
      day: text(row.weekday),
      period: text((row.period as Record<string, unknown>)?.label),
      subject: text((row.subject as Record<string, unknown>)?.name),
      teacherEmail: text((row.teacher as Record<string, unknown>)?.email),
    }));
  },

  async apply(client, row) {
    const { className, day, period, subject, teacherEmail } = row.values;

    const klass = await client.class.findFirst({ where: { name: className, deletedAt: null } });
    if (!klass) throw new Error(`No class called "${className}"`);

    const subjectRecord = await client.subject.findFirst({ where: { name: subject, deletedAt: null } });
    if (!subjectRecord) throw new Error(`No subject called "${subject}"`);

    const teacher = teacherEmail
      ? await client.user.findFirst({ where: { email: teacherEmail, deletedAt: null } })
      : null;
    if (teacherEmail && !teacher) throw new Error(`No staff member with the email "${teacherEmail}"`);

    const data = {
      subjectId: subjectRecord.id as string,
      teacherUserId: (teacher?.id as string) ?? null,
    };

    // Matched through the period *relation*, on the same three things the
    // key is built from, rather than by resolving a period id first. Nothing
    // makes a period's label unique, so resolving "Period 1" to an id picks
    // one arbitrarily — and if the lesson already in that slot points at the
    // other one, the update silently becomes a second lesson in the same
    // period. Which is exactly what happened the first time this ran.
    const existing = await client.timetableEntry.findFirst({
      where: { classId: klass.id as string, weekday: day, period: { label: period } },
    });

    if (existing) {
      await client.timetableEntry.update({ where: { id: existing.id as string }, data });
      return;
    }

    const candidates = await client.timetablePeriod.findMany({ where: { label: period } });
    if (candidates.length === 0) {
      throw new Error(`No period called "${period}" — set the school day up first`);
    }
    if (candidates.length > 1) {
      // Refused rather than guessed: two periods share this name, and picking
      // one would put the lesson at a time nobody chose.
      throw new Error(
        `There is more than one period called "${period}". Rename them so each is distinct, then import again.`,
      );
    }

    await client.timetableEntry.create({
      data: {
        classId: klass.id as string,
        weekday: day,
        periodId: candidates[0].id as string,
        ...data,
      },
    });
  },
};

// ───────────────────────────────────────────────────────────── results
//
// Long format — one row per mark — rather than a wide student-by-subject
// grid. A wide grid cannot say which assessment a column is without encoding
// it in the header, and hand-edited headers are exactly what goes wrong.

const results: EntityDefinition = {
  name: "results",
  label: "Results and marks",
  columns: [
    { header: "Admission number", field: "studentCode" },
    { header: "Assessment", field: "assessment" },
    { header: "Score", field: "score" },
    { header: "Out of", field: "maxScore" },
  ],
  spec: {
    keyField: "studentCode",
    additionalKeyFields: ["assessment"],
    columns: [
      { field: "studentCode", headers: ["Admission number", "studentCode"], required: true },
      { field: "assessment", headers: ["Assessment"], required: true },
      {
        field: "score",
        headers: ["Score", "Mark"],
        required: true,
        kind: "number",
        // Caught here rather than at write time so it is reported against the
        // row number, next to the other problems in the same file.
        validate: (value) => (Number(value) < 0 ? "Score cannot be negative" : null),
      },
      { field: "maxScore", headers: ["Out of", "Maximum"], kind: "number" },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.mark.findMany({
      include: { studentProfile: true, assessment: true },
    });
    return new Set(
      rows.map((row) =>
        compositeKey([
          text((row.studentProfile as Record<string, unknown>)?.studentCode),
          text((row.assessment as Record<string, unknown>)?.title),
        ]),
      ),
    );
  },

  async exportRows(client) {
    const rows = await client.mark.findMany({
      include: { studentProfile: true, assessment: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => {
      const assessment = row.assessment as Record<string, unknown>;
      return {
        studentCode: text((row.studentProfile as Record<string, unknown>)?.studentCode),
        assessment: text(assessment?.title),
        score: text(row.score),
        maxScore: text(assessment?.maxScore),
      };
    });
  },

  async apply(client, row) {
    const { studentCode, assessment, score } = row.values;

    const student = await client.studentProfile.findFirst({ where: { studentCode, deletedAt: null } });
    if (!student) throw new Error(`No student with admission number "${studentCode}"`);

    const assessmentRecord = await client.assessment.findFirst({ where: { title: assessment } });
    if (!assessmentRecord) throw new Error(`No assessment called "${assessment}"`);

    const numericScore = Number(score);
    const maxScore = Number(assessmentRecord.maxScore ?? 0);
    if (maxScore > 0 && numericScore > maxScore) {
      throw new Error(`Score ${score} is more than the ${maxScore} this assessment is out of`);
    }

    const existing = await client.mark.findFirst({
      where: { studentProfileId: student.id as string, assessmentId: assessmentRecord.id as string },
    });

    if (existing) {
      await client.mark.update({ where: { id: existing.id as string }, data: { score: numericScore } });
      return;
    }

    await client.mark.create({
      data: {
        studentProfileId: student.id as string,
        assessmentId: assessmentRecord.id as string,
        score: numericScore,
      },
    });
  },
};

// ────────────────────────────────────────────────────────── curriculum
//
// One row per *week* of a scheme of work, with objectives and activities as
// lists inside a cell. The alternative — a row per objective — would repeat
// the week's topic on every line and make it possible for two rows to
// disagree about it.

const LIST_SEPARATOR = ";";

const splitList = (value: string): string[] =>
  value
    .split(LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);

interface SchemeWeek {
  weekNumber: number;
  topic: string;
  objectives: string[];
  activities: string[];
}

const curriculum: EntityDefinition = {
  name: "curriculum",
  label: "Curriculum (schemes of work)",
  columns: [
    { header: "Subject", field: "subject" },
    { header: "Academic year", field: "academicYear" },
    { header: "Term", field: "term" },
    { header: "Week", field: "weekNumber" },
    { header: "Topic", field: "topic" },
    { header: "Objectives", field: "objectives" },
    { header: "Activities", field: "activities" },
  ],
  spec: {
    keyField: "subject",
    additionalKeyFields: ["academicYear", "term", "weekNumber"],
    columns: [
      { field: "subject", headers: ["Subject"], required: true },
      { field: "academicYear", headers: ["Academic year"], required: true },
      { field: "term", headers: ["Term"], required: true },
      { field: "weekNumber", headers: ["Week", "Week number"], required: true, kind: "number" },
      { field: "topic", headers: ["Topic"], required: true },
      {
        field: "objectives",
        headers: ["Objectives"],
        validate: (value) =>
          value.includes("\n") ? "Separate objectives with a semicolon rather than new lines" : null,
      },
      { field: "activities", headers: ["Activities"] },
    ],
  },

  async loadExistingKeys(client) {
    const rows = await client.schemeOfWork.findMany({ include: { subject: true } });

    const keys = new Set<string>();
    for (const scheme of rows) {
      const weeks = ((scheme.content as { weeks?: SchemeWeek[] })?.weeks ?? []) as SchemeWeek[];
      for (const week of weeks) {
        keys.add(
          compositeKey([
            text((scheme.subject as Record<string, unknown>)?.name),
            text(scheme.academicYear),
            text(scheme.term),
            text(week.weekNumber),
          ]),
        );
      }
    }
    return keys;
  },

  async exportRows(client) {
    const schemes = await client.schemeOfWork.findMany({
      include: { subject: true },
      orderBy: { createdAt: "asc" },
    });

    const rows: Record<string, string>[] = [];
    for (const scheme of schemes) {
      const weeks = ((scheme.content as { weeks?: SchemeWeek[] })?.weeks ?? []) as SchemeWeek[];
      for (const week of [...weeks].sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0))) {
        rows.push({
          subject: text((scheme.subject as Record<string, unknown>)?.name),
          academicYear: text(scheme.academicYear),
          term: text(scheme.term),
          weekNumber: text(week.weekNumber),
          topic: text(week.topic),
          objectives: (week.objectives ?? []).join(`${LIST_SEPARATOR} `),
          activities: (week.activities ?? []).join(`${LIST_SEPARATOR} `),
        });
      }
    }
    return rows;
  },

  /**
   * Writes one week into a scheme of work, creating the scheme if it is new.
   *
   * Read-modify-write on a JSON column, one row at a time. Rows are applied
   * sequentially by the caller, so two weeks of the same scheme in one file
   * do not race each other — a detail worth knowing before this is ever made
   * concurrent.
   */
  async apply(client, row) {
    const { subject, academicYear, term, weekNumber, topic, objectives, activities } = row.values;

    const subjectRecord = await client.subject.findFirst({ where: { name: subject, deletedAt: null } });
    if (!subjectRecord) throw new Error(`No subject called "${subject}"`);

    const week: SchemeWeek = {
      weekNumber: Number(weekNumber),
      topic,
      objectives: splitList(objectives ?? ""),
      activities: splitList(activities ?? ""),
    };

    const existing = await client.schemeOfWork.findFirst({
      where: { subjectId: subjectRecord.id as string, academicYear, term },
    });

    if (!existing) {
      await client.schemeOfWork.create({
        data: {
          subjectId: subjectRecord.id as string,
          academicYear,
          term,
          status: "DRAFT",
          source: "MANUAL",
          content: { weeks: [week] },
        },
      });
      return;
    }

    const weeks = ((existing.content as { weeks?: SchemeWeek[] })?.weeks ?? []) as SchemeWeek[];
    const index = weeks.findIndex((candidate) => candidate.weekNumber === week.weekNumber);
    const updated = index >= 0 ? weeks.map((w, i) => (i === index ? week : w)) : [...weeks, week];

    await client.schemeOfWork.update({
      where: { id: existing.id as string },
      data: { content: { weeks: updated.sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0)) } },
    });
  },
};

export const ENTITIES: EntityDefinition[] = [
  students,
  staff,
  parents,
  subjects,
  classes,
  timetable,
  results,
  curriculum,
];

export function findEntity(name: string): EntityDefinition | undefined {
  return ENTITIES.find((entity) => entity.name === name.toLowerCase());
}
