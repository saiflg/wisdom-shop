import type { ImportSpec, RowPlan } from "./import-engine";
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

export const ENTITIES: EntityDefinition[] = [students, staff, parents, subjects, classes];

export function findEntity(name: string): EntityDefinition | undefined {
  return ENTITIES.find((entity) => entity.name === name.toLowerCase());
}
