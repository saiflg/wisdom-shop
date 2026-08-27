import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every route with no role guard, held to an explicit list.
 *
 * The guards on this API are two-layered: a `@Roles` decorator on the route
 * or its controller, and — for anything a family may see some of — scoping
 * by viewer inside the service, which is what makes a guardian's invoice
 * request return only their own. Both are legitimate. What is not legitimate
 * is a route with neither, and that is invisible: it works perfectly in
 * testing, because the person testing is an administrator.
 *
 * It has happened. Six discount and scholarship routes were added to
 * FeesController, which had no class-level @Roles, and a teacher could
 * discount a family's bill. Nothing failed; an end-to-end check caught it by
 * asserting a 403 that turned out to be a 201.
 *
 * So this test lists the routes that carry no decorator, each with the reason
 * it is safe. Adding a route without a guard fails here until somebody either
 * guards it or writes down why it does not need one. The point is not that
 * the list is short — it is that nothing joins it by accident.
 */

const SRC = join(__dirname, "..");

/**
 * Routes that deliberately carry no @Roles, and why.
 *
 * Everything here is reachable by a signed-in user of any role, and is safe
 * only because the service behind it narrows what that user can see. If you
 * are adding to this list, the question to answer is: what does the SERVICE
 * do when a student asks for another student's row?
 */
