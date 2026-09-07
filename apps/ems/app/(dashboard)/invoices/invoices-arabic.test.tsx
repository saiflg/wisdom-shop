/**
 * Renders the invoices screen in Arabic and reads what it actually says.
 *
 * Companion to the homework one, and pointed at a different risk. This page
 * has a real invoice open in it, so the parts that only appear once there is
 * data to show are exercised too — the status badge, the balance line, and
 * the payment section, which is where a school that takes no card payments
 * tells a parent to go to the office.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import InvoicesPage from "./page";

const INVOICE = {
  id: "inv1",
  invoiceNumber: "INV-2026-0001",
  academicYear: "2026/2027",
  term: "Term 1",
  status: "ISSUED",
  currency: "NGN",
  totalCents: 5000000,
  paidCents: 0,
  balanceCents: 5000000,
  dueDate: "2026-10-01T00:00:00.000Z",
  studentProfile: { user: { firstName: "Fatima", lastName: "Bello" } },
  lines: [{ id: "l1", label: "Tuition", amountCents: 5000000 }],
  payments: [
    {
      id: "p1",
      amountCents: 1000000,
      method: "CASH",
      reference: null,
      receivedAt: "2026-09-02T00:00:00.000Z",
      recordedByName: "Amina Yusuf",
    },
  ],
  discounts: [],
};

jest.mock("@/lib/use-fees", () => ({
  FEE_PAYMENT_METHODS: ["CASH", "TRANSFER"],
  parseMoneyToCents: () => 0,
  useInvoices: () => ({
    data: {
      invoices: [INVOICE],
      summary: { invoiced: 5000000, collected: 0, outstanding: 5000000, currency: "NGN" },
    },
    isLoading: false,
  }),
  useRecordPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStartCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // No gateway configured: the branch that has to tell a parent, in their own
  // language, to pay at the office rather than showing a dead button.
  usePaymentOptions: () => ({ data: { options: [] }, isLoading: false }),
}));

jest.mock("@/components/invoice-discounts", () => ({
  InvoiceDiscounts: () => null,
}));
jest.mock("@/components/pdf-button", () => ({
  PdfButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <InvoicesPage />
    </I18nProvider>,
  );
}

describe("the invoices screen in Arabic", () => {
  it("shows the heading, the intro and the three money figures in Arabic", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "fees.invoices.title"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.intro"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.invoiced"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.collected"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.outstanding"))).toBeInTheDocument();
  });

  // The status badge builds its key at runtime as fees.status.${status}, so
  // no scan of the source can see it and no type error catches a missing one.
  // Every status is checked here for that reason.
  it.each(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID"] as const)(
    "has an Arabic word for the %s badge",
    (status) => {
      const word = translate("ar", `fees.status.${status}` as never);
      expect(word).toBeTruthy();
      expect(word).not.toMatch(/^fees\./);
    },
  );

  it("translates the status badge on a real invoice", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "fees.status.ISSUED"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.balance"))).toBeInTheDocument();
  });

  // What "Arabic numerals" actually means, asserted on a rendered page.
  // "ar" on its own resolves to the latn numbering system, so this passing
  // is the difference between asking for Arabic and getting it.
  it("writes the money in Arabic digits", () => {
    const { container } = renderArabic();
    const text = container.textContent ?? "";

    expect(text).toMatch(/[٠-٩]/);
    expect(text).toContain("٥٠٬٠٠٠٫٠٠");
    expect(text).not.toContain("50,000.00");
  });

  // Everything under the fold. The collapsed card is four figures and a
  // badge; the panel beneath it is the fee lines, the payment history and
  // the "pay online" section, none of which had ever been rendered.
  it("translates the detail panel when the invoice is opened", async () => {
    const user = userEvent.setup();
    renderArabic();

    await user.click(screen.getByRole("button", { name: /INV-2026-0001/ }));

    expect(screen.getByText(translate("ar", "fees.invoices.lines"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "fees.invoices.total"))).toBeInTheDocument();
    // No gateway is configured, so a parent is told to pay the office
    // rather than shown a button that cannot work.
    expect(screen.getByText(translate("ar", "invoices.noOnlinePayment"))).toBeInTheDocument();
  });

  it("keeps the opened panel free of English and Latin digits", async () => {
    const user = userEvent.setup();
    const { container } = renderArabic();

    await user.click(screen.getByRole("button", { name: /INV-2026-0001/ }));

    const text = (container.textContent ?? "")
      .replace(/INV-[\d-]+/g, " ")
      .replace(/Fatima Bello|Amina Yusuf|Tuition/g, " ")
      .replace(/2026\/2027|Term \d+/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
    // Every remaining figure - line amounts, the total, the payment - in
    // the reader's digits, not just the ones on the collapsed card.
    expect(text).not.toMatch(/\d{1,3},\d{3}/);
  });

  it("leaves no English sentence on the screen", () => {
    const { container } = renderArabic();

    // Latin runs that are data rather than language: the invoice number, the
    // academic year, the child's name and the term a school typed. Everything
    // else that reads as a sentence should have been translated.
    const text = (container.textContent ?? "")
      .replace(/INV-[\d-]+/g, " ")
      .replace(/Fatima Bello/g, " ")
      .replace(/Term \d+/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });
});
