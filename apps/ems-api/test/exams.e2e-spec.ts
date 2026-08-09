import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-exam-";

/**
 * The examination module end to end.
 *
 * The tests that matter most here are the negative ones: that the answer key
 * never reaches a student through any route, that a paper cannot be sat
 * twice, and that one family cannot read another's result. Those are the
 * failures nobody would notice from the outside until it was far too late.
 */
describe("Exams and CBT (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let studentAToken: string;
  let studentBToken: string;
  let guardianAToken: string;
  let guardianBToken: string;

  let classId: string;
  let subjectId: string;
  let assessmentId: string;
  let studentAProfileId: string;

  let examId: string;
  let mcqId: string;
  let shortId: string;
  let essayId: string;
  let examQuestions: { id: string; type: string; prompt: string }[] = [];

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const studentBEmail = `${FIXTURE_PREFIX}student-b@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asStudentA = () => ({ Authorization: `Bearer ${studentAToken}` });
  const asStudentB = () => ({ Authorization: `Bearer ${studentBToken}` });
  const asGuardianA = () => ({ Authorization: `Bearer ${guardianAToken}` });
  const asGuardianB = () => ({ Authorization: `Bearer ${guardianBToken}` });

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.provisioningAttempt.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  };

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

    const klass = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(asAdmin())
      .send({ name: "Grade 5A", academicYear: "2026-2027" })
      .expect(201);
    classId = klass.body.id;

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics" })
      .expect(201);
    subjectId = subject.body.id;

    const assessment = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        name: "End of term exam",
        academicYear: "2026-2027",
        term: "Term 1",
        maxScoreHundredths: 2000,
        weightPercent: 100,
      })
      .expect(201);
    assessmentId = assessment.body.id;

    // Two students in two families, so a cross-family leak has something
    // real to leak.
    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentAEmail, password })
      .expect(201);
    studentAProfileId = a.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two", email: studentBEmail, password })
      .expect(201);

    for (const studentProfileId of [a.body.id, b.body.id]) {
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(asAdmin())
        .send({ studentProfileId, classId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: a.body.id,
        firstName: "Grace",
        lastName: "One",
        email: guardianAEmail,
        password,
        relationship: "Mother",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: b.body.id,
        firstName: "Gary",
        lastName: "Two",
        email: guardianBEmail,
        password,
        relationship: "Father",
      })
      .expect(201);

    studentAToken = await login(studentAEmail);
    studentBToken = await login(studentBEmail);
    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  // ── The question bank ──────────────────────────────────────────────────

  it("refuses a choice question whose answer names an option that is not there", async () => {
    // It would mark every student wrong whatever they chose.
    await request(app.getHttpServer())
      .post("/v1/exams/questions")
      .set(asAdmin())
      .send({
        subjectId,
        type: "SINGLE_CHOICE",
        prompt: "What is 2 + 2?",
        options: [
          { key: "A", text: "3" },
          { key: "B", text: "4" },
        ],
        answer: ["D"],
      })
      .expect(400);
  });

  it("refuses a short-answer question with no accepted answers", async () => {
    await request(app.getHttpServer())
      .post("/v1/exams/questions")
      .set(asAdmin())
      .send({ subjectId, type: "SHORT_ANSWER", prompt: "Name the capital.", answer: [] })
      .expect(400);
  });

  it("accepts a well-formed bank of questions", async () => {
    const mcq = await request(app.getHttpServer())
      .post("/v1/exams/questions")
      .set(asAdmin())
      .send({
        subjectId,
        topic: "Arithmetic",
        type: "SINGLE_CHOICE",
        prompt: "What is 2 + 2?",
        options: [
          { key: "A", text: "3" },
          { key: "B", text: "4" },
          { key: "C", text: "5" },
        ],
        answer: ["B"],
        marksHundredths: 200,
      })
      .expect(201);
    mcqId = mcq.body.id;

    const short = await request(app.getHttpServer())
      .post("/v1/exams/questions")
      .set(asAdmin())
      .send({
        subjectId,
        topic: "Arithmetic",
        type: "SHORT_ANSWER",
        prompt: "How many sides has a triangle?",
        answer: ["3", "three"],
        marksHundredths: 100,
      })
      .expect(201);
    shortId = short.body.id;

    const essay = await request(app.getHttpServer())
      .post("/v1/exams/questions")
      .set(asAdmin())
      .send({
        subjectId,
        topic: "Arithmetic",
        type: "ESSAY",
        prompt: "Explain why a fraction with a larger denominator is smaller.",
        marksHundredths: 500,
      })
      .expect(201);
    essayId = essay.body.id;
  });

  it("keeps the question bank away from students entirely", async () => {
    await request(app.getHttpServer()).get("/v1/exams/questions").set(asStudentA()).expect(403);
  });

  // ── Building and publishing a paper ────────────────────────────────────

  it("creates an exam as a draft", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/exams")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        title: "End of term test",
        academicYear: "2026-2027",
        term: "Term 1",
        durationMinutes: 45,
        assessmentId,
        shuffleQuestions: false,
      })
      .expect(201);

    examId = res.body.id;
    expect(res.body.status).toBe("DRAFT");
  });

  it("refuses to publish a paper with no questions on it", async () => {
    // A class would sit nothing, score zero out of zero, and that would
    // flow into a report card.
    await request(app.getHttpServer())
      .patch(`/v1/exams/${examId}`)
      .set(asAdmin())
      .send({ status: "PUBLISHED" })
      .expect(400);
  });

  it("copies bank questions onto the paper in the order given", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/questions`)
      .set(asAdmin())
      .send({ questionIds: [mcqId, shortId, essayId] })
      .expect(201);

    examQuestions = res.body.questions;
    expect(examQuestions.map((q) => q.type)).toEqual(["SINGLE_CHOICE", "SHORT_ANSWER", "ESSAY"]);
    expect(res.body.totalMarksHundredths).toBe(800);
  });

  it("keeps the paper unchanged when the bank question is edited afterwards", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/exams/questions/${mcqId}`)
      .set(asAdmin())
      .send({ prompt: "COMPLETELY DIFFERENT QUESTION" })
      .expect(200);

    const exam = await request(app.getHttpServer())
      .get(`/v1/exams/${examId}`)
      .set(asAdmin())
      .expect(200);

    // The snapshot is the whole point: a teacher fixing a typo next term
    // must not change the paper a student already answered.
    expect(exam.body.questions[0].prompt).toBe("What is 2 + 2?");
  });

  it("hides a draft paper from students entirely", async () => {
    const list = await request(app.getHttpServer()).get("/v1/exams").set(asStudentA()).expect(200);
    expect(list.body).toEqual([]);

    await request(app.getHttpServer()).post(`/v1/exams/${examId}/sit`).set(asStudentA()).expect(404);
  });

  it("publishes once there are questions", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/exams/${examId}`)
      .set(asAdmin())
      .send({ status: "PUBLISHED" })
      .expect(200);
    expect(res.body.status).toBe("PUBLISHED");
  });

  it("refuses to change the questions once it is published", async () => {
    // Renumbering the paper under a student part-way through would lose work.
    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/questions`)
      .set(asAdmin())
      .send({ questionIds: [shortId] })
      .expect(400);
  });

  // ── Sitting ────────────────────────────────────────────────────────────

  it("never sends the answer key to the student sitting the paper", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/sit`)
      .set(asStudentA())
      .expect(201);

    expect(res.body.questions).toHaveLength(3);
    for (const question of res.body.questions) {
      expect("answer" in question).toBe(false);
    }
    // Belt and braces: the key must not be anywhere in the payload, however
    // it got there.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("\"answer\"");
    expect(res.body.remainingSeconds).toBeGreaterThan(0);
    expect(res.body.totalMarksHundredths).toBe(800);
  });

  it("resumes the same attempt rather than starting a second one", async () => {
    // A laptop dying mid-exam must not cost a child their paper.
    const first = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/sit`)
      .set(asStudentA())
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/sit`)
      .set(asStudentA())
      .expect(201);

    expect(second.body.attemptId).toBe(first.body.attemptId);
    // The clock is not restarted by resuming.
    expect(new Date(second.body.expiresAt).getTime()).toBe(new Date(first.body.expiresAt).getTime());
  });

  it("refuses to let a guardian sit the paper for their child", async () => {
    await request(app.getHttpServer()).post(`/v1/exams/${examId}/sit`).set(asGuardianA()).expect(403);
  });

  it("saves answers as the student works", async () => {
    const [mcq, short, essay] = examQuestions;

    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: mcq.id, response: ["B"] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: short.id, response: ["Three"] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: essay.id, response: ["Because the whole is cut into more pieces."] })
      .expect(201);
  });

  it("lets a student change their mind before submitting", async () => {
    const [mcq] = examQuestions;
    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: mcq.id, response: ["C"] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: mcq.id, response: ["B"] })
      .expect(201);
  });

  it("refuses an answer to a question from a different paper", async () => {
    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: "some-other-papers-question", response: ["A"] })
      .expect(404);
  });

  it("auto-marks what it can on submit and holds the essay for a teacher", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/submit`)
      .set(asStudentA())
      .expect(201);

    expect(res.body.status).toBe("SUBMITTED");
    // The mark itself is withheld until release — removed from the payload,
    // not nulled, so nothing hints that marking has happened.
    expect("totalScoreHundredths" in res.body).toBe(false);
    expect("needsReview" in res.body).toBe(false);
  });

  it("refuses a second submission", async () => {
    await request(app.getHttpServer()).post(`/v1/exams/${examId}/submit`).set(asStudentA()).expect(403);
  });

  it("refuses to save any more answers after submitting", async () => {
    const [mcq] = examQuestions;
    await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/answers`)
      .set(asStudentA())
      .send({ examQuestionId: mcq.id, response: ["A"] })
      .expect(403);
  });

  it("refuses to start the paper again once it has been sat", async () => {
    await request(app.getHttpServer()).post(`/v1/exams/${examId}/sit`).set(asStudentA()).expect(403);
  });

  it("withholds the marks from the student until they are released", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/exams/${examId}/my-attempt`)
      .set(asStudentA())
      .expect(200);

    expect(res.body.status).toBe("SUBMITTED");
    expect("totalScoreHundredths" in res.body).toBe(false);
    expect(res.body.questions).toEqual([]);
    expect(res.body.answers).toEqual([]);
  });

  // ── Marking ────────────────────────────────────────────────────────────

  it("marked the objective questions correctly and flagged the essay", async () => {
    const exam = await request(app.getHttpServer()).get(`/v1/exams/${examId}`).set(asAdmin()).expect(200);

    const attempt = exam.body.attempts.find(
      (candidate: { studentProfileId: string }) => candidate.studentProfileId === studentAProfileId,
    );
    // 2 marks for the MCQ, 1 for "Three" against an accepted "three".
    expect(attempt.autoScoreHundredths).toBe(300);
    expect(attempt.needsReview).toBe(true);
    expect(exam.body.progress.needingReview).toBe(1);
  });

  it("holds back a release while an essay is still unmarked", async () => {
    // Releasing a paper where the essay scored nothing because nobody read
    // it is the exact failure the marking rules exist to prevent.
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/release`)
      .set(asAdmin())
      .expect(201);

    expect(res.body.released).toBe(0);
    expect(res.body.heldForReview).toBe(1);
  });

  it("refuses to award more marks than the question is worth", async () => {
    const exam = await request(app.getHttpServer()).get(`/v1/exams/${examId}`).set(asAdmin()).expect(200);
    const attemptId = exam.body.attempts[0].id;

    const attempt = await request(app.getHttpServer())
      .get(`/v1/exams/attempts/${attemptId}`)
      .set(asAdmin())
      .expect(200);

    const essayAnswer = attempt.body.answers.find(
      (answer: { examQuestionId: string }) =>
        answer.examQuestionId === examQuestions.find((q) => q.type === "ESSAY")?.id,
    );

    await request(app.getHttpServer())
      .patch(`/v1/exams/attempts/${attemptId}/answers/${essayAnswer.id}`)
      .set(asAdmin())
      .send({ awardedHundredths: 900 })
      .expect(400);
  });

  it("lets a teacher mark the essay, which finishes the paper", async () => {
    const exam = await request(app.getHttpServer()).get(`/v1/exams/${examId}`).set(asAdmin()).expect(200);
    const attemptId = exam.body.attempts[0].id;

    const attempt = await request(app.getHttpServer())
      .get(`/v1/exams/attempts/${attemptId}`)
      .set(asAdmin())
      .expect(200);

    const essayAnswer = attempt.body.answers.find(
      (answer: { examQuestionId: string }) =>
        answer.examQuestionId === examQuestions.find((q) => q.type === "ESSAY")?.id,
    );

    const res = await request(app.getHttpServer())
      .patch(`/v1/exams/attempts/${attemptId}/answers/${essayAnswer.id}`)
      .set(asAdmin())
      .send({ awardedHundredths: 400, feedback: "Good explanation. Give an example next time." })
      .expect(200);

    expect(res.body.status).toBe("MARKED");
    expect(res.body.needsReview).toBe(false);
    expect(res.body.autoScoreHundredths).toBe(300);
    expect(res.body.manualScoreHundredths).toBe(400);
    expect(res.body.totalScoreHundredths).toBe(700);
  });

  it("keeps another student out of an attempt that is not theirs", async () => {
    await request(app.getHttpServer()).get(`/v1/exams/${examId}/my-attempt`).set(asStudentB()).expect(404);

    const exam = await request(app.getHttpServer()).get(`/v1/exams/${examId}`).set(asAdmin()).expect(200);
    // The staff marking route is staff-only, whatever attempt id is held.
    await request(app.getHttpServer())
      .get(`/v1/exams/attempts/${exam.body.attempts[0].id}`)
      .set(asStudentB())
      .expect(403);
  });

  // ── Releasing ──────────────────────────────────────────────────────────

  it("releases the finished paper and writes the mark through to the gradebook", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/exams/${examId}/release`)
      .set(asAdmin())
      .expect(201);
    expect(res.body.released).toBe(1);

    // 7.00 out of 8.00 on the paper becomes 17.50 out of 20.00 in a
    // gradebook out of 20 — scaled, not copied.
    const marks = await request(app.getHttpServer())
      .get("/v1/data/results/export?format=csv")
      .set(asAdmin())
      .expect(200);

    const line = marks.text.split("\n").find((row: string) => row.includes("End of term exam"));
    expect(line).toContain("17.5");
  });

  it("shows the student their marks once released, but still not the answer key", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/exams/${examId}/my-attempt`)
      .set(asStudentA())
      .expect(200);

    expect(res.body.status).toBe("RELEASED");
    expect(res.body.totalScoreHundredths).toBe(700);
    expect(res.body.questions).toHaveLength(3);

    // Papers get reused; a student reviewing their own result must still
    // not walk away with the key.
    for (const question of res.body.questions) {
      expect("answer" in question).toBe(false);
    }
    const feedback = res.body.answers.map((answer: { feedback: string | null }) => answer.feedback);
    expect(feedback).toContain("Good explanation. Give an example next time.");
  });

  it("lets that student's own guardian see the released result", async () => {
    const list = await request(app.getHttpServer()).get("/v1/exams").set(asGuardianA()).expect(200);
    const exam = list.body.find((entry: { id: string }) => entry.id === examId);
    expect(exam.attempt.status).toBe("RELEASED");
    expect(exam.attempt.totalScoreHundredths).toBe(700);
  });

  it("shows another family nothing of that result", async () => {
    const list = await request(app.getHttpServer()).get("/v1/exams").set(asGuardianB()).expect(200);
    const exam = list.body.find((entry: { id: string }) => entry.id === examId);

    // Bob's father sees the paper exists for the class — Bob simply never
    // sat it — and nothing whatever of Ada's attempt.
    expect(exam.attempt).toBeNull();
    expect(JSON.stringify(list.body)).not.toContain("700");
  });

  it("marks a paper whose time ran out without the student submitting", async () => {
    // Student B never started; give them an attempt that has already
    // expired, the state a closed laptop leaves behind.
    const shortExam = await request(app.getHttpServer())
      .post("/v1/exams")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        title: "Timed test",
        academicYear: "2026-2027",
        term: "Term 1",
        durationMinutes: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/exams/${shortExam.body.id}/questions`)
      .set(asAdmin())
      .send({ questionIds: [mcqId] })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/exams/${shortExam.body.id}`)
      .set(asAdmin())
      .send({ status: "PUBLISHED" })
      .expect(200);

    const paper = await request(app.getHttpServer())
      .post(`/v1/exams/${shortExam.body.id}/sit`)
      .set(asStudentB())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/exams/${shortExam.body.id}/answers`)
      .set(asStudentB())
      .send({ examQuestionId: paper.body.questions[0].id, response: ["B"] })
      .expect(201);

    // Wind their deadline back rather than sleeping a minute in a test.
    // Straight into the school's own database with pg: going through the
    // API would need a route that lets someone move a running clock, which
    // is exactly the thing that must not exist.
    const schoolRow = await controlPrisma.school.findFirstOrThrow({ where: { slug: school.slug } });
    const adminUrl = new URL(process.env.POSTGRES_ADMIN_URL as string);
    adminUrl.pathname = `/${schoolRow.databaseName}`;

    const tenantDb = new PgClient({ connectionString: adminUrl.toString() });
    await tenantDb.connect();
    await tenantDb.query('UPDATE "exam_attempts" SET "expiresAt" = NOW() - INTERVAL \'1 minute\' WHERE "id" = $1', [
      paper.body.attemptId,
    ]);
    await tenantDb.end();

    const collected = await request(app.getHttpServer())
      .post(`/v1/exams/${shortExam.body.id}/collect`)
      .set(asAdmin())
      .expect(201);
    expect(collected.body.collected).toBe(1);

    // Their saved answer is marked rather than lost.
    const exam = await request(app.getHttpServer())
      .get(`/v1/exams/${shortExam.body.id}`)
      .set(asAdmin())
      .expect(200);
    expect(exam.body.attempts[0].status).toBe("SUBMITTED");
    expect(exam.body.attempts[0].autoSubmitted).toBe(true);
    expect(exam.body.attempts[0].totalScoreHundredths).toBe(200);
  });

  it("refuses to save an answer once the student's time is up", async () => {
    const exams = await request(app.getHttpServer()).get("/v1/exams").set(asAdmin()).expect(200);
    const timed = exams.body.find((entry: { title: string }) => entry.title === "Timed test");

    await request(app.getHttpServer())
      .post(`/v1/exams/${timed.id}/answers`)
      .set(asStudentB())
      .send({ examQuestionId: "anything", response: ["A"] })
      .expect(403);
  });
});
