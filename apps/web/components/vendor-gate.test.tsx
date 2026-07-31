import { render, screen } from "@testing-library/react";
import { RequireApprovedVendor } from "@/components/vendor-gate";
import { useAuthStore } from "@/store/auth-store";

jest.mock("next/navigation", () => ({ usePathname: () => "/vendor/products" }));

const vendorQuery = { data: undefined as unknown, isLoading: false, error: null as Error | null };

jest.mock("@/lib/use-vendor", () => ({
  useMyVendor: () => vendorQuery,
}));

function vendor(status: string) {
  return {
    id: "v1",
    storeName: "Wisdom Academy Press",
    slug: "wisdom-academy-press",
    status,
    commissionPct: "10.00",
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

function renderGate() {
  // Plain children, matching how the pages use it. A render prop would build
  // but fail at static generation: these pages are Server Components, and a
  // function cannot cross the server/client boundary.
  return render(
    <RequireApprovedVendor>
      <p>store dashboard</p>
    </RequireApprovedVendor>,
  );
}

describe("RequireApprovedVendor", () => {
  beforeEach(() => {
    vendorQuery.data = undefined;
    vendorQuery.isLoading = false;
    vendorQuery.error = null;
    useAuthStore.setState({
      accessToken: "token",
      user: { id: "u1", email: "seller@wisdomshop.example", roles: ["CUSTOMER", "VENDOR"] },
      status: "authenticated",
    });
  });

  it("renders the dashboard for an approved vendor", () => {
    vendorQuery.data = vendor("APPROVED");
    renderGate();
    expect(screen.getByText(/store dashboard/)).toBeInTheDocument();
  });

  it.each([
    ["PENDING", /still being reviewed/i],
    ["SUSPENDED", /suspended/i],
    ["REJECTED", /not approved/i],
  ])("withholds the dashboard when the account is %s", (status, expected) => {
    vendorQuery.data = vendor(status);
    renderGate();

    // Each state gets its own explanation: "we are still reviewing you" and
    // "you have been suspended" call for different responses from the reader.
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/store dashboard/)).not.toBeInTheDocument();
  });

  it("gates on vendor status, not on holding the VENDOR role", () => {
    // The API revokes the role on suspension, but a token minted beforehand
    // still carries it. Gating on the role would show screens whose every
    // request then 403s.
    useAuthStore.setState({
      accessToken: "token",
      user: { id: "u1", email: "seller@wisdomshop.example", roles: ["CUSTOMER", "VENDOR"] },
      status: "authenticated",
    });
    vendorQuery.data = vendor("SUSPENDED");
    renderGate();

    expect(screen.queryByText(/store dashboard/)).not.toBeInTheDocument();
  });

  it("points someone with no vendor account at the application", () => {
    vendorQuery.data = null;
    renderGate();
    expect(screen.getByText(/don't have a vendor account yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/store dashboard/)).not.toBeInTheDocument();
  });

  it("shows nothing but a loading note while the account is unknown", () => {
    vendorQuery.isLoading = true;
    renderGate();
    // A flash of the dashboard before the status resolves would show a
    // suspended vendor their store for a moment.
    expect(screen.queryByText(/store dashboard/)).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("does not render the dashboard to a signed-out visitor", () => {
    useAuthStore.setState({ accessToken: null, user: null, status: "unauthenticated" });
    vendorQuery.data = vendor("APPROVED");
    renderGate();

    expect(screen.queryByText(/store dashboard/)).not.toBeInTheDocument();
  });
});
