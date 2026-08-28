import ExcelJS from "exceljs";

/**
 * Reading and writing the files schools actually hand each other.
 *
 * Two rules run through all of this:
 *
 * **Everything is text.** An admission number of "007" is not seven, and an
 * account number of "0123456789" is not 123456789. Excel will happily turn
 * both into numbers and drop the leading zero, which silently mis-identifies
 * a child or misdirects a salary. Cells are read as their displayed string
 * and written as explicit text.
 *
 * **Formulas are never evaluated.** An uploaded file is untrusted input; a
 * cell containing a formula is read as whatever value it carries, not
 * executed.
 */

export type SheetFormat = "xlsx" | "csv";

/**
 * exceljs declares `xlsx.load(data: Buffer)` against the pre-generic Buffer,
 * while @types/node now models it as `Buffer<ArrayBufferLike>`. The two are
 * the same object at runtime — this is a disagreement between two type
 * packages, not a real mismatch — so the conversion is confined to this one
 * function rather than smeared across the call sites as casts.
 */
type ExcelBuffer = Parameters<ExcelJS.Xlsx["load"]>[0];
const asExcelBuffer = (buffer: Buffer): ExcelBuffer => buffer as unknown as ExcelBuffer;

export interface SheetData {
  headers: string[];
  rows: string[][];
}

/** How many rows we are willing to take in one upload. */
export const MAX_IMPORT_ROWS = 5000;

/**
 * Renders a cell as the string a person would see in the spreadsheet.
 *
 * Dates are the awkward case: Excel stores them as numbers and exceljs hands
 * back a Date, so they are rendered as ISO rather than whatever the local
 * locale would produce — the import engine only accepts ISO precisely
 * because every other format is ambiguous.
 */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // Formula cells, rich text and hyperlinks all arrive as objects. Take the
    // value they display, never the formula itself.
    if ("result" in value && value.result !== undefined) return cellToText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

export async function parseSheet(buffer: Buffer, format: SheetFormat): Promise<SheetData> {
  const workbook = new ExcelJS.Workbook();

  if (format === "csv") {
    // exceljs's csv reader takes a stream; a Readable over the buffer keeps
    // this in memory rather than writing a temp file.
    const { Readable } = await import("node:stream");
    // The identity `map` is essential, not tidying. By default exceljs
    // coerces csv cells — "007" comes back as the number 7 and "2026-03-04"
    // as a Date. Either would corrupt the identifiers import matches on, and
    // a csv exported from here would not survive being re-imported.
    await workbook.csv.read(Readable.from(buffer), { map: (value: unknown) => value });
  } else {
    await workbook.xlsx.load(asExcelBuffer(buffer));
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToText(cell.value);
  });

  const rows: string[][] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    if (rows.length >= MAX_IMPORT_ROWS) break;
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    for (let column = 0; column < headers.length; column += 1) {
      cells[column] = cellToText(row.getCell(column + 1).value);
    }
    rows.push(cells);
  }

  return { headers: headers.map((header) => header ?? ""), rows };
}

export interface ExportColumn {
  header: string;
  field: string;
}

export async function buildSheet(
  columns: ExportColumn[],
  rows: Record<string, string | null | undefined>[],
  format: SheetFormat,
  sheetName = "Export",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // csv.writeBuffer only looks at the first sheet, so the name matters only
  // for xlsx. 31 characters is Excel's hard limit on sheet names.
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  sheet.addRow(columns.map((column) => column.header));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const added = sheet.addRow(columns.map((column) => row[column.field] ?? ""));
    // Force text so Excel does not helpfully turn "007" into 7 when the file
    // is opened, which would corrupt the very identifiers import matches on.
    added.eachCell((cell) => {
      cell.numFmt = "@";
    });
  }

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(14, Math.min(40, column.header.length + 6));
  });

  const buffer = format === "csv" ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export interface WorkbookSheet {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, string | null | undefined>[];
}

/**
 * One xlsx file with a sheet per entity.
 *
 * For the backup screen: a school downloading its own records should get one
 * file, not five. xlsx only — csv has no concept of a second sheet, and
 * silently writing only the first would hand somebody a "backup" containing
 * their students and none of their staff.
 *
 * Same text formatting as buildSheet, for the same reason: Excel turning
 * "007" into 7 corrupts the identifiers an import would later match on.
 */
export async function buildWorkbook(sheets: WorkbookSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31));
    sheet.addRow(spec.columns.map((column) => column.header));
    sheet.getRow(1).font = { bold: true };

    for (const row of spec.rows) {
      const added = sheet.addRow(spec.columns.map((column) => row[column.field] ?? ""));
      added.eachCell((cell) => {
        cell.numFmt = "@";
      });
    }

    spec.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = Math.max(14, Math.min(40, column.header.length + 6));
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

export function formatFromFilename(filename: string): SheetFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  // .xls is the old binary format, which exceljs cannot read. Saying so is
  // more use than "could not parse file".
  return null;
}
