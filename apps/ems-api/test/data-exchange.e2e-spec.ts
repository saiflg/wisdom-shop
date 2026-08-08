import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { buildSheet, parseSheet } from "../src/data-exchange/workbook";

const FIXTURE_PREFIX = "e2e-data-";

describe("Data import and export (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let teacherToken: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  const STUDENT_HEADERS = [
    { header: "Admission number", field: "studentCode" },
    { header: "First name", field: "firstName" },
    { header: "Last name", field: "lastName" },
    { header: "Date of birth", field: "dateOfBirth" },
  ];

  async function studentsFile(rows: Record<string, string>[], format: "xlsx" | "csv" = "xlsx") {
    return buildSheet(STUDENT_HEADERS, rows, format);
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.provisioningAttempt.deleteMany({ where: { school: { slug: { startsWith: FIXTURE_PREFIX } } } });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await new Promise<void>((resolve) => app.getHttpServer().listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);
    await purgeFixtures();

    const argon2 = await import("argon2");
    await controlPrisma.platformUser.create({
      data: {
        email: platformEmail,
        passwordHash: await argon2.hash(password),
        firstName: "E2E",
        lastName: "Platform",
        roles: ["PLATFORM_ADMIN"],
      },
    });
    const platformLogin = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password })
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: school.slug,
      })
      .expect(201);

    adminToken = await login(school.adminEmail);

    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({ firstName: "Ade", lastName: "Balogun", email: teacherEmail, password })
      .expect(201);
    teacherToken = await login(teacherEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("lists what can be imported and exported", async () => {
    const res = await request(app.getHttpServer()).get("/v1/data/entities").set(asAdmin()).expect(200);
    expect(res.body.map((e: { name: string }) => e.name).sort()).toEqual([
      "classes",
      "curriculum",
      "parents",
      "results",
      "staff",
      "students",
      "subjects",
      "timetable",
    ]);
  });

  it("offers an empty template with the right headers", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/data/students/template?format=csv")
      .set(asAdmin())
      .expect(200);
    expect(res.headers["content-disposition"]).toContain("students-template.csv");
    expect(res.text).toContain("Admission number");
  });

  it("previews a file without writing anything", async () => {
    // The rule the whole module exists for.
    const file = await studentsFile([
      { studentCode: "ADM001", firstName: "Ada", lastName: "One", dateOfBirth: "2015-04-03" },
      { studentCode: "ADM002", firstName: "Bola", lastName: "Two", dateOfBirth: "" },
    ]);

    const preview = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);

    expect(preview.body).toMatchObject({ toCreate: 2, toUpdate: 0, withErrors: 0, canCommit: null });

    // Nothing written: the export is still empty.
    const exported = await request(app.getHttpServer())
      .get("/v1/data/students/export?format=csv")
      .set(asAdmin())
      .expect(200);
    expect(exported.text).not.toContain("ADM001");
  });

  it("imports when asked explicitly", async () => {
    const file = await studentsFile([
      { studentCode: "ADM001", firstName: "Ada", lastName: "One", dateOfBirth: "2015-04-03" },
      { studentCode: "ADM002", firstName: "Bola", lastName: "Two", dateOfBirth: "" },
    ]);

    const res = await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);

    expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    expect(res.body.failures).toEqual([]);
  });

  it("treats a re-upload as an update, not a second copy of the same child", async () => {
    // What admission numbers are for. Without this, correcting a typo and
    // re-uploading would duplicate the entire roster.
    const file = await studentsFile([
      { studentCode: "ADM001", firstName: "Adaeze", lastName: "One", dateOfBirth: "2015-04-03" },
    ]);

    const preview = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);
    expect(preview.body).toMatchObject({ toCreate: 0, toUpdate: 1 });

    await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);

    const exported = await request(app.getHttpServer())
      .get("/v1/data/students/export?format=csv")
      .set(asAdmin())
      .expect(200);
    expect(exported.text).toContain("Adaeze");
    // Still two students, not three.
    expect(exported.text.trim().split("\n")).toHaveLength(3);
  });

  it("round-trips an export back through import unchanged", async () => {
    // The property that makes "export, edit in Excel, re-upload" safe.
    const exported = await request(app.getHttpServer())
      .get("/v1/data/students/export?format=xlsx")
      .set(asAdmin())
      // Without this supertest parses the response by content-type and hands
      // back an object rather than the file's bytes.
      .responseType("blob")
      .expect(200);

    const preview = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", exported.body as Buffer, "students.xlsx")
      .expect(201);

    expect(preview.body.withErrors).toBe(0);
    expect(preview.body.toCreate).toBe(0);
    expect(preview.body.toUpdate).toBe(2);
  });

  it("reports bad rows against the spreadsheet's own row numbers", async () => {
    const file = await studentsFile([
      { studentCode: "ADM010", firstName: "Good", lastName: "Row", dateOfBirth: "" },
      { studentCode: "ADM011", firstName: "", lastName: "NoFirstName", dateOfBirth: "" },
      { studentCode: "ADM012", firstName: "Bad", lastName: "Date", dateOfBirth: "2026-02-31" },
    ]);

    const res = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);

    expect(res.body.withErrors).toBe(2);
    const errors = res.body.rows.filter((r: { action: string }) => r.action === "error");
    expect(errors.map((r: { rowNumber: number }) => r.rowNumber)).toEqual([3, 4]);
    // 2026-02-31 is not a real day, even though Date.parse accepts it.
    expect(errors[1].problems[0]).toMatch(/not a real date/i);
  });

  it("imports the good rows and skips the bad ones", async () => {
    // One typo must not block a correct roster.
    const file = await studentsFile([
      { studentCode: "ADM020", firstName: "Fine", lastName: "One", dateOfBirth: "" },
      { studentCode: "ADM021", firstName: "", lastName: "Broken", dateOfBirth: "" },
    ]);

    const res = await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set(asAdmin())
      .attach("file", file, "students.xlsx")
      .expect(201);

    expect(res.body).toMatchObject({ created: 1, skipped: 1 });
  });

  it("refuses a file missing a required column outright", async () => {
    // The wrong file entirely — importing its readable half is worse than
    // importing none of it.
    const file = await buildSheet([{ header: "First name", field: "firstName" }], [{ firstName: "Ada" }], "csv");

    const preview = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", file, "wrong.csv")
      .expect(201);
    // Names every missing column, not just the first — a school fixing the
    // file should see the whole gap at once.
    expect(preview.body.canCommit).toMatch(/no Admission number or Last name column/i);

    await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set(asAdmin())
      .attach("file", file, "wrong.csv")
      .expect(400);
  });

  it("refuses the old binary .xls with an explanation", async () => {
    const file = await studentsFile([{ studentCode: "ADM001", firstName: "A", lastName: "B", dateOfBirth: "" }]);
    const res = await request(app.getHttpServer())
      .post("/v1/data/students/preview")
      .set(asAdmin())
      .attach("file", file, "students.xls")
      .expect(400);
    expect(res.body.message).toMatch(/\.xlsx or \.csv/i);
  });

  it("keeps a leading-zero admission number intact end to end", async () => {
    // Excel turning "007" into 7 would silently mis-identify a child.
    // Built as csv because the format is taken from the filename — a .xlsx
    // renamed to .csv is refused rather than misread, which is the right
    // behaviour and was my test's mistake, not the code's.
    const file = await studentsFile(
      [{ studentCode: "007", firstName: "Leading", lastName: "Zero", dateOfBirth: "" }],
      "csv",
    );
    await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set(asAdmin())
      .attach("file", file, "students.csv")
      .expect(201);

    const exported = await request(app.getHttpServer())
      .get("/v1/data/students/export?format=csv")
      .set(asAdmin())
      .expect(200);
    expect(exported.text).toContain("007");
  });

  it("never puts a full account number in a staff export", async () => {
    const staff = await request(app.getHttpServer()).get("/v1/staff").set(asAdmin()).expect(200);
    const target = staff.body.find((s: { email: string }) => s.email === teacherEmail);

    await request(app.getHttpServer())
      .put(`/v1/staff/${target.id}`)
      .set(asAdmin())
      .send({ staffNumber: "STF-100", accountName: "Ade Balogun", accountNumber: "0123456789" })
      .expect(200);

    const exported = await request(app.getHttpServer())
      .get("/v1/data/staff/export?format=csv")
      .set(asAdmin())
      .expect(200);

    // This file is built to be emailed around.
    expect(exported.text).not.toContain("0123456789");
    expect(exported.text).toContain("6789");
  });

  it("refuses a parent row naming a child the school does not have", async () => {
    // Importing parents must never quietly invent students.
    const file = await buildSheet(
      [
        { header: "Email", field: "email" },
        { header: "First name", field: "firstName" },
        { header: "Last name", field: "lastName" },
        { header: "Child admission number", field: "studentCode" },
      ],
      [{ email: "ghost@example.com", firstName: "Ghost", lastName: "Parent", studentCode: "NOPE-999" }],
      "csv",
    );

    const res = await request(app.getHttpServer())
      .post("/v1/data/parents/import")
      .set(asAdmin())
      .attach("file", file, "parents.csv")
      .expect(201);

    expect(res.body.created).toBe(0);
    expect(res.body.failures[0].problem).toMatch(/No student with admission number NOPE-999/);
    expect(res.body.failures[0].rowNumber).toBe(2);
  });

  // ── The three whose identity is more than one column ─────────────────

  describe("timetable, results and curriculum", () => {
    it("offers a template for each", async () => {
      for (const entity of ["timetable", "results", "curriculum"]) {
        const res = await request(app.getHttpServer())
          .get(`/v1/data/${entity}/template?format=csv`)
          .set(asAdmin())
          .expect(200);
        expect(res.headers["content-disposition"]).toContain(`${entity}-template.csv`);
      }
    });

    it("does not mistake several lessons for the same class as duplicates", async () => {
      // With a single key column every row after the first would read as a
      // repeat of Grade 5A, and the whole timetable would collapse to one
      // lesson.
      const file = await buildSheet(
        [
          { header: "Class", field: "className" },
          { header: "Day", field: "day" },
          { header: "Period", field: "period" },
          { header: "Subject", field: "subject" },
        ],
        [
          { className: "Grade 5A", day: "MONDAY", period: "Period 1", subject: "Mathematics" },
          { className: "Grade 5A", day: "MONDAY", period: "Period 2", subject: "Mathematics" },
          { className: "Grade 5A", day: "TUESDAY", period: "Period 1", subject: "Mathematics" },
        ],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/timetable/preview")
        .set(asAdmin())
        .attach("file", file, "timetable.csv")
        .expect(201);

      expect(preview.body.withErrors).toBe(0);
      expect(preview.body.toCreate).toBe(3);
    });

    it("still catches a genuine double-booking of one slot", async () => {
      const file = await buildSheet(
        [
          { header: "Class", field: "className" },
          { header: "Day", field: "day" },
          { header: "Period", field: "period" },
          { header: "Subject", field: "subject" },
        ],
        [
          { className: "Grade 5A", day: "MONDAY", period: "Period 1", subject: "Mathematics" },
          { className: "Grade 5A", day: "MONDAY", period: "Period 1", subject: "English" },
        ],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/timetable/preview")
        .set(asAdmin())
        .attach("file", file, "timetable.csv")
        .expect(201);

      expect(preview.body.withErrors).toBe(1);
      expect(JSON.stringify(preview.body)).toMatch(/Class \+ Day \+ Period/);
    });

    it("refuses a weekday it does not recognise", async () => {
      const file = await buildSheet(
        [
          { header: "Class", field: "className" },
          { header: "Day", field: "day" },
          { header: "Period", field: "period" },
          { header: "Subject", field: "subject" },
        ],
        [{ className: "Grade 5A", day: "Someday", period: "Period 1", subject: "Mathematics" }],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/timetable/preview")
        .set(asAdmin())
        .attach("file", file, "timetable.csv")
        .expect(201);

      expect(preview.body.withErrors).toBe(1);
      expect(JSON.stringify(preview.body)).toMatch(/MONDAY/);
    });

    it("refuses a timetable row naming a class the school does not have", async () => {
      const file = await buildSheet(
        [
          { header: "Class", field: "className" },
          { header: "Day", field: "day" },
          { header: "Period", field: "period" },
          { header: "Subject", field: "subject" },
        ],
        [{ className: "Nonexistent", day: "MONDAY", period: "Period 1", subject: "Mathematics" }],
        "csv",
      );

      const res = await request(app.getHttpServer())
        .post("/v1/data/timetable/import")
        .set(asAdmin())
        .attach("file", file, "timetable.csv")
        .expect(201);

      // Importing a timetable must never quietly invent a class.
      expect(res.body.created).toBe(0);
      expect(res.body.failures[0].problem).toMatch(/No class called "Nonexistent"/);
    });

    it("re-importing a timetable replaces the lesson rather than double-booking the slot", async () => {
      // The bug this exists for: the plan says "update", but if `apply`
      // matches the slot differently from the way the key was built, the
      // update quietly becomes a second lesson in the same period. Found in
      // a browser, not by a test — hence this one.
      await request(app.getHttpServer())
        .post("/v1/classes")
        .set(asAdmin())
        .send({ name: "Import 5A", academicYear: "2026-2027" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/v1/subjects")
        .set(asAdmin())
        .send({ name: "Import Maths" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/v1/subjects")
        .set(asAdmin())
        .send({ name: "Import English" })
        .expect(201);
      // Replaces the whole day, which is safe here: nothing else in this
      // suite depends on the period structure.
      await request(app.getHttpServer())
        .put("/v1/timetable/periods")
        .set(asAdmin())
        .send({ periods: [{ label: "Slot A", startMinute: 480, endMinute: 520 }] })
        .expect(200);

      const sheet = (subject: string) =>
        buildSheet(
          [
            { header: "Class", field: "className" },
            { header: "Day", field: "day" },
            { header: "Period", field: "period" },
            { header: "Subject", field: "subject" },
          ],
          [{ className: "Import 5A", day: "MONDAY", period: "Slot A", subject }],
          "csv",
        );

      await request(app.getHttpServer())
        .post("/v1/data/timetable/import")
        .set(asAdmin())
        .attach("file", await sheet("Import Maths"), "timetable.csv")
        .expect(201);

      const second = await request(app.getHttpServer())
        .post("/v1/data/timetable/import")
        .set(asAdmin())
        .attach("file", await sheet("Import English"), "timetable.csv")
        .expect(201);
      expect(second.body.failures).toEqual([]);

      const exported = await request(app.getHttpServer())
        .get("/v1/data/timetable/export?format=csv")
        .set(asAdmin())
        .expect(200);

      const slots = exported.text
        .split("\n")
        .filter((line) => line.includes("Import 5A") && line.includes("Slot A"));

      // One lesson in the slot, and it is the one most recently imported.
      expect(slots).toHaveLength(1);
      expect(slots[0]).toContain("Import English");
    });

    it("refuses a negative mark before it reaches the database", async () => {
      const file = await buildSheet(
        [
          { header: "Admission number", field: "studentCode" },
          { header: "Assessment", field: "assessment" },
          { header: "Score", field: "score" },
        ],
        [{ studentCode: "ADM001", assessment: "Mid-term", score: "-5" }],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/results/preview")
        .set(asAdmin())
        .attach("file", file, "results.csv")
        .expect(201);

      expect(preview.body.withErrors).toBe(1);
      expect(JSON.stringify(preview.body)).toMatch(/cannot be negative/i);
    });

    it("treats each week of a scheme of work as its own row", async () => {
      const file = await buildSheet(
        [
          { header: "Subject", field: "subject" },
          { header: "Academic year", field: "academicYear" },
          { header: "Term", field: "term" },
          { header: "Week", field: "weekNumber" },
          { header: "Topic", field: "topic" },
          { header: "Objectives", field: "objectives" },
        ],
        [
          {
            subject: "Mathematics",
            academicYear: "2026-2027",
            term: "Term 1",
            weekNumber: "1",
            topic: "Counting",
            objectives: "Count to ten; Count backwards",
          },
          {
            subject: "Mathematics",
            academicYear: "2026-2027",
            term: "Term 1",
            weekNumber: "2",
            topic: "Adding",
            objectives: "Add single digits",
          },
        ],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/curriculum/preview")
        .set(asAdmin())
        .attach("file", file, "curriculum.csv")
        .expect(201);

      // Same subject, year and term — different weeks, so two rows.
      expect(preview.body.withErrors).toBe(0);
      expect(preview.body.toCreate).toBe(2);
    });

    it("tells the user to use semicolons rather than new lines in a list", async () => {
      const file = await buildSheet(
        [
          { header: "Subject", field: "subject" },
          { header: "Academic year", field: "academicYear" },
          { header: "Term", field: "term" },
          { header: "Week", field: "weekNumber" },
          { header: "Topic", field: "topic" },
          { header: "Objectives", field: "objectives" },
        ],
        [
          {
            subject: "Mathematics",
            academicYear: "2026-2027",
            term: "Term 1",
            weekNumber: "1",
            topic: "Counting",
            objectives: "Count to ten\nCount backwards",
          },
        ],
        "csv",
      );

      const preview = await request(app.getHttpServer())
        .post("/v1/data/curriculum/preview")
        .set(asAdmin())
        .attach("file", file, "curriculum.csv")
        .expect(201);

      expect(JSON.stringify(preview.body)).toMatch(/semicolon/i);
    });

    it("exports all three without error, even when empty", async () => {
      for (const entity of ["timetable", "results", "curriculum"]) {
        const res = await request(app.getHttpServer())
          .get(`/v1/data/${entity}/export?format=csv`)
          .set(asAdmin())
          .expect(200);
        expect(res.headers["content-disposition"]).toContain(entity);
      }
    });
  });

  it("hides import and export from a teacher", async () => {
    await request(app.getHttpServer())
      .get("/v1/data/students/export")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);

    const file = await studentsFile([{ studentCode: "X", firstName: "A", lastName: "B", dateOfBirth: "" }]);
    await request(app.getHttpServer())
      .post("/v1/data/students/import")
      .set("Authorization", `Bearer ${teacherToken}`)
      .attach("file", file, "students.xlsx")
      .expect(403);
  });

  it("exports subjects and classes too", async () => {
    for (const entity of ["subjects", "classes"]) {
      const res = await request(app.getHttpServer())
        .get(`/v1/data/${entity}/export?format=csv`)
        .set(asAdmin())
        .expect(200);
      expect(res.headers["content-disposition"]).toContain(entity);
    }
  });

  it("404s an entity that does not exist", async () => {
    await request(app.getHttpServer()).get("/v1/data/dragons/export").set(asAdmin()).expect(404);
  });

  it("writes a usable xlsx, not merely bytes", async () => {
    const exported = await request(app.getHttpServer())
      .get("/v1/data/students/export?format=xlsx")
      .set(asAdmin())
      .responseType("blob")
      .expect(200);

    const parsed = await parseSheet(exported.body as Buffer, "xlsx");
    expect(parsed.headers[0]).toBe("Admission number");
    expect(parsed.rows.length).toBeGreaterThan(0);
  });
});