const ALLOWED_WITHOUT_ROLES: Record<string, string> = {
  // The signed-in person's own record, by definition.
  "accessibility/accessibility.controller.ts:GET me": "your own accessibility profile",
  "accessibility/accessibility.controller.ts:PUT me": "your own accessibility profile",
  "auth/auth.controller.ts:GET me": "the current token's own user",

  // Scoped by viewer in the service: a student sees their own, staff see all.
  "accessibility/accessibility.controller.ts:GET users/:userId": "service refuses another person's profile",
  "accessibility/accessibility.controller.ts:PUT users/:userId": "service refuses another person's profile",
  "attendance/attendance.controller.ts:GET registers/:id": "students and guardians see only their own rows",
  "attendance/attendance.controller.ts:GET classes/:classId/registers": "service checks the viewer teaches it",
  "attendance/attendance.controller.ts:GET students/:studentProfileId": "service refuses another family's child",
  "classes/classes.controller.ts:GET /": "names only; a class list is not a contact list",
  "classes/classes.controller.ts:GET mine": "the viewer's own classes, by definition",
  "classes/classes.controller.ts:GET :id": "names only",
  // A section is the school describing its own shape — Primary, Secondary,
  // Islamiyyah — and the class names inside it. Same exposure as the class
  // list above, which is why it sits with it. Everything that writes here is
  // @Roles("SCHOOL_ADMIN").
  "sections/sections.controller.ts:GET /": "the school's own structure; names and counts only",
  "sections/sections.controller.ts:GET :id": "the school's own structure; class names only",

  // The address on the school's own letterhead, not a secret — a parent
  // looking up the school's phone number in the portal is the ordinary case.
  // The PATCH beside these is @Roles("SCHOOL_ADMIN").
  "school-profile/school-profile.controller.ts:GET /": "the school's own particulars, as printed on what it hands out",
  "school-profile/school-profile.controller.ts:GET document-header": "the same particulars, formatted for a page header",

  // A catalogue is what a library is for: a child who cannot see what the
  // school owns cannot ask for it. Titles, authors and counts only — no loan
  // and no borrower is exposed by either of these. Issuing and returning are
  // @Roles("SCHOOL_ADMIN", "TEACHER"), and GET loans is scoped by viewer.
  "library/library.controller.ts:GET books": "the catalogue; titles and counts, no borrowers",
  "library/library.controller.ts:GET limits": "how many books a borrower may have, and for how long",
  "grading/grading.controller.ts:GET results": "released results, scoped by viewer",
  "grading/grading.controller.ts:GET report-cards/:studentProfileId": "404s for another family's child",
  "grading/grading.controller.ts:GET transcripts/:studentProfileId": "404s for another family's child; published terms only, for everybody",
  "homework/homework.controller.ts:GET /": "a student sees their own class's work",
  "homework/homework.controller.ts:GET :id": "scoped by viewer",
  "homework/homework.controller.ts:POST :id/submit": "a student submits their own work",
  "exams/exams.controller.ts:GET /": "published papers for the viewer's class",
  "exams/exams.controller.ts:POST :id/sit": "a student sits their own paper",
  "exams/exams.controller.ts:POST :id/answers": "their own attempt",
  "exams/exams.controller.ts:POST :id/submit": "their own attempt",
  "exams/exams.controller.ts:GET :id/my-attempt": "their own attempt, by definition",
  "quizzes/quizzes.controller.ts:GET /": "published quizzes, answers stripped for students",
  "quizzes/quizzes.controller.ts:GET :id": "answers stripped for students",
  "portal/portal.controller.ts:GET children": "the viewer's own children",
  "portal/portal.controller.ts:GET home": "the viewer's own child",
  "parent-messages/parent-messages.controller.ts:GET /": "a family sees its own threads",
  "parent-messages/parent-messages.controller.ts:GET :studentProfileId": "404s for another family",
  "parent-messages/parent-messages.controller.ts:POST :studentProfileId": "404s for another family",
  "parent-messages/parent-messages.controller.ts:DELETE messages/:messageId": "only your own message",
  "class-chat/class-chat.controller.ts:GET classes/:classId/members": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:GET classes/:classId/chat": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:POST classes/:classId/chat": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:POST classes/:classId/chat/file": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:GET class-chat/attachments/:id": "re-checks the viewer against the message",
  "class-chat/class-chat.controller.ts:PUT classes/:classId/chat/lock": "service requires staff",
  "class-chat/class-chat.controller.ts:DELETE class-messages/:messageId": "own message, or staff",
  "class-chat/class-chat.controller.ts:POST class-messages/:messageId/report": "any pupil may report",
  "class-chat/class-chat.controller.ts:GET class-messages/reports": "service requires staff",
  "people/people.controller.ts:GET :userId/photo": "photo-visibility.ts decides per viewer",
  "people/people.controller.ts:POST :userId/photo": "staff, or the person themselves",
  "people/people.controller.ts:DELETE :userId/photo": "staff, or the person themselves",
  "students/students.controller.ts:GET /": "guardians see only their own children",
  "students/students.controller.ts:GET :id": "404s for another family's child",
  "subjects/subjects.controller.ts:GET /": "the school's subject list is not sensitive",
  "subjects/subjects.controller.ts:GET :id": "the school's subject list is not sensitive",
  "timetable/timetable.controller.ts:GET periods": "the school's timetable shape",
  "timetable/timetable.controller.ts:GET settings": "the school's timetable shape",
  "timetable/timetable.controller.ts:GET classes/:classId": "a class's own week",
  "timetable/timetable.controller.ts:GET teachers/:teacherUserId": "a teacher's own week",
  "schemes-of-work/schemes-of-work.controller.ts:GET /": "published only, for students",
  "schemes-of-work/schemes-of-work.controller.ts:GET :id": "404s on an unpublished scheme",
  "lesson-plans/lesson-plans.controller.ts:GET /": "published only, for students",
  "lesson-plans/lesson-plans.controller.ts:GET :id": "404s on an unpublished plan",
  "pdf/pdf.controller.ts:GET report-cards/:studentProfileId": "same scoping as the JSON route",
  "pdf/pdf.controller.ts:GET classes/:classId/list": "service requires staff",
  "pdf/pdf.controller.ts:GET classes/:classId/timetable": "a class's own week",
  "pdf/pdf.controller.ts:GET teachers/:teacherUserId/timetable": "a teacher's own week",
  "pdf/pdf.controller.ts:GET invoices/:invoiceId": "same scoping as the JSON route",
  "branding/branding.controller.ts:GET /": "this school's own branding, for its own console",
  "curriculum-settings/curriculum-settings.controller.ts:GET /": "read by every screen that renders a lesson",
  "schools/school-context.controller.ts:GET modules": "which modules this school bought, for the nav",
  "fees/fee-checkout.controller.ts:POST fees/invoices/:id/checkout": "a family pays its own bill; service scopes it",
  "fees/fee-checkout.controller.ts:GET fees/invoices/:id/payment-options":
    "same scoping as the checkout route — paymentOptions reads the invoice through FeesService.getInvoice, which " +
    "404s another family's invoice before any gateway is named",

  // The AI teacher: a lesson belongs to the student taking it, and the
  // service refuses anybody else — including a teacher — from speaking in it.
  "ai-teacher/ai-teacher.controller.ts:POST /": "starts the viewer's own lesson",
  "ai-teacher/ai-teacher.controller.ts:GET /": "the viewer's own lessons",
  "ai-teacher/ai-teacher.controller.ts:GET :id": "service refuses another student's lesson",
  "ai-teacher/ai-teacher.controller.ts:POST :id/ask": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:POST :id/continue": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:PATCH :id/pause": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:PATCH :id/resume": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:PATCH :id/end": "only the student whose lesson it is",
};

