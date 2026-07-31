import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AdminOverview } from "@/app/admin/admin-overview";
import { useAuthStore } from "@/store/auth-store";
import { apiFetch } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function summary(overrides: Record<string, unknown> = {}) {
  return {
    revenue: {
      currencies: ["USD"],
      settledGrossCents: 250_000,
      settledOrderCount: 10,
      averageOrderValueCents: 25_000,
      windowDays: 30,
      windowGrossCents: 100_000,
      windowOrderCount: 4,
      ...(overrides.revenue as object),
    },
    orders: { pending: 3, refunded: 1, byStatus: { PAID: 8, PENDING: 3 } },
    catalog: { publishedProducts: 7 },
    customers: { total: 42 },
    vendors: { awaitingApproval: 2 },
    licenses: { active: 5 },
  };
}

const clients: QueryClient[] = [];

function renderOverview() {
  // gcTime 0 so no garbage-collection timer outlives the test — react-query's
  // five-minute default keeps the jest worker alive and produces the "failed
  // to exit gracefully" warning.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<AdminOverview />, { wrapper });
}

describe("AdminOverview", () => {
  afterEach(() => {
    while (clients.length > 0) clients.pop()?.clear();
  });

  beforeEach(() => {
    mockApiFetch.mockReset();
    useAuthStore.setState({
      accessToken: "token",
      user: { id: "u1", email: "admin@wisdomshop.example", roles: ["ADMIN"] },
      status: "authenticated",
    });
  });

  it("labels revenue with the currency the orders were actually in", async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("top-products")
          ? []
          : summary({ revenue: { currencies: ["EUR"], settledGrossCents: 250_000 } }),
      ) as never,
    );

    renderOverview();

    // Not "$2,500.00" — the money was euros. Hardcoding USD here was a real
    // bug: the dashboard stamped a dollar sign on whatever it was given.
    expect(await screen.findByText("€2,500.00")).toBeInTheDocument();
  });

  it("warns instead of picking a symbol when settled orders span currencies", async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("top-products") ? [] : summary({ revenue: { currencies: ["GBP", "USD"] } }),
      ) as never,
    );

    renderOverview();

    expect(await screen.findByText(/span GBP, USD/i)).toBeInTheDocument();
    // Adding different monies together gives a number, not an amount, so no
    // currency symbol should be shown at all.
    expect(screen.queryByText(/\$2,500\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/£2,500\.00/)).not.toBeInTheDocument();
  });

  it("falls back to USD without warning when nothing has settled yet", async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("top-products")
          ? []
          : summary({
              revenue: {
                currencies: [],
                settledGrossCents: 0,
                settledOrderCount: 0,
                averageOrderValueCents: 0,
                windowGrossCents: 0,
                windowOrderCount: 0,
              },
            }),
      ) as never,
    );

    renderOverview();

    expect(await screen.findByText(/settled revenue/i)).toBeInTheDocument();
    // An empty shop is not a mixed-currency shop.
    expect(screen.queryByText(/span/i)).not.toBeInTheDocument();
  });

  it("shows the headline counts", async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.includes("top-products") ? [] : summary()) as never,
    );

    renderOverview();

    expect(await screen.findByText("42")).toBeInTheDocument(); // customers
    expect(screen.getByText("7")).toBeInTheDocument(); // published products
    expect(screen.getByText("2")).toBeInTheDocument(); // vendors awaiting approval
  });

  it("reports a failure instead of rendering an empty dashboard", async () => {
    mockApiFetch.mockRejectedValue(new Error("Forbidden"));

    renderOverview();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load analytics/i);
  });

  it("does not fetch at all without an access token", () => {
    useAuthStore.setState({ accessToken: null, user: null, status: "unauthenticated" });
    renderOverview();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
