/**
 * What a school is entitled to use.
 *
 * A plan says which modules it includes; a school may have exceptions on top
 * of that, because sales always makes exceptions and encoding them as a new
 * plan per customer ends with forty plans nobody can tell apart.
 *
 * Pure and free of Prisma so the rules can be argued with in a test. This
 * decides *entitlement* only — never permission. A teacher who is not allowed
 * to read payroll is still not allowed when payroll is switched on; that is
 * `@Roles`, and the two are deliberately separate checks.
 */

export const MODULE_KEYS = [
  "STUDENTS",
  "STAFF",
  "ACADEMICS",
  "ACCESSIBILITY",
  "ATTENDANCE",
  "GRADING",
  "TIMETABLE",
  "HOMEWORK",
  "EXAMS",
  "FEES",
  "PAYROLL",
  "MESSAGING",
  "PORTAL",
  "AI_CURRICULUM",
  "AI_TEACHER",
  "DATA_EXCHANGE",
  "DOCUMENTS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Modules that cannot be sold separately, and the reason each one is on this
 * list rather than the price list.
 *
 * The first three are what a school *is* — switch off students and there is
 * no product left, only an invoice for one. ACCESSIBILITY is here on
 * different grounds: a school must never be able to buy a version of this
 * system in which a blind child cannot use it. That is not an upsell.
 */
export const CORE_MODULES: readonly ModuleKey[] = ["STUDENTS", "STAFF", "ACADEMICS", "ACCESSIBILITY"];

/**
 * What a school gets when it has no subscription at all: everything.
 *
 * This was a shorter list for about an hour, and that hour broke the AI
 * class in a school that had been using it — because before modules existed
 * every school had every feature, and a default of "some" silently took the
 * rest away on the deploy that introduced this file. Nobody asked for that,
 * no operator decided it, and the only symptom was a 403 on a screen that
 * worked yesterday.
 *
 * So: the default takes nothing away. A school loses a module only when an
 * operator switches it off with a reason, or when a plan explicitly lists a
 * narrower set. Withdrawing access is a decision somebody makes, and
 * suspension already exists for when the decision is "all of it".
 */
export const DEFAULT_MODULES: readonly ModuleKey[] = MODULE_KEYS;

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  /** What the school loses if it is off. Written for an operator, not a developer. */
  description: string;
  /** Grouping for the console, matching the school console's own sidebar. */
  group: "Core" | "Teaching" | "Finance" | "Communication" | "Artificial intelligence" | "Tools";
  core: boolean;
}

