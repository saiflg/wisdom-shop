/**
 * Renders the payroll screen in Arabic, with one run in the list.
 *
 * This page is where the hardcoded-text guard was shown to have a hole. Four
 * strings sat in places none of its patterns reach — a raw enum printed with
 * .toLowerCase(), two words welded between interpolations, and a phrase in a
 * template literal — so the file passed every check while the screen said
 * "3 staff · net 450,000 · paid by Amina Yusuf · approved" in the middle of
 * an Arabic page. The month dropdown was worse: it took its names from the
 * operating system rather than the reader's choice.
 */

import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import PayrollPage from "./page";

const RUN = {
  id: "run1",
  period: "2026-09",
  status: "APPROVED",
  paidByName: null,
  summary: { staffCount: 3, netCents: 45000000, grossCents: 60000000, deductionsCents: 15000000 },
};

jest.mock("@/lib/use-payroll", () => ({
  downloadPayslipPdf: jest.fn(),
  downloadTransferFile: jest.fn(),
  useApproveRun: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreatePayrollRun: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkRunPaid: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePayrollRun: () => ({ data: null, isLoading: false }),
  usePayrollRuns: () => ({ data: [RUN], isLoading: false, error: null }),
  useRefreshRun: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/lib/use-staff", () => ({ useStaff: () => ({ data: [], isLoading: false }) }));
jest.mock("@/lib/api-auth", () => ({ useAuthQueryState: () => ({ accessToken: "t", enabled: true }) }));
jest.mock("@/components/salary-editor", () => ({ SalaryEditor: () => null }));
jest.mock("@/components/payroll-checklist", () => ({
  ChecklistWarning: () => null,
  PayrollChecklist: () => null,
}));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <PayrollPage />
    </I18nProvider>,
  );
}

describe("the payroll screen in Arabic", () => {
  it("shows the heading and the intro in Arabic", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "payroll.title"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "payroll.intro"))).toBeInTheDocument();
  });

  it("translates the run status badge rather than printing the enum", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "payroll.statusAPPROVED"))).toBeInTheDocument();
    expect(screen.queryByText("approved")).not.toBeInTheDocument();
  });

  it("names the months in the reader's language, not the operating system's", () => {
    renderArabic();

    // The dropdown used toLocaleString(undefined, …), which asks the host
    // environment. On an Arabic portal running on an English machine that
    // produced an Arabic page with January in it.
    const september = new Date(2000, 8, 1).toLocaleString("ar", { month: "long" });
    expect(screen.getByRole("option", { name: september })).toBeInTheDocument();
  });

  // Both halves of the summary line, which is where the two number paths
  // meet: the count comes through a plural placeholder and the amount
  // through the money formatter. Before this they disagreed, and the row
  // read "3 موظفين · الصافي ٤٥٠٬٠٠٠٫٠٠" - one Latin digit, one Arabic.
  it("writes the count and the amount in the same digits", () => {
    const { container } = renderArabic();
    const text = container.textContent ?? "";

    expect(text).toContain("٣");
    expect(text).toContain("٤٥٠٬٠٠٠٫٠٠");
    expect(text).not.toMatch(/3 /);
  });

  it("leaves no English sentence on the screen", () => {
    const { container } = renderArabic();

    // 2026-09 is the run's period, a date the API formats.
    const text = (container.textContent ?? "").replace(/2026-09/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });
});
