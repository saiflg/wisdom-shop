import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { getTenantContext } from "@/tenancy/tenant-context";
import { GradingService } from "@/grading/grading.service";
import { TimetableService } from "@/timetable/timetable.service";
import { formatPercent } from "@/grading/grading-math";
import { formatMoney } from "@/billing/billing-math";
import { formatMinute } from "@/timetable/timetable-rules";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { PdfBuilder } from "./pdf-builder";

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

const isStaff = (viewer: AuthenticatedUser) => viewer.roles.some((role) => STAFF_ROLES.includes(role));

/**
 * The documents a school prints and hands out.
 *
 * Every one of these goes through the *existing* service for its data —
 * `GradingService.reportCard`, `TimetableService.classTimetable` and so on —
 * rather than querying directly. Those services already enforce that a
 * guardian sees only their own child, and a second implementation of that
 * rule is a second chance to get it wrong. If the scoping is right in JSON
 * it is right on paper, because it is the same code.
 */
@Injectable()
export class PdfService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly grading: GradingService,
    private readonly timetable: TimetableService,
  ) {}

  private schoolName(): string {
    return getTenantContext()?.schoolSlug ?? "Wisdom Campus";
  }

  async reportCard(
    studentProfileId: string,
    academicYear: string,
    term: string,
    viewer: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; filename: string }> {
    // Scoping lives here, in the service a guardian already reads through.
    const result = await this.grading.reportCard(studentProfileId, academicYear, term, viewer);

    const student = result.studentProfile?.user;
    const name = student ? `${student.firstName} ${student.lastName}` : "Student";

    const pdf = new PdfBuilder({
      schoolName: this.schoolName(),
      title: "Report card",
      subtitle: `${name} · ${result.class?.name ?? ""} · ${term}, ${academicYear}`,
    });

    pdf.facts([
      { label: "Overall", value: formatPercent(result.overallPercentHundredths) },
      { label: "Subjects", value: String(result.subjects.length) },
      { label: "Published", value: result.publishedAt ? new Date(result.publishedAt).toDateString() : "—" },
      { label: "Published by", value: result.publishedByName ?? "—" },
    ]);

    pdf.table(
      [
        { header: "Subject", field: "subject", weight: 3 },
        { header: "Score", field: "score", weight: 1, align: "right" },
        { header: "Grade", field: "grade", weight: 1, align: "right" },
        { header: "Remark", field: "remark", weight: 2, align: "right" },
      ],
      result.subjects.map((subject) => ({
        subject: subject.subject?.name ?? "",
        score: formatPercent(subject.percentHundredths),
        grade: subject.gradeLabel,
        remark: subject.gradeRemark ?? "",
      })),
      "No subject results were published for this term.",
    );

    if (result.comment) pdf.note("Comment", result.comment);

    return {
      buffer: await pdf.finish(),
      filename: `report-card-${name.replace(/\s+/g, "-").toLowerCase()}-${term.replace(/\s+/g, "-")}.pdf`,
    };
  }

  async classList(classId: string, viewer: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    const client = await this.tenantPrisma.getClient();

    const klass = await client.class.findFirst({ where: { id: classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    // Staff only, checked here rather than borrowed.
    //
    // The first version reused TimetableService's class check, which was
    // wrong: that service answers "may this viewer see this class's
    // timetable", and a guardian legitimately may — it is their child's
    // week. A class *list* is a different question, because it is every
    // other family's children's names and admission numbers on one sheet.
    // Reusing scoping is right when the question is the same and a quiet
    // disclosure when it is not.
    if (!isStaff(viewer)) throw new NotFoundException("No class found with that id");

    const enrollments = await client.enrollment.findMany({
      where: { classId, status: "ACTIVE" },
      include: { studentProfile: { include: { user: true } } },
      orderBy: { studentProfile: { user: { lastName: "asc" } } },
    });

    const pdf = new PdfBuilder({
      schoolName: this.schoolName(),
      title: "Class list",
      subtitle: `${klass.name} · ${klass.academicYear} · ${enrollments.length} student(s)`,
    });

    pdf.table(
      [
        { header: "#", field: "index", weight: 0.5 },
        { header: "Admission number", field: "code", weight: 1.5 },
        { header: "Name", field: "name", weight: 3 },
      ],
      enrollments.map((enrollment, index) => {
        const user = enrollment.studentProfile.user;
        return {
          index: String(index + 1),
          code: enrollment.studentProfile.studentCode ?? "—",
          name: `${user.firstName} ${user.lastName}`,
        };
      }),
      "Nobody is enrolled in this class yet.",
    );

    return { buffer: await pdf.finish(), filename: `class-list-${klass.name.replace(/\s+/g, "-")}.pdf` };
  }

  async invoice(invoiceId: string, viewer: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    const client = await this.tenantPrisma.getClient();

    const invoice = await client.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: true,
        payments: true,
        studentProfile: { include: { user: true } },
      },
    });
    if (!invoice) throw new NotFoundException("No invoice found with that id");

    // A family may hold their own child's invoice and no one else's.
    if (!isStaff(viewer)) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      const own = await client.studentProfile.findUnique({
        where: { userId: viewer.id },
        select: { id: true },
      });
      const visible = new Set([...links.map((l) => l.studentProfileId), ...(own ? [own.id] : [])]);
      // 404 rather than 403 — "that invoice exists but isn't yours" is
      // itself a disclosure about another family.
      if (!visible.has(invoice.studentProfileId)) throw new NotFoundException("No invoice found with that id");
    }

    const settings = await client.financeSettings.findFirst();
    const currency = settings?.currency ?? "NGN";
    const student = invoice.studentProfile.user;

    const pdf = new PdfBuilder({
      schoolName: this.schoolName(),
      title: `Invoice ${invoice.invoiceNumber}`,
      subtitle: `${student.firstName} ${student.lastName} · ${invoice.academicYear} · ${invoice.term}`,
    });

    pdf.facts([
      { label: "Total", value: formatMoney(invoice.totalCents, currency) },
      { label: "Paid", value: formatMoney(invoice.paidCents, currency) },
      { label: "Balance", value: formatMoney(invoice.totalCents - invoice.paidCents, currency) },
      { label: "Status", value: invoice.status },
    ]);

    pdf.table(
      [
        { header: "Description", field: "description", weight: 3 },
        { header: "Amount", field: "amount", weight: 1, align: "right" },
      ],
      invoice.lines.map((line) => ({
        description: line.label,
        amount: formatMoney(line.amountCents, currency),
      })),
      "This invoice has no lines.",
    );

    return { buffer: await pdf.finish(), filename: `invoice-${invoice.invoiceNumber}.pdf` };
  }

  async classTimetable(classId: string, viewer: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    const entries = await this.timetable.classTimetable(classId, viewer);

    const client = await this.tenantPrisma.getClient();
    const klass = await client.class.findFirst({ where: { id: classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    const periods = await client.timetablePeriod.findMany({
      where: { deletedAt: null },
      orderBy: { startMinute: "asc" },
    });

    const pdf = new PdfBuilder({
      schoolName: this.schoolName(),
      title: "Timetable",
      subtitle: `${klass.name} · ${klass.academicYear}`,
    });

    // A week reads as a grid, so periods are rows and days are columns —
    // the same shape as the screen, which is the shape a parent expects.
    pdf.table(
      [
        { header: "Period", field: "period", weight: 1.4 },
        ...WEEKDAYS.map((day) => ({
          header: day.charAt(0) + day.slice(1).toLowerCase(),
          field: day,
          weight: 1,
        })),
      ],
      periods.map((period) => {
        const row: Record<string, string> = {
          period: `${period.label}\n${formatMinute(period.startMinute)}`,
        };
        for (const day of WEEKDAYS) {
          if (!period.isTeaching) {
            row[day] = period.label;
            continue;
          }
          const entry = entries.find((item) => item.weekday === day && item.periodId === period.id);
          row[day] = entry ? (entry.subject?.name ?? "") : "";
        }
        return row;
      }),
      "No periods have been set up yet.",
    );

    return { buffer: await pdf.finish(), filename: `timetable-${klass.name.replace(/\s+/g, "-")}.pdf` };
  }
}
