/**
 * The whole Wisdom Campus module tree, as data.
 *
 * A leaf with an `href` is a route that actually exists. A leaf without one
 * is part of the agreed ERP structure but has no backend yet, and the
 * sidebar renders it visibly disabled rather than as a link that 404s —
 * this project's standing rule is that a control which looks real but does
 * nothing is worse than no control (see PROGRESS.md). Giving a module a
 * route is therefore the single edit that "turns it on" in the UI.
 *
 * `roles` narrows visibility; omitted means every signed-in school user.
 * Labels live in the locale dictionaries, keyed by `key` — never hardcode
 * display strings here.
 */

export type NavRole = "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "GUARDIAN";

export type NavIcon =
  | "dashboard"
  | "students"
  | "parents"
  | "staff"
  | "academics"
  | "examination"
  | "finance"
  | "messaging"
  | "settings";

export interface NavLeaf {
  /** i18n key, e.g. "nav.students.list". Also the stable id for favorites/recents. */
  key: string;
  /** Present only when the route exists. Absent = planned, rendered disabled. */
  href?: string;
  roles?: NavRole[];
}

export interface NavGroup {
  key: string;
  icon: NavIcon;
  roles?: NavRole[];
  items: NavLeaf[];
}

const STAFF: NavRole[] = ["SCHOOL_ADMIN", "TEACHER"];
const ADMIN_ONLY: NavRole[] = ["SCHOOL_ADMIN"];

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "nav.dashboard",
    icon: "dashboard",
    items: [
      // First for everybody, but only students and guardians have anything
      // behind it — it tells staff so rather than showing a broken page.
      { key: "nav.dashboard.my", href: "/my" },
      { key: "nav.dashboard.overview", href: "/dashboard" },
      { key: "nav.dashboard.analytics" },
      { key: "nav.dashboard.notifications" },
      // Here rather than under Settings, which is admin-only: a student who
      // needs larger text must be able to reach this themselves, and every
      // role sees this group.
      { key: "nav.dashboard.accessibility", href: "/accessibility" },
    ],
  },
  {
    key: "nav.students",
    icon: "students",
    roles: [...STAFF, "GUARDIAN"],
    items: [
      { key: "nav.students.dashboard" },
      { key: "nav.students.registration", href: "/students", roles: ADMIN_ONLY },
      { key: "nav.students.bulkImport", href: "/data-exchange", roles: ADMIN_ONLY },
      { key: "nav.students.list", href: "/students" },
      { key: "nav.students.portal" },
      { key: "nav.students.attendance", href: "/attendance" },
      { key: "nav.students.academicRecords" },
      { key: "nav.students.behaviour" },
      { key: "nav.students.medical" },
      { key: "nav.students.hostel" },
      { key: "nav.students.transport" },
      { key: "nav.students.library" },
      { key: "nav.students.documents" },
      { key: "nav.students.promotion", roles: ADMIN_ONLY },
      { key: "nav.students.graduation", roles: ADMIN_ONLY },
      { key: "nav.students.wallet" },
      { key: "nav.students.idCards" },
    ],
  },
  {
    key: "nav.parents",
    icon: "parents",
    roles: STAFF,
    items: [
      { key: "nav.parents.dashboard" },
      { key: "nav.parents.portal" },
      { key: "nav.parents.list" },
      { key: "nav.parents.communication" },
      { key: "nav.parents.payments" },
    ],
  },
  {
    key: "nav.staff",
    icon: "staff",
    roles: STAFF,
    items: [
      { key: "nav.staff.dashboard" },
      { key: "nav.staff.registration", roles: ADMIN_ONLY },
      { key: "nav.staff.directory" },
      { key: "nav.staff.teachers", href: "/teachers" },
      { key: "nav.staff.nonTeaching" },
      { key: "nav.staff.hr", roles: ADMIN_ONLY },
      { key: "nav.staff.payroll", href: "/payroll", roles: ADMIN_ONLY },
      { key: "nav.staff.welfare", roles: ADMIN_ONLY },
      { key: "nav.staff.loans", roles: ADMIN_ONLY },
      { key: "nav.staff.salaryAdvance", roles: ADMIN_ONLY },
      { key: "nav.staff.medicalAssistance", roles: ADMIN_ONLY },
      { key: "nav.staff.leave" },
      { key: "nav.staff.attendance" },
      { key: "nav.staff.performance", roles: ADMIN_ONLY },
      { key: "nav.staff.portal" },
    ],
  },
  {
    key: "nav.academics",
    icon: "academics",
    items: [
      { key: "nav.academics.classes", href: "/classes" },
      { key: "nav.academics.sections" },
      { key: "nav.academics.subjects", href: "/subjects" },
      { key: "nav.academics.curriculum", href: "/schemes-of-work" },
      { key: "nav.academics.lessonPlans", href: "/lesson-plans" },
      { key: "nav.academics.lessonNotes" },
      { key: "nav.academics.aiTeaching", href: "/ai-teacher" },
      { key: "nav.academics.liveClassroom" },
      { key: "nav.academics.timetable", href: "/timetable" },
      { key: "nav.academics.homework", href: "/homework" },
      { key: "nav.academics.assignments" },
    ],
  },
  {
    key: "nav.examination",
    icon: "examination",
    items: [
      { key: "nav.examination.setup", href: "/assessments", roles: STAFF },
      { key: "nav.examination.questionBank", href: "/question-bank", roles: STAFF },
      { key: "nav.examination.quizzes", href: "/quizzes" },
      // Everyone: staff build and mark here, students sit here.
      { key: "nav.examination.cbt", href: "/exams" },
      // The AI drafting tool lives on the question bank screen — a separate
      // page would be the same list with one extra button.
      { key: "nav.examination.aiExamination", href: "/question-bank", roles: STAFF },
      { key: "nav.examination.results", href: "/results", roles: STAFF },
      { key: "nav.examination.resultTemplates", roles: ADMIN_ONLY },
      { key: "nav.examination.reportCards", href: "/report-cards" },
      { key: "nav.examination.transcript" },
    ],
  },
  {
    key: "nav.finance",
    icon: "finance",
    roles: [...ADMIN_ONLY, "GUARDIAN"],
    items: [
      { key: "nav.finance.fees", href: "/fee-structures", roles: ADMIN_ONLY },
      { key: "nav.finance.invoices", href: "/invoices" },
      { key: "nav.finance.payments" },
      { key: "nav.finance.discounts", roles: ADMIN_ONLY },
      { key: "nav.finance.scholarships", roles: ADMIN_ONLY },
      { key: "nav.finance.accounting", roles: ADMIN_ONLY },
      { key: "nav.finance.budget", roles: ADMIN_ONLY },
      { key: "nav.finance.expenses", roles: ADMIN_ONLY },
    ],
  },
  {
    key: "nav.messaging",
    icon: "messaging",
    items: [
      { key: "nav.messaging.templates", href: "/messaging/templates", roles: ADMIN_ONLY },
      { key: "nav.messaging.outbox", href: "/messaging/outbox", roles: ADMIN_ONLY },
      { key: "nav.messaging.internal" },
      { key: "nav.messaging.email", roles: ADMIN_ONLY },
      { key: "nav.messaging.sms", roles: ADMIN_ONLY },
      { key: "nav.messaging.whatsapp", roles: ADMIN_ONLY },
      { key: "nav.messaging.push", roles: ADMIN_ONLY },
      { key: "nav.messaging.announcements" },
      { key: "nav.messaging.newsletters", roles: STAFF },
    ],
  },
  {
    key: "nav.settings",
    icon: "settings",
    roles: ADMIN_ONLY,
    items: [
      { key: "nav.settings.schoolProfile" },
      { key: "nav.settings.branding", href: "/settings/branding" },
      { key: "nav.settings.users" },
      { key: "nav.settings.roles" },
      { key: "nav.settings.permissions" },
      { key: "nav.settings.languages" },
      { key: "nav.settings.paymentGateways", href: "/settings/payments" },
      { key: "nav.settings.communicationGateways", href: "/settings/communication" },
      { key: "nav.settings.ai", href: "/curriculum-settings" },
      { key: "nav.settings.backup" },
      { key: "nav.settings.security" },
      { key: "nav.settings.auditLogs" },
    ],
  },
];

