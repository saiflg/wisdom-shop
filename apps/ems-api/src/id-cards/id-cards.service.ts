import { BadRequestException, Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { StorageService } from "@/storage/storage.service";
import { SchoolProfileService } from "@/school-profile/school-profile.service";
import { buildCard, cardProblem, CARDS_PER_SHEET, slotsFor, type CardStudent } from "./id-card-rules";

const CARD_WIDTH = 240;
const CARD_HEIGHT = 150;
const PHOTO = 56;

@Injectable()
export class IdCardsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly storage: StorageService,
    private readonly profile: SchoolProfileService,
  ) {}

  /**
   * Printable cards for a class, as one PDF.
   *
   * Rendered on the server, with each photograph read from storage and
   * embedded in the document. That is the point rather than an implementation
   * detail: a web page version would need every child's photograph at a URL a
   * browser could fetch, and a photograph of a child at an address that can
   * be shared, guessed, cached by a proxy or left in a browser history is
   * exactly what must not exist. Here the bytes go into an authenticated
   * response and nowhere else.
   */
  async forClass(classId: string): Promise<{ buffer: Buffer; filename: string; count: number }> {
    const client = await this.tenantPrisma.getClient();

    const schoolClass = await client.class.findFirst({
      where: { id: classId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!schoolClass) throw new BadRequestException("No class found with that id");

    const enrollments = await client.enrollment.findMany({
      where: { classId },
      select: {
        studentProfile: {
          select: {
            studentCode: true,
            user: { select: { firstName: true, lastName: true, photoKey: true } },
          },
        },
      },
    });

    const students: CardStudent[] = enrollments
      .map((enrollment) => ({
        name: `${enrollment.studentProfile.user.firstName} ${enrollment.studentProfile.user.lastName}`.trim(),
        studentCode: enrollment.studentProfile.studentCode,
        className: schoolClass.name,
        photoKey: enrollment.studentProfile.user.photoKey,
      }))
      // A child with no name recorded is a data problem, not a card. Skipped
      // rather than printed blank, and the count returned says how many were
      // actually produced.
      .filter((student) => cardProblem(student) === null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const [schoolName, ...profileLines] = await this.profile.documentHeader();
    const school = {
      name: schoolName ?? "School",
      // The header's contact line, if the school filled one in.
      phone: profileLines[1] ?? null,
      address: profileLines[0] ?? null,
    };

    const buffer = await this.render(students, school);
    return { buffer, filename: `id-cards-${schoolClass.name.replace(/\s+/g, "-")}.pdf`, count: students.length };
  }

  private async render(
    students: CardStudent[],
    school: { name: string; phone: string | null; address: string | null },
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const slots = slotsFor(students.length);

    for (let index = 0; index < students.length; index += 1) {
      const student = students[index]!;
      const slot = slots[index]!;
      if (index > 0 && index % CARDS_PER_SHEET === 0) doc.addPage();

      const card = buildCard(student, school);
      const { x, y } = slot;

      doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 8).strokeColor("#cbd5e1").stroke();

      // The photograph, read straight from storage into the document.
      if (student.photoKey) {
        try {
          const bytes = await this.storage.readBuffer(student.photoKey);
          doc.image(bytes, x + 12, y + 12, { width: PHOTO, height: PHOTO, fit: [PHOTO, PHOTO] });
        } catch {
          // A missing file must not stop the other twenty-nine cards
          // printing. The card simply has no picture, which cardProblem
          // already treats as acceptable.
          doc.rect(x + 12, y + 12, PHOTO, PHOTO).strokeColor("#e2e8f0").stroke();
        }
      } else {
        doc.rect(x + 12, y + 12, PHOTO, PHOTO).strokeColor("#e2e8f0").stroke();
      }

      const textX = x + 12 + PHOTO + 12;
      doc.fontSize(12).fillColor("#0f172a").text(card.name, textX, y + 14, { width: CARD_WIDTH - PHOTO - 40 });

      let lineY = y + 32;
      for (const line of card.lines) {
        doc.fontSize(8).fillColor("#475569").text(line, textX, lineY, { width: CARD_WIDTH - PHOTO - 40 });
        lineY += 12;
      }

      doc
        .fontSize(6)
        .fillColor("#94a3b8")
        .text(card.ifFound, x + 12, y + CARD_HEIGHT - 20, { width: CARD_WIDTH - 24 });
    }

    if (students.length === 0) {
      doc.fontSize(12).fillColor("#475569").text("No children in that class have a name recorded.", 40, 40);
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }
}
