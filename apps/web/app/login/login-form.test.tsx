import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/login-form";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const EMAIL = "superadmin@wisdomshop.example";
const PASSWORD = "ChangeMe123!SuperSecret";

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/email/i), EMAIL);
  await userEvent.type(screen.getByLabelText(/password/i), PASSWORD);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    useAuthStore.setState({ accessToken: null, user: null, status: "idle" });
  });

  /**
   * The regression this file exists for.
   *
   * `FormField` was a plain function component while every caller spread
   * react-hook-form's `register(...)` — including its `ref` — onto it. React
   * drops refs on non-forwardRef components, so the inputs were never
   * registered: typing a full email and password still submitted an empty
   * form, and the user saw "required" under fields that plainly had text in
   * them. Nothing else caught it — the build, lint, typecheck and every
   * other test passed, because none of them typed into a form.
   */
  it("submits what the user actually typed", async () => {
    mockApiFetch.mockResolvedValue({
      twoFactorRequired: false,
      accessToken: "token",
      user: { id: "u1", email: EMAIL, roles: ["SUPER_ADMIN"] },
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/v1/auth/login",
      expect.objectContaining({ body: { email: EMAIL, password: PASSWORD } }),
    );
  });

  it("does not report a filled-in field as required", async () => {
    mockApiFetch.mockResolvedValue({
      twoFactorRequired: false,
      accessToken: "token",
      user: { id: "u1", email: EMAIL, roles: ["SUPER_ADMIN"] },
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
  });

  it("stores the session on success", async () => {
    mockApiFetch.mockResolvedValue({
      twoFactorRequired: false,
      accessToken: "the-access-token",
      user: { id: "u1", email: EMAIL, roles: ["SUPER_ADMIN"] },
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(useAuthStore.getState().status).toBe("authenticated"));
    expect(useAuthStore.getState().accessToken).toBe("the-access-token");
    expect(useAuthStore.getState().user?.roles).toContain("SUPER_ADMIN");
  });

  it("still validates genuinely empty fields", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // The required check must survive the fix — it just has to be true.
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("switches to the 2FA step instead of signing in", async () => {
    mockApiFetch.mockResolvedValue({
      twoFactorRequired: true,
      challengeToken: "challenge",
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
    expect(useAuthStore.getState().status).not.toBe("authenticated");
  });

  it("tells a locked-out user how long to wait", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError(403, "Too many failed sign-in attempts. Try again in 60 seconds."),
    );

    render(<LoginForm />);
    await fillAndSubmit();

    expect(await screen.findByText(/try again in 60 seconds/i)).toBeInTheDocument();
  });
});
