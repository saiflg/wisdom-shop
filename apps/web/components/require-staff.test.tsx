import { render, screen } from "@testing-library/react";
import { RequireStaff, AdminNav } from "@/components/require-staff";
import { useAuthStore } from "@/store/auth-store";

jest.mock("next/navigation", () => ({ usePathname: () => "/admin/orders" }));

function signIn(roles: string[]) {
  useAuthStore.setState({
    accessToken: "token",
    user: { id: "u1", email: "someone@wisdomshop.example", roles },
    status: "authenticated",
  });
}

describe("RequireStaff", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, status: "idle" });
  });

  it("shows nothing but a loading note before the session is known", () => {
    render(
      <RequireStaff>
        <p>secret dashboard</p>
      </RequireStaff>,
    );
    // Critically, the children must not render during "idle" — a flash of the
    // admin UI before the session resolves is the bug this guards against.
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in", () => {
    useAuthStore.setState({ status: "unauthenticated" });
    render(
      <RequireStaff>
        <p>secret dashboard</p>
      </RequireStaff>,
    );
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to continue/i)).toBeInTheDocument();
  });

  it("refuses a signed-in customer", () => {
    signIn(["CUSTOMER"]);
    render(
      <RequireStaff>
        <p>secret dashboard</p>
      </RequireStaff>,
    );
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("refuses a vendor, who is signed in but not staff", () => {
    // VENDOR is a real role with its own dashboard; it must not open the
    // platform admin area.
    signIn(["CUSTOMER", "VENDOR"]);
    render(
      <RequireStaff>
        <p>secret dashboard</p>
      </RequireStaff>,
    );
    expect(screen.queryByText("secret dashboard")).not.toBeInTheDocument();
  });

  it.each(["ADMIN", "SUPER_ADMIN", "MANAGER", "SUPPORT", "EDITOR"])(
    "admits %s",
    (role) => {
      signIn([role]);
      render(
        <RequireStaff>
          <p>secret dashboard</p>
        </RequireStaff>,
      );
      expect(screen.getByText("secret dashboard")).toBeInTheDocument();
    },
  );
});

describe("AdminNav", () => {
  it("marks the current page for assistive tech, not just visually", () => {
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
