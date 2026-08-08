import { Injectable } from "@nestjs/common";
import { PdfBuilder } from "@/pdf/pdf-builder";
import { formatPayPeriod, type PayslipLine } from "./payroll-math";

interface PayslipForPdf {
  id: string;
  staffName: string;
  staffNumber: string | null;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  lines: unknown;
  accountNumberMasked: string | null;
  run: { year: number; month: number };
  staffProfile: { jobTitle: string | null; bankName: string | null };
}

function money(cents: number): string {
  // Grouped and two-decimal, because a payslip is read by a person rather
  // than a machine. Derived from the integer, never stored as one.
  return (cents / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

@Injectable()
export class PayslipPdfService {
  /**
   * A printable payslip.
   *
   * The account number appears masked. A payslip is a document that gets
   * printed, handed over and left on desks — the full number belongs only in
   * the bank transfer file, which is audited.
   */
  async render(payslip: PayslipForPdf): Promise<Buffer> {
    const period = formatPayPeriod(payslip.run.year, payslip.run.month);
    const lines = (Array.isArray(payslip.lines) ? payslip.lines : []) as PayslipLine[];

    const builder = new PdfBuilder({
      schoolName: "Payslip",
      title: payslip.staffName,
      subtitle: period,
    });

    builder.facts([
      { label: "Staff number", value: payslip.staffNumber ?? "—" },
      { label: "Job title", value: payslip.staffProfile.jobTitle ?? "—" },
      { label: "Bank", value: payslip.staffProfile.bankName ?? "—" },
      { label: "Account", value: payslip.accountNumberMasked ?? "Not on file" },
    ]);

    builder.table(
      [
        { header: "Item", field: "label", weight: 3 },
        { header: "Type", field: "kind", weight: 1 },
        { header: "Amount", field: "amount", weight: 1, align: "right" },
      ],
      lines.map((line) => ({
        label: line.label,
        kind: line.kind === "EARNING" ? "Earning" : "Deduction",
        amount: money(line.amountCents),
      })),
      "No salary components were recorded for this month.",
    );

    builder.note("Gross pay", money(payslip.grossCents));
    builder.note("Total deductions", money(payslip.deductionsCents));
    builder.note("Net pay", money(payslip.netCents));

    if (payslip.deductionsCents > payslip.grossCents) {
      // Said plainly on the document rather than left as a silent zero, since
      // this is the payslip somebody will bring to the bursar to ask about.
      builder.note(
        "Please note",
        "Deductions came to more than gross pay this month, so net pay is shown as zero. Ask the school office.",
      );
    }

    return builder.finish();
  }
}
