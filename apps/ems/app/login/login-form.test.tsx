import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/login-form";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const SCHOOL_SLUG = "demo-academy";
const EMAIL = "admin@demo-academy.example";
const PASSWORD = "ChangeMe123!SuperSecret";

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/school identifier/i), SCHOOL_SLUG);
  await userEvent.type(screen.getByLabelText(/^email$/i), EMAIL);
  await userEvent.type(screen.getByLabelText(/^password$/i), PASSWORD);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    useAuthStore.setState({ accessToken: null, user: null, status: "idle" });
  });

  /** Same regression class the shop's own login-form.test.tsx guards against: FormField must forward refs, or typed input never reaches the submitted body. */
  it("submits what the user actually typed, including the school identifier", async () => {
    mockApiFetch.mockResolvedValue({
      accessToken: "token",
      user: { id: "u1", schoolId: "s1", schoolSlug: SCHOOL_SLUG, roles: ["SCHOOL_ADMIN"] },
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/v1/auth/login",
      expect.objectContaining({ body: { schoolSlug: SCHOOL_SLUG, email: EMAIL, password: PASSWORD } }),
    );
  });

  it("sets the session on success", async () => {
    mockApiFetch.mockResolvedValue({
      accessToken: "token",
      user: { id: "u1", schoolId: "s1", schoolSlug: SCHOOL_SLUG, roles: ["SCHOOL_ADMIN"] },
    } as never);

    render(<LoginForm />);
    await fillAndSubmit();

    await waitFor(() => expect(useAuthStore.getState().status).toBe("authenticated"));
    expect(useAuthStore.getState().user?.schoolSlug).toBe(SCHOOL_SLUG);
  });

  it("shows an error message on invalid credentials", async () => {
    const { ApiError } = jest.requireActual("@/lib/api");
    mockApiFetch.mockRejectedValue(new ApiError(401, "Invalid school, email or password"));

    render(<LoginForm />);
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect school, email or password/i);
  });
});
