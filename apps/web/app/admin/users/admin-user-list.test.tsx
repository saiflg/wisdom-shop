import { render, screen } from "@testing-library/react";
import { AdminUserList } from "@/app/admin/users/admin-user-list";
import { useAuthStore } from "@/store/auth-store";

const grantMutate = jest.fn();
const revokeMutate = jest.fn();

// The list now renders CreateUserForm, which reaches for react-query. Mocked
// so these tests stay about the role controls rather than needing a provider.
jest.mock("@/lib/use-settings", () => ({
  useCreateUser: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/lib/use-admin", () => ({
  useAdminUsers: () => ({
    data: {
      data: [
        {
          id: "u-target",
          email: "target@wisdomshop.example",
          firstName: "Tar",
          lastName: "Get",
          emailVerifiedAt: null,
          twoFactorEnabled: false,
          roles: ["CUSTOMER", "SUPPORT", "VENDOR"],
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
    isLoading: false,
    error: null,
  }),
  useGrantRole: () => ({ mutateAsync: grantMutate, isPending: false }),
  useRevokeRole: () => ({ mutateAsync: revokeMutate, isPending: false }),
}));

function signInAs(roles: string[]) {
  useAuthStore.setState({
    accessToken: "token",
    user: { id: "u-me", email: "me@wisdomshop.example", roles },
    status: "authenticated",
  });
}

const roleOptions = () =>
  screen
    .getAllByRole("option")
    .map((option) => (option as HTMLOptionElement).value);

describe("AdminUserList role controls", () => {
  it("hides admin-level roles from an ordinary admin", () => {
    // Mirrors the server, which refuses these with a 403. Offering them would
    // only produce buttons that always fail.
    signInAs(["ADMIN"]);
    render(<AdminUserList />);

    const options = roleOptions();
    expect(options).toContain("SUPPORT");
    expect(options).not.toContain("ADMIN");
    expect(options).not.toContain("SUPER_ADMIN");
    expect(options).not.toContain("DEVELOPER");
    expect(screen.getByText(/only a super admin/i)).toBeInTheDocument();
  });

  it("offers admin-level roles to a super admin", () => {
    signInAs(["SUPER_ADMIN"]);
    render(<AdminUserList />);

    const options = roleOptions();
    expect(options).toContain("ADMIN");
    expect(options).toContain("SUPER_ADMIN");
    expect(screen.queryByText(/only a super admin/i)).not.toBeInTheDocument();
  });

  it("never offers VENDOR, which follows vendor approval instead", () => {
    signInAs(["SUPER_ADMIN"]);
    render(<AdminUserList />);
    expect(roleOptions()).not.toContain("VENDOR");
  });

  it("offers no way to revoke CUSTOMER or VENDOR", () => {
    // CUSTOMER is everyone's baseline and VENDOR is derived from the vendor
    // record; the server rejects both, so no button should exist.
    signInAs(["SUPER_ADMIN"]);
    render(<AdminUserList />);

    expect(screen.getByRole("button", { name: /revoke SUPPORT/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revoke CUSTOMER/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revoke VENDOR/i })).not.toBeInTheDocument();
  });
});
