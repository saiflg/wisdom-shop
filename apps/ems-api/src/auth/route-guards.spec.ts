import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyGuards } from "@/roles/capability-rules";

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
  "accessibility/accessibility.controller.ts:AccessibilityController:GET me": "your own accessibility profile",
  "accessibility/accessibility.controller.ts:AccessibilityController:PUT me": "your own accessibility profile",
  "auth/auth.controller.ts:AuthController:GET me": "the current token's own user",

  // Scoped by viewer in the service: a student sees their own, staff see all.
  "accessibility/accessibility.controller.ts:AccessibilityController:GET users/:userId": "service refuses another person's profile",
  "accessibility/accessibility.controller.ts:AccessibilityController:PUT users/:userId": "service refuses another person's profile",
  "attendance/attendance.controller.ts:AttendanceController:GET registers/:id": "students and guardians see only their own rows",
  "attendance/attendance.controller.ts:AttendanceController:GET classes/:classId/registers": "service checks the viewer teaches it",
  "attendance/attendance.controller.ts:AttendanceController:GET students/:studentProfileId": "service refuses another family's child",
  "classes/classes.controller.ts:ClassesController:GET /": "names only; a class list is not a contact list",
  "classes/classes.controller.ts:ClassesController:GET mine": "the viewer's own classes, by definition",
  "classes/classes.controller.ts:ClassesController:GET :id": "names only",
  // A section is the school describing its own shape — Primary, Secondary,
  // Islamiyyah — and the class names inside it. Same exposure as the class
  // list above, which is why it sits with it. Everything that writes here is
  // @Roles("SCHOOL_ADMIN").
  "sections/sections.controller.ts:SectionsController:GET /": "the school's own structure; names and counts only",
  "sections/sections.controller.ts:SectionsController:GET :id": "the school's own structure; class names only",

  // The address on the school's own letterhead, not a secret — a parent
  // looking up the school's phone number in the portal is the ordinary case.
  // The PATCH beside these is @Roles("SCHOOL_ADMIN").
  "school-profile/school-profile.controller.ts:SchoolProfileController:GET /": "the school's own particulars, as printed on what it hands out",
  "school-profile/school-profile.controller.ts:SchoolProfileController:GET document-header": "the same particulars, formatted for a page header",

  // A catalogue is what a library is for: a child who cannot see what the
  // school owns cannot ask for it. Titles, authors and counts only — no loan
  // and no borrower is exposed by either of these. Issuing and returning are
  // @Roles("SCHOOL_ADMIN", "TEACHER"), and GET loans is scoped by viewer.
  "library/library.controller.ts:LibraryController:GET books": "the catalogue; titles and counts, no borrowers",
  "library/library.controller.ts:LibraryController:GET limits": "how many books a borrower may have, and for how long",
  "grading/grading.controller.ts:GradingController:GET results": "released results, scoped by viewer",
  "grading/grading.controller.ts:GradingController:GET report-cards/:studentProfileId": "404s for another family's child",
  "grading/grading.controller.ts:GradingController:GET transcripts/:studentProfileId": "404s for another family's child; published terms only, for everybody",
  "homework/homework.controller.ts:HomeworkController:GET /": "a student sees their own class's work",
  "homework/homework.controller.ts:HomeworkController:GET :id": "scoped by viewer",
  "homework/homework.controller.ts:HomeworkController:POST :id/submit": "a student submits their own work",
  "exams/exams.controller.ts:ExamsController:GET /": "published papers for the viewer's class",
  "exams/exams.controller.ts:ExamsController:POST :id/sit": "a student sits their own paper",
  "exams/exams.controller.ts:ExamsController:POST :id/answers": "their own attempt",
  "exams/exams.controller.ts:ExamsController:POST :id/submit": "their own attempt",
  "exams/exams.controller.ts:ExamsController:GET :id/my-attempt": "their own attempt, by definition",
  "quizzes/quizzes.controller.ts:QuizzesController:GET /": "published quizzes, answers stripped for students",
  "quizzes/quizzes.controller.ts:QuizzesController:GET :id": "answers stripped for students",
  "portal/portal.controller.ts:PortalController:GET children": "the viewer's own children",
  "portal/portal.controller.ts:PortalController:GET home": "the viewer's own child",
  "parent-messages/parent-messages.controller.ts:ParentMessagesController:GET /": "a family sees its own threads",
  "parent-messages/parent-messages.controller.ts:ParentMessagesController:GET :studentProfileId": "404s for another family",
  "parent-messages/parent-messages.controller.ts:ParentMessagesController:POST :studentProfileId": "404s for another family",
  "parent-messages/parent-messages.controller.ts:ParentMessagesController:DELETE messages/:messageId": "only your own message",
  "class-chat/class-chat.controller.ts:ClassChatController:GET classes/:classId/members": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:ClassChatController:GET classes/:classId/chat": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:ClassChatController:POST classes/:classId/chat": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:ClassChatController:POST classes/:classId/chat/file": "refuses a student not in the class",
  "class-chat/class-chat.controller.ts:ClassChatController:GET class-chat/attachments/:id": "re-checks the viewer against the message",
  "class-chat/class-chat.controller.ts:ClassChatController:PUT classes/:classId/chat/lock": "service requires staff",
  "class-chat/class-chat.controller.ts:ClassChatController:DELETE class-messages/:messageId": "own message, or staff",
  "class-chat/class-chat.controller.ts:ClassChatController:POST class-messages/:messageId/report": "any pupil may report",
  "class-chat/class-chat.controller.ts:ClassChatController:GET class-messages/reports": "service requires staff",
  "people/people.controller.ts:PeopleController:GET :userId/photo": "photo-visibility.ts decides per viewer",
  "people/people.controller.ts:PeopleController:POST :userId/photo": "staff, or the person themselves",
  "people/people.controller.ts:PeopleController:DELETE :userId/photo": "staff, or the person themselves",
  "students/students.controller.ts:StudentsController:GET /": "guardians see only their own children",
  "students/students.controller.ts:StudentsController:GET :id": "404s for another family's child",
  "subjects/subjects.controller.ts:SubjectsController:GET /": "the school's subject list is not sensitive",
  "subjects/subjects.controller.ts:SubjectsController:GET :id": "the school's subject list is not sensitive",
  "timetable/timetable.controller.ts:TimetableController:GET periods": "the school's timetable shape",
  "timetable/timetable.controller.ts:TimetableController:GET settings": "the school's timetable shape",
  "timetable/timetable.controller.ts:TimetableController:GET classes/:classId": "a class's own week",
  "timetable/timetable.controller.ts:TimetableController:GET teachers/:teacherUserId": "a teacher's own week",
  "schemes-of-work/schemes-of-work.controller.ts:SchemesOfWorkController:GET /": "published only, for students",
  "schemes-of-work/schemes-of-work.controller.ts:SchemesOfWorkController:GET :id": "404s on an unpublished scheme",
  "lesson-plans/lesson-plans.controller.ts:LessonPlansController:GET /": "published only, for students",
  "lesson-plans/lesson-plans.controller.ts:LessonPlansController:GET :id": "404s on an unpublished plan",
  "pdf/pdf.controller.ts:PdfController:GET report-cards/:studentProfileId": "same scoping as the JSON route",
  "pdf/pdf.controller.ts:PdfController:GET classes/:classId/list": "service requires staff",
  "pdf/pdf.controller.ts:PdfController:GET classes/:classId/timetable": "a class's own week",
  "pdf/pdf.controller.ts:PdfController:GET teachers/:teacherUserId/timetable": "a teacher's own week",
  "pdf/pdf.controller.ts:PdfController:GET invoices/:invoiceId": "same scoping as the JSON route",
  "branding/branding.controller.ts:BrandingController:GET /": "this school's own branding, for its own console",
  "curriculum-settings/curriculum-settings.controller.ts:CurriculumSettingsController:GET /": "read by every screen that renders a lesson",
  "schools/school-context.controller.ts:SchoolContextController:GET modules": "which modules this school bought, for the nav",
  "fees/fee-checkout.controller.ts:FeeCheckoutController:POST fees/invoices/:id/checkout": "a family pays its own bill; service scopes it",
  "fees/fee-checkout.controller.ts:FeeCheckoutController:GET fees/invoices/:id/payment-options":
    "same scoping as the checkout route — paymentOptions reads the invoice through FeesService.getInvoice, which " +
    "404s another family's invoice before any gateway is named",

  // The AI teacher: a lesson belongs to the student taking it, and the
  // service refuses anybody else — including a teacher — from speaking in it.
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:POST /": "starts the viewer's own lesson",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:GET /": "the viewer's own lessons",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:GET :id": "service refuses another student's lesson",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:POST :id/ask": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:POST :id/continue": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:PATCH :id/pause": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:PATCH :id/resume": "only the student whose lesson it is",
  "ai-teacher/ai-teacher.controller.ts:AiTeacherController:PATCH :id/end": "only the student whose lesson it is",

  // The board's video shelf: titles, subjects and YouTube links the school
  // put there itself. No child appears in it. Readable by anyone who can sit
  // in a lesson, which is the point of it; POST and DELETE beside it are
  // @Roles("SCHOOL_ADMIN", "TEACHER").
  //
  // This route went undocumented until the scanner learned to tell two
  // controllers in one file apart. It was never unguarded by decision — it
  // was invisible, which is worse.
  "ai-teacher/ai-teacher.controller.ts:LessonResourcesController:GET /":
    "the school's own demonstration videos; no student data",
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
    const lines = text.split(/\r?\n/);

    /*
     * Walked class by class, not file by file.
     *
     * Keying on the file alone was wrong, and wrong in the direction that
     * hides things. ai-teacher.controller.ts holds two controllers, both with
     * a bare `@Get()`, so both produced the key
     * "ai-teacher.controller.ts:GET /" — documenting one silently documented
     * the other, and the lesson-resources listing sat undocumented behind its
     * neighbour's entry for as long as this test has existed.
     *
     * The old version also read only the FIRST class's decorators and skipped
     * the entire file when they carried a guard, which would have hidden
     * every later controller in that file as well.
     */
    let className = "";
    let classGuarded = false;
    let pending: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      const classLine = /^export class (\w+)/.exec(line);
      if (classLine) {
        className = classLine[1]!;
        // A class-level guard makes every route in it deny-by-default.
        // Platform controllers carry their own guard stack; @Public is a
        // deliberate, separately reviewed decision (webhooks, the login page).
        classGuarded = /@Roles\(|@PlatformRoles\(|@Public\(\)/.test(pending.join("\n"));
        pending = [];
        continue;
      }

      /*
       * Decorators standing immediately above whatever comes next, so the next
       * `export class` is judged on its OWN head rather than on the file's
       * first one.
       *
       * Anything that is not a decorator, a comment or blank clears the run.
       * Without that, the last method of one controller could leak its
       * @Roles upward into the head of the next class in the same file and
       * silently mark all of its routes guarded — the same kind of blindness
       * this rewrite exists to remove.
       */
      const trimmed = line.trim();
      if (/^@/.test(trimmed)) pending.push(line);
      else if (trimmed === "" || /^(\/\/|\/\*|\*)/.test(trimmed)) {
        // neutral: comments and blank lines neither add nor clear
      } else pending = [];

      const match = /^\s*@(Get|Post|Patch|Put|Delete)\(/.exec(line);
      if (!match || classGuarded || !className) continue;

      /*
       * The route's own decorator run: what stands above it (already in
       * `pending`) plus what follows it, down to the method signature.
       *
       * This replaced a fixed window of four lines up and six down. A window
       * is a guess about formatting, and it guessed wrong the moment a
       * three-line comment was added above a @Post — the @Public() slid out
       * of range and a documented route reported itself unguarded. That
       * direction fails loudly, but the same window can as easily reach INTO
       * the next route and find a guard that does not apply to this one,
       * which does not.
       */
      const below: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = (lines[j] ?? "").trim();
        if (next.startsWith("@")) below.push(next);
        else if (next === "" || next.startsWith("//") || next.startsWith("*") || next.startsWith("/*")) continue;
        else break;
      }

      const own = [...pending, lines[i] ?? "", ...below].join("\n");
      if (/@Roles\(|@PlatformRoles\(|@Public\(\)/.test(own)) continue;

      const route = /\("([^"]*)"\)/.exec(line)?.[1] ?? "/";
      routes.push({
        key: `${relative}:${className}:${match[1].toUpperCase()} ${route}`,
        file: relative,
      });
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

  it("has an opinion about every guard the API actually uses", () => {
    /*
     * The Roles screen answers "could a stranger reach this" by reading the
     * guards attached to a route and deciding whether any of them asks who is
     * calling. That decision is a written list, not an inference, because
     * @Public() records which guard is SKIPPED and says nothing about which
     * were added back.
     *
     * A list like that rots the moment somebody writes a new guard. The number
     * on the screen would go on looking authoritative while quietly meaning
     * something else — which is the entire failure mode of this page's
     * history. So the list is checked against what is really in the tree.
     *
     * If this fails, add the new guard to AUTHENTICATING_GUARDS if it demands
     * a credential, or NON_AUTHENTICATING_GUARDS if it does not.
     */
    const used = new Set<string>();
    for (const file of controllers(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/@UseGuards\(([^)]*)\)/g)) {
        for (const name of (match[1] ?? "").split(",")) {
          const trimmed = name.trim();
          if (trimmed) used.add(trimmed);
        }
      }
    }

    // Sanity: if the scan finds nothing, this test proves nothing.
    expect(used.size).toBeGreaterThan(0);

    const { unknown } = classifyGuards([...used]);
    expect(unknown).toEqual([]);
  });

  it("tells two controllers in one file apart", () => {
    /*
     * The bug this guards against was in the guard itself.
     *
     * ai-teacher.controller.ts holds AiTeacherController and
     * LessonResourcesController, and both open with a bare `@Get()`. While
     * routes were keyed by file, the two collapsed into one entry: writing a
     * note for the lesson list silently vouched for the resource list too,
     * and GET /ai-teacher/resources sat undocumented behind its neighbour.
     *
     * A test that cannot see a route cannot report it missing, so this checks
     * the scanner's eyesight rather than the routes.
     */
    const sameFile = found.filter((r) => r.file === "ai-teacher/ai-teacher.controller.ts");
    const classes = new Set(sameFile.map((r) => r.key.split(":")[1]));

    expect(classes).toContain("AiTeacherController");
    expect(classes).toContain("LessonResourcesController");
    expect(new Set(sameFile.map((r) => r.key)).size).toBe(sameFile.length);
  });
});
