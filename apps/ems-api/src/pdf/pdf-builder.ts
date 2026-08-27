import PDFDocument from "pdfkit";
import { columnWidths, fitText, paginate, type PageGeometry } from "./layout";

/**
 * A thin, opinionated wrapper over pdfkit.
 *
 * pdfkit's own cursor model makes it easy to write a table that overflows the
 * page silently, so tables here go through `table()`, which uses the tested
 * pagination in layout.ts rather than trusting the cursor. Everything a
 * school hands out is built from the same header, table and footer, so the
 * documents look like they came from one system.
 */

const MARGIN = 50;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export interface DocumentMeta {
  schoolName: string;
  /**
   * The school's address, contact line and motto, in that order — whatever
   * of them it has filled in. Absent for a school that has filled in none,
   * which prints exactly what it printed before: one line with its name.
   */
  schoolLines?: string[];
  title: string;
  subtitle?: string;
}

export interface TableColumn {
  header: string;
  field: string;
  /** Relative width. Defaults to 1. */
  weight?: number;
  align?: "left" | "right";
}

export type TableRow = Record<string, string>;

const GEOMETRY: PageGeometry = {
  contentHeight: A4_HEIGHT - MARGIN * 2,
  titleHeight: 96,
  tableHeaderHeight: 24,
  rowHeight: 20,
  footerHeight: 34,
};

export class PdfBuilder {
  private readonly doc: InstanceType<typeof PDFDocument>;
  private readonly chunks: Buffer[] = [];
  private readonly contentWidth = A4_WIDTH - MARGIN * 2;

  constructor(private readonly meta: DocumentMeta) {
    this.doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true });
    this.doc.on("data", (chunk: Buffer) => this.chunks.push(chunk));
    this.drawTitle();
  }

  private drawTitle() {
    this.doc.fontSize(10).fillColor("#64748b").text(this.meta.schoolName, MARGIN, MARGIN);

    // Set smaller than the name: these are the school's particulars, not a
    // second heading competing with the title underneath.
    for (const line of this.meta.schoolLines ?? []) {
      this.doc.fontSize(8).fillColor("#94a3b8").text(line, MARGIN);
    }

    this.doc
      .moveDown(0.4)
      .fontSize(20)
      .fillColor("#0f172a")
      .text(this.meta.title);

    if (this.meta.subtitle) {
      this.doc.moveDown(0.2).fontSize(11).fillColor("#475569").text(this.meta.subtitle);
    }

    this.doc.moveDown(0.8);
    const y = this.doc.y;
    this.doc
      .moveTo(MARGIN, y)
      .lineTo(A4_WIDTH - MARGIN, y)
      .strokeColor("#e2e8f0")
      .stroke();
    this.doc.moveDown(0.8);
  }

  /** A label/value block, for the summary above a report card or invoice. */
  facts(entries: { label: string; value: string }[]) {
    const columns = 2;
    const width = this.contentWidth / columns;
    const startY = this.doc.y;

    entries.forEach((entry, index) => {
      const x = MARGIN + (index % columns) * width;
      const y = startY + Math.floor(index / columns) * 34;
      this.doc.fontSize(9).fillColor("#64748b").text(entry.label, x, y, { width });
      this.doc.fontSize(12).fillColor("#0f172a").text(entry.value, x, y + 13, { width });
    });

    this.doc.y = startY + Math.ceil(entries.length / columns) * 34 + 10;
    this.doc.x = MARGIN;
  }

  /**
   * Draws a table, paginating with the tested arithmetic rather than
   * pdfkit's cursor.
   *
   * `emptyMessage` matters: a class list for a class with nobody in it should
   * say so on paper. A blank sheet reads as a broken export.
   */
  table(columns: TableColumn[], rows: TableRow[], emptyMessage = "Nothing to show.") {
    const widths = columnWidths(
      columns.map((column) => column.weight ?? 1),
      this.contentWidth,
    );

    if (rows.length === 0) {
      this.doc.fontSize(11).fillColor("#64748b").text(emptyMessage, MARGIN, this.doc.y);
      this.footer(1, 1);
      return;
    }

    const plan = paginate(rows.length, GEOMETRY);

    plan.pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) {
        this.doc.addPage();
        this.doc.y = MARGIN;
      }

      this.drawHeaderRow(columns, widths);

      for (let index = page.start; index < page.end; index += 1) {
        this.drawRow(columns, widths, rows[index] as TableRow, index % 2 === 1);
      }

      this.footer(pageIndex + 1, plan.pageCount);
    });
  }

  private drawHeaderRow(columns: TableColumn[], widths: number[]) {
    const y = this.doc.y;
    this.doc.fontSize(9).fillColor("#64748b");

    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index] as number;
      this.doc.text(column.header.toUpperCase(), x + 4, y + 6, {
        width: width - 8,
        align: column.align ?? "left",
      });
      x += width;
    });

    const lineY = y + GEOMETRY.tableHeaderHeight - 4;
    this.doc
      .moveTo(MARGIN, lineY)
      .lineTo(A4_WIDTH - MARGIN, lineY)
      .strokeColor("#cbd5e1")
      .stroke();

    this.doc.y = y + GEOMETRY.tableHeaderHeight;
  }

  private drawRow(columns: TableColumn[], widths: number[], row: TableRow, shaded: boolean) {
    const y = this.doc.y;

    if (shaded) {
      this.doc.rect(MARGIN, y, this.contentWidth, GEOMETRY.rowHeight).fill("#f8fafc");
    }

    this.doc.fontSize(10).fillColor("#0f172a");

    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index] as number;
      const raw = row[column.field] ?? "";
      // Measured in the font actually in use, so the fit is real rather than
      // an estimate.
      const text = fitText(raw, width - 8, (value) => this.doc.widthOfString(value));
      this.doc.text(text, x + 4, y + 5, { width: width - 8, align: column.align ?? "left" });
      x += width;
    });

    this.doc.y = y + GEOMETRY.rowHeight;
  }

  private footer(page: number, total: number) {
    const y = A4_HEIGHT - MARGIN + 6;
    this.doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(`${this.meta.schoolName} · page ${page} of ${total}`, MARGIN, y, {
        width: this.contentWidth,
        align: "center",
      });
  }

  /** Free text under the table, e.g. a teacher's remark. */
  note(label: string, value: string) {
    this.doc.moveDown(1.2);
    this.doc.fontSize(9).fillColor("#64748b").text(label, MARGIN, this.doc.y);
    this.doc.moveDown(0.2).fontSize(11).fillColor("#0f172a").text(value, { width: this.contentWidth });
  }

  async finish(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }
}