/** True when this user may see the item at all. */
export function isVisibleTo(roles: NavRole[] | undefined, userRoles: string[]): boolean {
  if (!roles) return true;
  return roles.some((role) => userRoles.includes(role));
}

/** Groups and leaves the user may see, with empty groups dropped. */
export function visibleGroups(userRoles: string[]): NavGroup[] {
  return NAV_GROUPS.filter((group) => isVisibleTo(group.roles, userRoles))
    .map((group) => ({ ...group, items: group.items.filter((item) => isVisibleTo(item.roles, userRoles)) }))
    .filter((group) => group.items.length > 0);
}

/** Every visible leaf, flattened — used by nav search, favorites and recents. */
export function flattenLeaves(groups: NavGroup[]): { group: NavGroup; leaf: NavLeaf }[] {
  return groups.flatMap((group) => group.items.map((leaf) => ({ group, leaf })));
}

/** The group + leaf whose href best matches a pathname, for active highlighting. */
export function findActiveLeaf(groups: NavGroup[], pathname: string): { group: NavGroup; leaf: NavLeaf } | undefined {
  const candidates = flattenLeaves(groups).filter(
    ({ leaf }) => leaf.href && (pathname === leaf.href || pathname.startsWith(`${leaf.href}/`)),
  );
  // Longest href wins so /schemes-of-work/123 doesn't match a shorter prefix.
  return candidates.sort((a, b) => (b.leaf.href?.length ?? 0) - (a.leaf.href?.length ?? 0))[0];
}
