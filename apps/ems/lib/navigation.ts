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
  /**
   * The purchasable module this belongs to, if any — see the Super Admin
   * console. Absent means core, and every school has it.
   */
  module?: string;
  /** Present only when the route exists. Absent = planned, rendered disabled. */
  href?: string;
  roles?: NavRole[];
}

export interface NavGroup {
  key: string;
  icon: NavIcon;
  roles?: NavRole[];
  /** Set only where an entire section belongs to one module, e.g. Messaging. */
  module?: string;
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
      { key: "nav.dashboard.my", href: "/my", module: "PORTAL" },
      { key: "nav.dashboard.overview", href: "/dashboard" },
      // "Analytics" and "Notifications" used to sit here with no page behind
      // them. Analytics is what the overview above already is, and there was
      // never anything for Notifications to open. Both are removed rather
      // than given a screen: a menu item that does nothing teaches people the
      // product is broken, and inventing a page to justify one is how a
      // sidebar fills up with screens nobody opens twice.
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
      { key: "nav.students.bulkImport", href: "/data-exchange", roles: ADMIN_ONLY, module: "DATA_EXCHANGE" },
      { key: "nav.students.list", href: "/students" },
      // The portal is a real screen and was reachable only from the Dashboard
      // group. A student looking for "my school" looks under Students.
      { key: "nav.students.portal", href: "/my", module: "PORTAL" },
      { key: "nav.students.attendance", href: "/attendance", module: "ATTENDANCE" },
      // The academic record a school actually keeps is the released results
      // list; this pointed at nothing while that screen already existed.
      { key: "nav.students.academicRecords", href: "/results", roles: STAFF, module: "GRADING" },
      { key: "nav.students.behaviour" },
      { key: "nav.students.medical" },
      { key: "nav.students.hostel" },
      { key: "nav.students.transport" },
      { key: "nav.students.library" },
      { key: "nav.students.documents" },
      // Graduation used to sit below this as its own item. It is the same
      // screen: a final-year class is one whose destination is "Leaving the
      // school", chosen in the same dropdown as everywhere else. A second
      // menu item pointing at the same page teaches people there are two
      // procedures when there is one.
      { key: "nav.students.promotion", href: "/promotion", roles: ADMIN_ONLY },
      { key: "nav.students.wallet" },
      { key: "nav.students.idCards" },
    ],
  },
  {
    key: "nav.parents",
    icon: "parents",
    roles: STAFF,
    items: [
      // Admin-only: it aggregates fee debt and today's absences across the
      // whole school, neither of which is a teacher's business.
      { key: "nav.parents.dashboard", href: "/parents", roles: ADMIN_ONLY },
      // "Parent portal" used to sit here as a placeholder and has been
      // removed rather than given a page. In a STAFF sidebar the phrase has
      // no meaning that the directory and this dashboard do not already
      // serve — the portal is what a family sees, and staff reach it by
      // looking at the family. Inventing a page to justify a menu item is
      // how sidebars fill up with screens nobody opens twice.
      { key: "nav.parents.list", href: "/guardians" },
      // Both of these were built and then only linked from the section they
      // technically belong to (Messaging, Finance). Somebody looking for
      // "how do I contact a parent" looks under Parents, so they are linked
      // from here too rather than being discoverable only by knowing where
      // the feature was filed.
      { key: "nav.parents.communication", href: "/parent-messages", module: "MESSAGING" },
      // Admin-only, unlike the rest of this section: the group allows
      // teachers, and a teacher has no business in a family's fee account.
      { key: "nav.parents.payments", href: "/invoices", roles: ADMIN_ONLY, module: "FEES" },
    ],
  },
  {
    key: "nav.staff",
    icon: "staff",
    roles: STAFF,
    items: [
      { key: "nav.staff.dashboard" },
      { key: "nav.staff.registration", href: "/staff/new", roles: ADMIN_ONLY },
      { key: "nav.staff.directory", href: "/staff", roles: ADMIN_ONLY },
      { key: "nav.staff.teachers", href: "/teachers" },
      // The same directory with the filter already applied, rather than a
      // near-identical second page. Employment records are admin-only, so a
      // teacher sees the teacher list above and neither of these.
      { key: "nav.staff.nonTeaching", href: "/staff?group=non-teaching", roles: ADMIN_ONLY },
      // HR is where somebody goes to ask who has read whose bank details.
      { key: "nav.staff.hr", href: "/staff/access-log", roles: ADMIN_ONLY },
      // Not gated on PAYROLL, unlike the schedules: a school that does not run
      // payroll here still needs to know who has left and where the gap is.
      { key: "nav.staff.turnover", href: "/staff/turnover", roles: ADMIN_ONLY },
      { key: "nav.staff.payroll", href: "/payroll", roles: ADMIN_ONLY, module: "PAYROLL" },
      // The document a bursar signs, and the screen where a school decides
      // what that document looks like. Separate from the payroll run itself:
      // running payroll and printing the voucher are different jobs, often
      // done by different people on different days.
      { key: "nav.staff.voucher", href: "/payroll/voucher", roles: ADMIN_ONLY, module: "PAYROLL" },
      { key: "nav.staff.welfare", roles: ADMIN_ONLY },
      // Loans and salary advances are one register, not two: the same money
      // recovered the same way, differing only in the word printed on the
      // voucher. Gated on PAYROLL because recovery happens through it.
      { key: "nav.staff.loans", href: "/payroll/loans", roles: ADMIN_ONLY, module: "PAYROLL" },
      // The two schedules whose audience is outside the school — the tax
      // authority and the pension administrator. Next to the voucher they are
      // derived from, rather than filed under Settings, because they are
      // documents a bursar produces monthly and not options anybody sets once.
      // Under Staff rather than Finance: the money moves out of a salary, and
      // the person deciding is the one running payroll. It shows up on the
      // family's invoice either way.
      { key: "nav.staff.childFees", href: "/payroll/staff-fees", roles: ADMIN_ONLY, module: "PAYROLL" },
      { key: "nav.staff.paye", href: "/payroll/tax", roles: ADMIN_ONLY, module: "PAYROLL" },
      { key: "nav.staff.pension", href: "/payroll/pension", roles: ADMIN_ONLY, module: "PAYROLL" },
      // Points at the loan register, for the reason given above it: a salary
      // advance IS a loan here, differing only in the word on the voucher.
      // It was the one entry in this group whose feature existed and whose
      // menu item still said "soon".
      { key: "nav.staff.salaryAdvance", href: "/payroll/loans", roles: ADMIN_ONLY, module: "PAYROLL" },
      { key: "nav.staff.medicalAssistance", roles: ADMIN_ONLY },
      { key: "nav.staff.leave" },
      { key: "nav.staff.attendance" },
      { key: "nav.staff.performance", roles: ADMIN_ONLY },
      // Staff have the same portal families and students do — their own
      // timetable, their own messages. It existed and was unreachable here.
      { key: "nav.staff.portal", href: "/my", module: "PORTAL" },
    ],
  },
  {
    key: "nav.academics",
    icon: "academics",
    items: [
      { key: "nav.academics.classes", href: "/classes" },
      { key: "nav.academics.sections" },
      { key: "nav.academics.subjects", href: "/subjects" },
      { key: "nav.academics.curriculum", href: "/schemes-of-work", module: "ACADEMICS" },
      { key: "nav.academics.lessonPlans", href: "/lesson-plans" },
      { key: "nav.academics.lessonNotes" },
      { key: "nav.academics.aiTeaching", href: "/ai-teacher", module: "AI_TEACHER" },
      { key: "nav.academics.liveClassroom" },
      { key: "nav.academics.timetable", href: "/timetable", module: "TIMETABLE" },
      { key: "nav.academics.homework", href: "/homework", module: "HOMEWORK" },
      // An assignment and a piece of homework are the same record here — one
      // screen sets, collects and marks both. Two menu items for one feature
      // is how somebody concludes the other one is missing.
      { key: "nav.academics.assignments", href: "/homework", module: "HOMEWORK" },
    ],
  },
  {
    key: "nav.examination",
    icon: "examination",
    items: [
      { key: "nav.examination.setup", href: "/assessments", roles: STAFF, module: "GRADING" },
      { key: "nav.examination.questionBank", href: "/question-bank", roles: STAFF, module: "EXAMS" },
      { key: "nav.examination.quizzes", href: "/quizzes" },
      // Everyone: staff build and mark here, students sit here.
      { key: "nav.examination.cbt", href: "/exams", module: "EXAMS" },
      // The AI drafting tool lives on the question bank screen — a separate
      // page would be the same list with one extra button.
      { key: "nav.examination.aiExamination", href: "/question-bank", roles: STAFF, module: "AI_CURRICULUM" },
      { key: "nav.examination.results", href: "/results", roles: STAFF, module: "GRADING" },
      { key: "nav.examination.resultTemplates", roles: ADMIN_ONLY },
      { key: "nav.examination.reportCards", href: "/report-cards", module: "DOCUMENTS" },
      { key: "nav.examination.transcript" },
    ],
  },
  {
    key: "nav.finance",
    icon: "finance",
    roles: [...ADMIN_ONLY, "GUARDIAN"],
    // The whole section is one module: a school without fees has no use for
    // invoices, discounts or scholarships either.
    module: "FEES",
    items: [
      { key: "nav.finance.fees", href: "/fee-structures", roles: ADMIN_ONLY },
      { key: "nav.finance.invoices", href: "/invoices" },
      // Payments are recorded against the invoice they settle — there is no
      // separate ledger, and a page listing payments detached from what they
      // paid for would be a worse view of the same rows.
      { key: "nav.finance.payments", href: "/invoices" },
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
    module: "MESSAGING",
    items: [
      { key: "nav.messaging.templates", href: "/messaging/templates", roles: ADMIN_ONLY },
      { key: "nav.messaging.outbox", href: "/messaging/outbox", roles: ADMIN_ONLY },
      { key: "nav.messaging.internal", href: "/parent-messages", roles: STAFF, module: "MESSAGING" },
      // All four are configured on one screen, and all four said "soon" while
      // that screen existed. Linked separately rather than collapsed into the
      // Settings entry for the same reason Parents links to messaging and
      // fees: somebody looking for "SMS" looks under Messaging, not under
      // Settings → Communication gateways.
      { key: "nav.messaging.email", href: "/settings/communication", roles: ADMIN_ONLY },
      { key: "nav.messaging.sms", href: "/settings/communication", roles: ADMIN_ONLY },
      { key: "nav.messaging.whatsapp", href: "/settings/communication", roles: ADMIN_ONLY },
      { key: "nav.messaging.push", href: "/settings/communication", roles: ADMIN_ONLY },
      // Admin-only: it reaches every family in the school at once.
      { key: "nav.messaging.announcements", href: "/messaging/announcements", roles: ADMIN_ONLY },
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
      // Every login in a school belongs to a member of staff, a student or a
      // guardian, and each is managed where that person is. The staff
      // directory is the closest thing to a user list — and it is where
      // invitations and password resets now live.
      { key: "nav.settings.users", href: "/staff" },
      { key: "nav.settings.roles" },
      { key: "nav.settings.permissions" },
      // The console ships English and French; this is where a school chooses
      // which one it opens in, and where anybody overrides it for themselves.
      { key: "nav.settings.languages", href: "/settings/languages" },
      { key: "nav.settings.paymentGateways", href: "/settings/payments" },
      { key: "nav.settings.communicationGateways", href: "/settings/communication" },
      { key: "nav.settings.ai", href: "/curriculum-settings" },
      { key: "nav.settings.backup" },
      { key: "nav.settings.security" },
      // Assembled from the trails the product already keeps — bank-detail
      // reveals, attendance amendments, payments, payroll approvals,
      // announcements, invitations, moderation. Read-only by construction.
      { key: "nav.settings.auditLogs", href: "/settings/audit-log" },
    ],
  },
];

/** True when this user may see the item at all. */
export function isVisibleTo(roles: NavRole[] | undefined, userRoles: string[]): boolean {
  if (!roles) return true;
  return roles.some((role) => userRoles.includes(role));
}

/**
 * True when the school has the module this item belongs to.
 *
 * `undefined` modules means "not part of any purchasable module", which is
 * the answer for the dashboard, settings and everything core.
 *
 * **Unknown entitlements show everything.** While the modules request is in
 * flight `modules` is undefined, and hiding the whole menu for a second on
 * every page load would be worse than briefly showing an item the API will
 * refuse. This is a courtesy, not a control — ModuleGuard is the control.
 */
export function hasModule(module: string | undefined, modules: string[] | undefined): boolean {
  if (!module || !modules) return true;
  return modules.includes(module);
}

/** Groups and leaves the user may see, with empty groups dropped. */
export function visibleGroups(userRoles: string[], modules?: string[]): NavGroup[] {
  return NAV_GROUPS.filter((group) => isVisibleTo(group.roles, userRoles) && hasModule(group.module, modules))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isVisibleTo(item.roles, userRoles) && hasModule(item.module, modules)),
    }))
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
