import { render as renderBare, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/login-form";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

/*
 * The form reads its labels and its validation messages from the dictionary
 * now, so it needs the provider the app always gives it. Rendering it bare
 * threw "useTranslation must be used inside <I18nProvider>" — a test harness
 * gap, not a component fault.
 *
 * No locale is set, so this exercises the English the assertions below expect.
 */
const render = (ui: React.ReactElement) => renderBare(<I18nProvider>{ui}</I18nProvider>);


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

  describe("when the host already identifies the school", () => {
    it("stops asking for the school identifier", () => {
      render(<LoginForm defaultSchoolSlug={SCHOOL_SLUG} schoolKnown />);
      expect(screen.queryByLabelText(/school identifier/i)).not.toBeInTheDocument();
    });

    it("still sends the slug, because the API does not take the hostname's word for it", async () => {
      mockApiFetch.mockResolvedValue({
        accessToken: "token",
        user: { id: "u1", schoolId: "s1", schoolSlug: SCHOOL_SLUG, roles: ["SCHOOL_ADMIN"] },
      } as never);

      render(<LoginForm defaultSchoolSlug={SCHOOL_SLUG} schoolKnown />);
      await userEvent.type(screen.getByLabelText(/^email$/i), EMAIL);
      await userEvent.type(screen.getByLabelText(/^password$/i), PASSWORD);
      await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/auth/login",
        expect.objectContaining({ body: { schoolSlug: SCHOOL_SLUG, email: EMAIL, password: PASSWORD } }),
      );
    });

    it("goes on asking when the host resolved nothing, even with a slug to prefill", () => {
      render(<LoginForm defaultSchoolSlug={SCHOOL_SLUG} />);
      expect(screen.getByLabelText(/school identifier/i)).toHaveValue(SCHOOL_SLUG);
    });
  });

  it("shows an error message on invalid credentials", async () => {
    const { ApiError } = jest.requireActual("@/lib/api");
    mockApiFetch.mockRejectedValue(new ApiError(401, "Invalid school, email or password"));

    render(<LoginForm />);
    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect school, email or password/i);
  });
});
