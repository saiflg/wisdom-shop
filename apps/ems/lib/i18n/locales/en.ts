/**
 * English is the source of truth for every translatable string: the
 * `Dictionary` type is derived from this object, so every other locale is a
 * `Partial<Dictionary>` and any key that doesn't exist here is a compile
 * error at the call site. Missing keys in other locales fall back to
 * English at runtime rather than rendering blank.
 */
export const en = {
  // ── Shell ──────────────────────────────────────────────────────────
  "app.name": "Wisdom Campus",
  "header.search": "Search",
  "header.searchPlaceholder": "Search students, staff, classes…",
  "header.notifications": "Notifications",
  "header.noNotifications": "No notifications",
  "header.aiAssistant": "AI assistant",
  "header.language": "Language",
  "header.theme": "Theme",
  "header.themeLight": "Light",
  "header.themeDark": "Dark",
  "header.themeSystem": "System",
  "header.profile": "Profile",
  "header.signOut": "Sign out",
  "header.openMenu": "Open menu",

  "sidebar.collapse": "Collapse sidebar",
  "sidebar.expand": "Expand sidebar",
  "sidebar.searchPlaceholder": "Search menu…",
  "sidebar.favorites": "Favorites",
  "sidebar.recent": "Recently used",
  "sidebar.noResults": "No matching menu items",
  "sidebar.addFavorite": "Add to favorites",
  "sidebar.removeFavorite": "Remove from favorites",
  "sidebar.planned": "Not built yet",
  "sidebar.plannedShort": "Soon",

  "common.loading": "Loading…",
  "common.save": "Save changes",
  "common.saved": "Saved.",
  "common.cancel": "Cancel",
  "common.create": "Create",
  "common.publish": "Publish",
  "common.status": "Status",
  "common.none": "None yet.",

  "breadcrumb.home": "Home",

  // ── Navigation: groups ─────────────────────────────────────────────
  "nav.dashboard": "Dashboard",
  "nav.students": "Students",
  "nav.parents": "Parents",
  "nav.staff": "Staff",
  "nav.academics": "Academics",
  "nav.examination": "Examination",
  "nav.finance": "Finance",
  "nav.messaging": "Messaging",
  "nav.settings": "Settings",

  // ── Navigation: Dashboard ──────────────────────────────────────────
  "nav.dashboard.overview": "Overview",
  "nav.dashboard.analytics": "Analytics",
  "nav.dashboard.notifications": "Notifications",

  // ── Navigation: Students ───────────────────────────────────────────
  "nav.students.dashboard": "Student dashboard",
  "nav.students.registration": "Student registration",
  "nav.students.bulkImport": "Bulk import",
  "nav.students.list": "Student list",
  "nav.students.portal": "Student portal",
  "nav.students.attendance": "Attendance",
  "nav.students.academicRecords": "Academic records",
  "nav.students.behaviour": "Behaviour",
  "nav.students.medical": "Medical records",
  "nav.students.hostel": "Hostel",
  "nav.students.transport": "Transport",
  "nav.students.library": "Library",
  "nav.students.documents": "Documents",
  "nav.students.promotion": "Promotion",
  "nav.students.graduation": "Graduation",
  "nav.students.wallet": "Student wallet",
  "nav.students.idCards": "Student ID cards",

  // ── Navigation: Parents ────────────────────────────────────────────
  "nav.parents.dashboard": "Parent dashboard",
  "nav.parents.portal": "Parent portal",
  "nav.parents.list": "Parent list",
  "nav.parents.communication": "Parent communication",
  "nav.parents.payments": "Parent payments",

  // ── Navigation: Staff ──────────────────────────────────────────────
  "nav.staff.dashboard": "Staff dashboard",
  "nav.staff.registration": "Staff registration",
  "nav.staff.directory": "Staff directory",
  "nav.staff.teachers": "Teachers",
  "nav.staff.nonTeaching": "Non-teaching staff",
  "nav.staff.hr": "HR",
  "nav.staff.payroll": "Payroll",
  "nav.staff.welfare": "Welfare",
  "nav.staff.loans": "Loans",
  "nav.staff.salaryAdvance": "Salary advance",
  "nav.staff.medicalAssistance": "Medical assistance",
  "nav.staff.leave": "Leave management",
  "nav.staff.attendance": "Attendance",
  "nav.staff.performance": "Performance",
  "nav.staff.portal": "Staff portal",

  // ── Navigation: Academics ──────────────────────────────────────────
  "nav.academics.classes": "Classes",
  "nav.academics.sections": "Sections",
  "nav.academics.subjects": "Subjects",
  "nav.academics.curriculum": "Curriculum",
  "nav.academics.lessonPlans": "Lesson plans",
  "nav.academics.lessonNotes": "Lesson notes",
  "nav.academics.aiTeaching": "AI teaching",
  "nav.academics.liveClassroom": "Live classroom",
  "nav.academics.timetable": "Timetable",
  "nav.academics.homework": "Homework",
  "nav.academics.assignments": "Assignments",

  // ── Navigation: Examination ────────────────────────────────────────
  "nav.examination.setup": "Examination setup",
  "nav.examination.questionBank": "Question bank",
  "nav.examination.quizzes": "Quizzes",
  "nav.examination.cbt": "CBT",
  "nav.examination.aiExamination": "AI examination",
  "nav.examination.results": "Results",
  "nav.examination.resultTemplates": "Result templates",
  "nav.examination.reportCards": "Report cards",
  "nav.examination.transcript": "Transcript",

  // ── Navigation: Finance ────────────────────────────────────────────
  "nav.finance.fees": "Fees",
  "nav.finance.invoices": "Invoices",
  "nav.finance.payments": "Payments",
  "nav.finance.discounts": "Discounts",
  "nav.finance.scholarships": "Scholarships",
  "nav.finance.accounting": "Accounting",
  "nav.finance.budget": "Budget",
  "nav.finance.expenses": "Expenses",

  // ── Navigation: Messaging ──────────────────────────────────────────
  "nav.messaging.internal": "Internal messages",
  "nav.messaging.email": "Email",
  "nav.messaging.sms": "SMS",
  "nav.messaging.whatsapp": "WhatsApp Business",
  "nav.messaging.push": "Push notifications",
  "nav.messaging.announcements": "Announcements",
  "nav.messaging.newsletters": "Newsletters",

  // ── Navigation: Settings ───────────────────────────────────────────
  "nav.settings.schoolProfile": "School profile",
  "nav.settings.branding": "Branding",
  "nav.settings.users": "Users",
  "nav.settings.roles": "Roles",
  "nav.settings.permissions": "Permissions",
  "nav.settings.languages": "Languages",
  "nav.settings.paymentGateways": "Payment gateways",
  "nav.settings.communicationGateways": "Communication gateways",
  "nav.settings.ai": "AI settings",
  "nav.settings.backup": "Backup",
  "nav.settings.security": "Security",
  "nav.settings.auditLogs": "Audit logs",

  // ── Dashboard overview ─────────────────────────────────────────────
  "dashboard.title": "Overview",
  "dashboard.welcome": "Welcome back",
  "dashboard.students": "Students",
  "dashboard.teachers": "Teachers",
  "dashboard.classes": "Classes",
  "dashboard.subjects": "Subjects",
  "dashboard.curriculum": "Schemes of work",
  "dashboard.lessonPlans": "Lesson plans",
  "dashboard.quizzes": "Quizzes",
  "dashboard.published": "published",
  "dashboard.quickLinks": "Quick links",
  "dashboard.curriculumMode": "Curriculum mode",
  "dashboard.modeManual": "Manual",
  "dashboard.modeAiAutomatic": "AI automatic",
  "dashboard.modeHybrid": "Hybrid",
} as const;

/**
 * Keys stay literal so a typo at a call site is a compile error, but values
 * widen to `string` — without that, `as const` would make each value its own
 * literal type and a translated locale could only ever repeat the English
 * text verbatim.
 */
export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
