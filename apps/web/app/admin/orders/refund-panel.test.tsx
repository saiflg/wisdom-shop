import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefundPanel } from "@/app/admin/orders/refund-panel";
import { ApiError } from "@/lib/api";

const issueRefund = jest.fn();
let summary: Record<string, unknown>;

jest.mock("@/lib/use-admin", () => ({
  useOrderRefunds: () => ({ data: summary, isLoading: false, error: null }),
  useIssueRefund: () => ({ mutateAsync: issueRefund, isPending: false }),
}));

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: "WS-1",
    currency: "USD",
    status: "PAID",
    paidCents: 5000,
    refundedCents: 0,
    refundableCents: 5000,
    refundable: true,
    refunds: [],
    ...overrides,
  };
}

describe("RefundPanel", () => {
  beforeEach(() => {
    issueRefund.mockReset().mockResolvedValue({ id: "r1" });
    summary = buildSummary();
  });

  it("shows what was paid, refunded and still refundable", () => {
    summary = buildSummary({ refundedCents: 2000, refundableCents: 3000 });
    render(<RefundPanel orderNumber="WS-1" />);

    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });

  it("does not refund on the first click — it asks first", async () => {
    // The confirm step is the guard against a mistyped amount, so clicking
    // "Issue refund" must never move money on its own.
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.click(screen.getByRole("button", { name: /issue refund/i }));

    expect(issueRefund).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("states the amount in the confirmation, not just minor units", async () => {
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.type(screen.getByLabelText(/refund amount/i), "12.50");
    await user.click(screen.getByRole("button", { name: /issue refund/i }));

    expect(screen.getByText(/Refund \$12\.50 to the customer/)).toBeInTheDocument();
  });

  it("refunds the typed amount in minor units once confirmed", async () => {
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.type(screen.getByLabelText(/refund amount/i), "12.50");
    await user.type(screen.getByLabelText(/refund reason/i), "Damaged");
    await user.click(screen.getByRole("button", { name: /issue refund/i }));
    await user.click(screen.getByRole("button", { name: /yes, refund/i }));

    await waitFor(() => expect(issueRefund).toHaveBeenCalledTimes(1));
    expect(issueRefund).toHaveBeenCalledWith(
      expect.objectContaining({ orderNumber: "WS-1", amountCents: 1250, reason: "Damaged" }),
    );
  });

  it("sends no amount when the field is blank, meaning the full balance", async () => {
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.click(screen.getByRole("button", { name: /issue refund/i }));
    await user.click(screen.getByRole("button", { name: /yes, refund/i }));

    await waitFor(() => expect(issueRefund).toHaveBeenCalled());
    expect(issueRefund.mock.calls[0][0].amountCents).toBeUndefined();
  });

  it("always sends an idempotency key", async () => {
    // A double-submitted form must be one refund, and the server keys off this.
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.click(screen.getByRole("button", { name: /issue refund/i }));
    await user.click(screen.getByRole("button", { name: /yes, refund/i }));

    await waitFor(() => expect(issueRefund).toHaveBeenCalled());
    expect(issueRefund.mock.calls[0][0].idempotencyKey).toEqual(expect.any(String));
  });

  it("blocks an amount larger than what remains before asking the server", async () => {
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.type(screen.getByLabelText(/refund amount/i), "500.00");

    expect(screen.getByRole("button", { name: /issue refund/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/between 0 and \$50\.00/);
  });

  it("surfaces the server's explanation when a refund is declined", async () => {
    issueRefund.mockRejectedValue(new ApiError(409, "Transaction too old to refund"));
    const user = userEvent.setup();
    render(<RefundPanel orderNumber="WS-1" />);

    await user.click(screen.getByRole("button", { name: /issue refund/i }));
    await user.click(screen.getByRole("button", { name: /yes, refund/i }));

    expect(await screen.findByText(/too old to refund/i)).toBeInTheDocument();
  });

  it("offers no refund control on a fully refunded order", () => {
    summary = buildSummary({ refundedCents: 5000, refundableCents: 0, refundable: false, status: "REFUNDED" });
    render(<RefundPanel orderNumber="WS-1" />);

    expect(screen.queryByRole("button", { name: /issue refund/i })).not.toBeInTheDocument();
    expect(screen.getByText(/fully refunded/i)).toBeInTheDocument();
  });

  it("keeps failed attempts visible with their reason", () => {
    // "We tried and it was declined" is what support needs to be able to say.
    summary = buildSummary({
      refunds: [
        {
          id: "r1",
          status: "FAILED",
          amountCents: 5000,
          currency: "USD",
          reason: null,
          providerRef: null,
          failureReason: "Transaction too old",
          provider: "PAYSTACK",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    render(<RefundPanel orderNumber="WS-1" />);

    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("Transaction too old")).toBeInTheDocument();
  });
});