interface Route {
  key: string;
  file: string;
}

function controllers(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) controllers(full, found);
    else if (entry.name.endsWith(".controller.ts")) found.push(full);
  }
  return found;
}

function unguardedRoutes(): Route[] {
  const routes: Route[] = [];

  for (const file of controllers(SRC)) {
    const text = readFileSync(file, "utf8");
    const relative = file.replace(SRC, "").replace(/\\/g, "/").replace(/^\//, "");

    const classAt = text.search(/export class \w+/);
    const head = text.slice(0, classAt);
    // A class-level guard makes every route in it deny-by-default. Platform
    // controllers carry their own guard stack; @Public is a deliberate,
    // separately reviewed decision (webhooks, the login page).
    if (/@Roles\(|@PlatformRoles\(|@Public\(\)/.test(head)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^\s*@(Get|Post|Patch|Put|Delete)\(/.exec(lines[i]);
      if (!match) continue;

      const around = lines.slice(Math.max(0, i - 4), i + 6).join("\n");
      if (/@Roles\(|@PlatformRoles\(|@Public\(\)/.test(around)) continue;

      const route = /\("([^"]*)"\)/.exec(lines[i])?.[1] ?? "/";
      routes.push({ key: `${relative}:${match[1].toUpperCase()} ${route}`, file: relative });
    }
  }

  return routes;
}

describe("every route is guarded, or listed as deliberately open", () => {
  const found = unguardedRoutes();

  it("has no route that is open without a written reason", () => {
    const undocumented = found.map((r) => r.key).filter((key) => !(key in ALLOWED_WITHOUT_ROLES));

    // Thrown rather than asserted, because the message is the point:
    // whoever hits this needs to know what to do about it.
    if (undocumented.length > 0) {
      throw new Error(
        `These routes carry no @Roles and are not on the list in route-guards.spec.ts:\n\n` +
          undocumented.map((key) => `  ${key}`).join("\n") +
          `\n\nEither add @Roles to the route (or its controller), or add it to ` +
          `ALLOWED_WITHOUT_ROLES with a note saying what the SERVICE does when ` +
          `somebody asks for a row that is not theirs.`,
      );
    }
    expect(undocumented).toEqual([]);
  });

  it("keeps the list honest: nothing on it that no longer exists", () => {
    // A stale entry is a guard somebody may believe is deliberate when the
    // route has since been removed or protected.
    const live = new Set(found.map((r) => r.key));
    const stale = Object.keys(ALLOWED_WITHOUT_ROLES).filter((key) => !live.has(key));
    expect(stale).toEqual([]);
  });

  it("the money controller is deny-by-default", () => {
    // The one that bit: six routes were added to it and a teacher could
    // discount a bill. Only the two family-facing reads may be open.
    const feesOpen = found.filter((r) => r.file === "fees/fees.controller.ts").map((r) => r.key);
    expect(feesOpen).toEqual([]);
  });
});
