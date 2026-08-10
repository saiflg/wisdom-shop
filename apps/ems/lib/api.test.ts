import { ApiError, errorMessage } from "./api";

describe("errorMessage", () => {
  it("prefers what the API actually said", () => {
    const error = new ApiError(404, "Demo Admin has no employment record yet.");
    expect(errorMessage(error, "Couldn't load this salary.")).toBe("Demo Admin has no employment record yet.");
  });

  it("reads a message off an object that is not our own error class", () => {
    // The reason this is duck-typed. `error instanceof ApiError` fails whenever
    // the thrown object came from a different copy of the api module, and the
    // symptom is a screen that says "Couldn't load this" while the response
    // body explains exactly what to do about it.
    expect(errorMessage({ message: "Something specific" }, "fallback")).toBe("Something specific");
    expect(errorMessage(new Error("Failed to fetch"), "fallback")).toBe("Failed to fetch");
  });

  it("falls back when there is genuinely nothing to say", () => {
    expect(errorMessage(null, "fallback")).toBe("fallback");
    expect(errorMessage(undefined, "fallback")).toBe("fallback");
    expect(errorMessage("a bare string", "fallback")).toBe("fallback");
    expect(errorMessage({ status: 500 }, "fallback")).toBe("fallback");
  });

  it("does not show an empty message as if it were one", () => {
    expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(errorMessage({ message: "   " }, "fallback")).toBe("fallback");
  });

  it("ignores a message that is not a string", () => {
    expect(errorMessage({ message: { nested: "object" } }, "fallback")).toBe("fallback");
  });
});
