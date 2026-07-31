import { apiFetch } from "@/lib/api";
import { refreshSession } from "@/lib/refresh-session";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe("refreshSession", () => {
  beforeEach(() => mockApiFetch.mockReset());

  /**
   * The regression this exists for.
   *
   * Refresh tokens rotate and reuse is treated as theft — the API revokes
   * every session for the user. React StrictMode double-invokes effects, so
   * SessionBootstrap fired two concurrent refreshes on every page load and
   * the second one presented a token the first had already retired. Loading a
   * page signed you out.
   */
  it("collapses concurrent callers into a single request", async () => {
    let resolve!: (value: { accessToken: string }) => void;
    mockApiFetch.mockReturnValue(
      new Promise<{ accessToken: string }>((r) => {
        resolve = r;
      }) as never,
    );

    const first = refreshSession();
    const second = refreshSession();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    resolve({ accessToken: "token" });
    await expect(first).resolves.toEqual({ accessToken: "token" });
    // Both callers get the same result rather than one racing the other.
    await expect(second).resolves.toEqual({ accessToken: "token" });
  });

  it("allows a genuinely later refresh once the first has settled", async () => {
    mockApiFetch.mockResolvedValue({ accessToken: "one" } as never);
    await refreshSession();

    mockApiFetch.mockResolvedValue({ accessToken: "two" } as never);
    await expect(refreshSession()).resolves.toEqual({ accessToken: "two" });

    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure for every later caller", async () => {
    mockApiFetch.mockRejectedValue(new Error("no cookie"));
    await expect(refreshSession()).rejects.toThrow("no cookie");

    // A signed-out visitor whose first refresh failed must still be able to
    // sign in and refresh later in the same page session.
    mockApiFetch.mockResolvedValue({ accessToken: "after-login" } as never);
    await expect(refreshSession()).resolves.toEqual({ accessToken: "after-login" });
  });
});