export const MODULE_CATALOG: readonly ModuleDefinition[] = [
  {
    key: "STUDENTS",
    label: "Students & guardians",
    description: "Enrolment, student records, families. Without it there is no school.",
    group: "Core",
    core: true,
  },
  {
    key: "STAFF",
    label: "Staff records",
    description: "The staff directory, employment records and bank details.",
    group: "Core",
    core: true,
  },
  {
    key: "ACADEMICS",
    label: "Classes & subjects",
    description: "Classes, subjects and the curriculum they are taught from.",
    group: "Core",
    core: true,
  },
  {
    key: "ACCESSIBILITY",
    label: "Accessibility",
    description: "Read-aloud, larger text, high contrast. Never optional, and never charged for.",
    group: "Core",
    core: true,
  },
  {
    key: "ATTENDANCE",
    label: "Attendance",
    description: "Daily registers, amendment audit trail and absence notifications.",
    group: "Teaching",
    core: false,
  },
  {
    key: "GRADING",
    label: "Assessments & results",
    description: "Grade scales, marks entry, weighted totals and published term results.",
    group: "Teaching",
    core: false,
  },
  {
    key: "TIMETABLE",
    label: "Timetable",
    description: "Period structure, clash detection and automatic generation.",
    group: "Teaching",
    core: false,
  },
  {
    key: "HOMEWORK",
    label: "Homework",
    description: "Setting assignments, student submissions and marking.",
    group: "Teaching",
    core: false,
  },
  {
    key: "EXAMS",
    label: "Examinations & CBT",
    description: "The question bank and on-screen exams students sit against a clock.",
    group: "Teaching",
    core: false,
  },
  {
    key: "PORTAL",
    label: "Student & parent portal",
    description: "The home page a family sees: their child's attendance, results and homework.",
    group: "Teaching",
    core: false,
  },
  {
    key: "FEES",
    label: "Fees & invoicing",
    description: "Fee structures, invoices, payments and outstanding balances.",
    group: "Finance",
    core: false,
  },
  {
    key: "PAYROLL",
    label: "Payroll",
    description: "Salaries, payslips and the bank transfer file. Depends on staff records.",
    group: "Finance",
    core: false,
  },
  {
    key: "MESSAGING",
    label: "Messaging",
    description: "Email, SMS and WhatsApp to families, through the school's own gateways.",
    group: "Communication",
    core: false,
  },
  {
    key: "AI_CURRICULUM",
    label: "AI lesson planning",
    description: "Generated schemes of work, lesson plans, quizzes and exam questions.",
    group: "Artificial intelligence",
    core: false,
  },
  {
    key: "AI_TEACHER",
    label: "AI teacher & classes",
    description: "The tutor a student can ask questions, and the automatic class player.",
    group: "Artificial intelligence",
    core: false,
  },
  {
    key: "DATA_EXCHANGE",
    label: "Import & export",
    description: "Bulk spreadsheet import and export of students, staff and results.",
    group: "Tools",
    core: false,
  },
  {
    key: "DOCUMENTS",
    label: "PDF documents",
    description: "Report cards, class lists, invoices, timetables and payslips as PDFs.",
    group: "Tools",
    core: false,
  },
];

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Reads the per-school override blob.
 *
 * Anything that is not a known key mapped to a boolean is dropped rather than
 * guessed at. This column is JSON, so it will eventually contain something
 * written by hand or left behind by a renamed module, and an unrecognised
 * entry must not become an entitlement.
 */
export function parseModuleOverrides(value: unknown): Partial<Record<ModuleKey, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const overrides: Partial<Record<ModuleKey, boolean>> = {};
  for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (isModuleKey(key) && typeof enabled === "boolean") overrides[key] = enabled;
  }
  return overrides;
}

/**
 * The modules a school may actually use, in catalog order.
 *
 * Order is the catalog's rather than insertion order so that two schools with
 * the same entitlements produce identical arrays — otherwise every comparison,
 * cache key and test assertion has to sort first and one of them will forget.
 */
export function resolveModules(input: {
  /** The plan's included modules, or null when the school has no subscription. */
  planModules?: readonly string[] | null;
  /** The school's own exceptions, straight from the JSON column. */
  overrides?: unknown;
}): ModuleKey[] {
  const fromPlan = (input.planModules ?? []).filter(isModuleKey);
  // An empty list means "no plan opinion", not "nothing included". A plan
  // saved before modules existed has an empty array, and reading that as a
  // total switch-off would take working schools down on deploy.
  const base = new Set<ModuleKey>(fromPlan.length > 0 ? fromPlan : DEFAULT_MODULES);

  for (const [key, enabled] of Object.entries(parseModuleOverrides(input.overrides))) {
    if (enabled) base.add(key as ModuleKey);
    else base.delete(key as ModuleKey);
  }

  // Last word, deliberately after the overrides: neither a plan nor an
  // operator's mis-click can remove these.
  for (const key of CORE_MODULES) base.add(key);

  return MODULE_KEYS.filter((key) => base.has(key));
}

export function isModuleEnabled(modules: readonly ModuleKey[], key: ModuleKey): boolean {
  return modules.includes(key);
}

/** The label an operator sees, for error messages and the console. */
export function moduleLabel(key: ModuleKey): string {
  return MODULE_CATALOG.find((module) => module.key === key)?.label ?? key;
}
