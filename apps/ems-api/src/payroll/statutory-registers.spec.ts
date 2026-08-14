import {
  buildPensionRegister,
  buildTaxRegister,
  componentCents,
  payeHeading,
  pensionHeading,
  pensionRemittanceLines,
  type PensionSettingsLike,
  type RegisterPayslip,
} from "./statutory-registers";

function payslip(overrides: Partial<RegisterPayslip> = {}): RegisterPayslip {
  return {
    staffProfileId: "sp1",
    staffName: "Riliwanatu Muhammad Inuwa",
    pensionPin: "PEN100862927718",
    lines: [
      { label: "Salary", kind: "EARNING", amountCents: 50_000_00 },
      { label: "Tax", kind: "DEDUCTION", amountCents: 391_21 },
      { label: "Pension", kind: "DEDUCTION", amountCents: 500_00 },
    ],
    ...overrides,
  };
}

const settings = (overrides: Partial<PensionSettingsLike> = {}): PensionSettingsLike => ({
  providerName: "FCMB Pensions Ltd",
  remittanceBankName: "United Bank for Africa",
  remittanceAccountNumber: "1005385514",
  employerMatchPercent: 100,
  ...overrides,
});

describe("componentCents", () => {
  it("finds a deduction by label", () => {
    expect(componentCents(payslip(), "Tax")).toBe(391_21);
  });

  it("ignores case and stray spacing, as the source spreadsheets do", () => {
    expect(componentCents(payslip(), "  tax ")).toBe(391_21);
  });

  it("is zero for a component this person does not have", () => {
    expect(componentCents(payslip(), "Penalty")).toBe(0);
  });

  it("adds two lines sharing a label", () => {
    const two = payslip({
      lines: [
        { label: "Tax", kind: "DEDUCTION", amountCents: 100_00 },
        { label: "Tax", kind: "DEDUCTION", amountCents: 50_00 },
      ],
    });
    expect(componentCents(two, "Tax")).toBe(150_00);
  });
});

describe("buildTaxRegister", () => {
  it("lists everybody who paid tax, with a total", () => {
    const register = buildTaxRegister([
      payslip(),
      payslip({ staffProfileId: "sp2", staffName: "Hadiza Muhammad", lines: [
        { label: "Tax", kind: "DEDUCTION", amountCents: 256_13 },
      ] }),
    ]);

    expect(register.rows).toHaveLength(2);
    expect(register.totalCents).toBe(391_21 + 256_13);
  });

  it("EXCLUDES staff who paid no tax", () => {
    // A schedule listing forty staff with a zero against thirty of them
    // invites the tax office to ask about the thirty.
    const register = buildTaxRegister([
      payslip(),
      payslip({ staffProfileId: "sp2", staffName: "No Tax", lines: [] }),
    ]);

    expect(register.rows.map((r) => r.staffName)).toEqual(["Riliwanatu Muhammad Inuwa"]);
    expect(register.staffConsidered).toBe(2);
  });

  it("numbers its own rows from 1 rather than carrying the voucher's numbering", () => {
    // The source spreadsheet's tax sheet starts at voucher row 55. A schedule
    // beginning at 55 looks like the first 54 rows were lost.
    const register = buildTaxRegister([
      payslip({ staffProfileId: "a", staffName: "First", lines: [] }),
      payslip({ staffProfileId: "b", staffName: "Second" }),
      payslip({ staffProfileId: "c", staffName: "Third" }),
    ]);

    expect(register.rows.map((r) => r.serial)).toEqual([1, 2]);
    expect(register.rows[0].staffName).toBe("Second");
  });

  it("ignores a negative tax line rather than crediting somebody", () => {
    const register = buildTaxRegister([
      payslip({ lines: [{ label: "Tax", kind: "DEDUCTION", amountCents: -100_00 }] }),
    ]);
    expect(register.rows).toEqual([]);
  });

  it("honours a school that calls the component something else", () => {
    const register = buildTaxRegister(
      [payslip({ lines: [{ label: "PAYE", kind: "DEDUCTION", amountCents: 900_00 }] })],
      "PAYE",
    );
    expect(register.totalCents).toBe(900_00);
  });

  it("is empty, not broken, for a month nobody paid tax", () => {
    const register = buildTaxRegister([payslip({ lines: [] })]);
    expect(register.rows).toEqual([]);
    expect(register.totalCents).toBe(0);
  });
});

