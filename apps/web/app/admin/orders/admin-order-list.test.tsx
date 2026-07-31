import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminOrderList } from "@/app/admin/orders/admin-order-list";
import { ApiError } from "@/lib/api";

const updateStatus = jest.fn();

jest.mock("@/lib/use-admin", () => ({
  useAdminOrders: () => ({
    data: {
      data: [
        {
          id: "o1",
          orderNumber: "WS-20260731-ABC",
          status: "PAID",
          totalCents: 4200,
          currency: "USD",
          createdAt: "2026-07-31T00:00:00.000Z",
          carrier: null,
          trackingNumber: null,
          user: {
            id: "u1",
            email: "buyer@wisdomshop.example",
            firstName: "Buy",
            lastName: "Er",
          },
          items: [],
          statusHistory: [],
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
    error: null,
  }),
  useUpdateOrderStatus: () => ({ mutateAsync: updateStatus, isPending: false }),
}));

describe("AdminOrderList", () => {
  beforeEach(() => updateStatus.mockReset());

  it("does not offer to move an order to the status it already has", () => {
    render(<AdminOrderList />);
    // The order is PAID, so every other status is offered and PAID is not.
    expect(screen.queryByRole("button", { name: "paid" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "shipped" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "refunded" })).toBeInTheDocument();
  });

  it("shows the server's own explanation when a transition is refused", async () => {
    // The server owns the transition table and answers 409 with a reason.
    // Replacing that with a generic message would hide which move was
    // illegal and why.
    updateStatus.mockRejectedValue(
      new ApiError(409, "Cannot move a REFUNDED order to PROCESSING"),
    );

    render(<AdminOrderList />);
    await userEvent.click(screen.getByRole("button", { name: "processing" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Cannot move a REFUNDED order to PROCESSING",
      );
    });
  });

  it("falls back to a plain message when the failure is not from the API", async () => {
    updateStatus.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<AdminOrderList />);
    await userEvent.click(screen.getByRole("button", { name: "shipped" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't update that order/i);
    });
  });

  it("sends the order number and target status the button stands for", async () => {
    updateStatus.mockResolvedValue({});

    render(<AdminOrderList />);
    await userEvent.click(screen.getByRole("button", { name: "delivered" }));

    expect(updateStatus).toHaveBeenCalledWith({
      orderNumber: "WS-20260731-ABC",
      status: "DELIVERED",
    });
  });
});