describe("buildPensionRegister", () => {
  it("matches the employer to the employee at 100 per cent", () => {
    // The arrangement in the source workbook: 500 employer, 500 employee.
    const register = buildPensionRegister([payslip()], settings());
    expect(register.rows[0]).toMatchObject({
      employeeCents: 500_00,
      employerCents: 500_00,
      totalCents: 1_000_00,
      pensionPin: "PEN100862927718",
    });
  });

  it("handles the statutory 10 against 8 as 125 per cent", () => {
    // Nigeria's Pension Reform Act: 8% employee, 10% employer. Expressing the
    // employer share as a percentage OF THE EMPLOYEE covers both arrangements
    // with one number.
    const register = buildPensionRegister(
      [payslip({ lines: [{ label: "Pension", kind: "DEDUCTION", amountCents: 8_000_00 }] })],
      settings({ employerMatchPercent: 125 }),
    );
    expect(register.rows[0].employerCents).toBe(10_000_00);
  });

  it("rounds a fractional employer share to whole minor units", () => {
    const register = buildPensionRegister(
      [payslip({ lines: [{ label: "Pension", kind: "DEDUCTION", amountCents: 333_33 }] })],
      settings({ employerMatchPercent: 125 }),
    );
    // 33333 * 1.25 = 41666.25
    expect(register.rows[0].employerCents).toBe(41_666);
    expect(Number.isInteger(register.rows[0].employerCents)).toBe(true);
  });

  it("supports a school that pays no employer share", () => {
    const register = buildPensionRegister([payslip()], settings({ employerMatchPercent: 0 }));
    expect(register.rows[0].employerCents).toBe(0);
    expect(register.rows[0].totalCents).toBe(500_00);
  });

  it("totals employer, employee and the sum separately", () => {
    const register = buildPensionRegister(
      [payslip(), payslip({ staffProfileId: "sp2", staffName: "Second" })],
      settings(),
    );
    expect(register.employeeTotalCents).toBe(1_000_00);
    expect(register.employerTotalCents).toBe(1_000_00);
    expect(register.totalCents).toBe(2_000_00);
  });

  it("excludes staff who contributed nothing", () => {
    const register = buildPensionRegister(
      [payslip(), payslip({ staffProfileId: "sp2", staffName: "Not enrolled", lines: [] })],
      settings(),
    );
    expect(register.rows).toHaveLength(1);
  });

  describe("a contribution with no PIN", () => {
    it("is INCLUDED rather than silently dropped", () => {
      // Dropping it would under-remit and leave a gap in somebody's pension
      // record that nobody notices for years.
      const register = buildPensionRegister([payslip({ pensionPin: null })], settings());
      expect(register.rows).toHaveLength(1);
      expect(register.totalCents).toBe(1_000_00);
    });

    it("is flagged so the school can fix it before filing", () => {
      const register = buildPensionRegister(
        [payslip(), payslip({ staffProfileId: "sp2", staffName: "No PIN", pensionPin: null })],
        settings(),
      );
      expect(register.missingPin.map((r) => r.staffName)).toEqual(["No PIN"]);
    });

    it("treats a blank PIN as missing", () => {
      const register = buildPensionRegister([payslip({ pensionPin: "   " })], settings());
      expect(register.missingPin).toHaveLength(1);
      expect(register.rows[0].pensionPin).toBeNull();
    });
  });

  it("is empty for a school with no pension scheme", () => {
    const register = buildPensionRegister([payslip({ lines: [] })], settings());
    expect(register.rows).toEqual([]);
    expect(register.missingPin).toEqual([]);
  });
});

describe("headings", () => {
  it("match the wording the school already files", () => {
    expect(payeHeading(2026, 7)).toBe("PAYE DEDUCTION FOR THE MONTH OF JULY, 2026");
    expect(pensionHeading(2026, 7)).toBe("SCHEDULE OF CONTRIBUTION FOR THE MONTH OF JULY, 2026");
  });

  it("does not invent a month for a bad number", () => {
    expect(payeHeading(2026, 13)).toContain("UNKNOWN");
  });
});

describe("pensionRemittanceLines", () => {
  it("names the administrator and the account", () => {
    expect(pensionRemittanceLines(settings())).toEqual([
      "NAME OF THE PFA; FCMB Pensions Ltd",
      "BANK NAME; United Bank for Africa, ACCOUNT; 1005385514",
    ]);
  });

  it("shows a visible gap rather than a confident blank", () => {
    // A schedule with no administrator named cannot be filed, and an empty
    // line looks like a formatting glitch rather than missing information.
    expect(
      pensionRemittanceLines(
        settings({ providerName: null, remittanceBankName: null, remittanceAccountNumber: null }),
      ),
    ).toEqual(["NAME OF THE PFA; (not set)", "BANK NAME; (not set)"]);
  });
});
