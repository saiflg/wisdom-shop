import {
  availableTransitions,
  canRead,
  checkTransition,
  summariseWelfare,
  validateAmount,
  type WelfareRequestLike,
} from "./welfare-rules";

const BURSAR = { isAdmin: true, isRequester: false };
const BURSAR_WHO_ASKED = { isAdmin: true, isRequester: true };
const TEACHER = { isAdmin: false, isRequester: true };
const STRANGER = { isAdmin: false, isRequester: false };

describe("checkTransition", () => {
  it("lets an administrator approve somebody else's request", () => {
    expect(checkTransition("REQUESTED", "APPROVED", BURSAR)).toBeNull();
  });

  // Matters more here than on an expense, not less.
  it("refuses to let anyone approve welfare for themselves", () => {
    // An expense is the school buying diesel. This is somebody asking for
    // help with a hospital bill, and the person deciding must not be the
    // person who benefits.
    expect(checkTransition("REQUESTED", "APPROVED", BURSAR_WHO_ASKED)).toBe(
      "Welfare cannot be approved by the person who asked for it",
    );
    expect(checkTransition("REQUESTED", "DECLINED", BURSAR_WHO_ASKED)).toBe(
      "Welfare cannot be decided by the person who asked for it",
    );
  });

  it("refuses to pay out on something nobody approved", () => {
    expect(checkTransition("REQUESTED", "PAID", BURSAR)).toBe(
      "Money cannot be paid out on a request nobody approved",
    );
  });

  it("treats paid as final", () => {
    expect(checkTransition("PAID", "DECLINED", BURSAR)).toBe("That request has already been paid");
  });

  it("lets a declined request be raised again by the person who asked", () => {
    expect(checkTransition("DECLINED", "REQUESTED", TEACHER)).toBeNull();
  });

  it("does not let a teacher approve anything", () => {
    expect(checkTransition("REQUESTED", "APPROVED", STRANGER)).toBe(
      "Only an administrator can approve welfare",
    );
  });
});

describe("availableTransitions", () => {
  it("offers the administrator who asked nothing on their own request", () => {
    expect(availableTransitions("REQUESTED", BURSAR_WHO_ASKED)).toEqual([]);
  });

  it("offers approve or decline to an administrator", () => {
    expect(availableTransitions("REQUESTED", BURSAR).sort()).toEqual(["APPROVED", "DECLINED"]);
  });

  it("never offers a move checkTransition would refuse", () => {
    const states = ["REQUESTED", "APPROVED", "PAID", "DECLINED"] as const;
    for (const actor of [BURSAR, BURSAR_WHO_ASKED, TEACHER, STRANGER]) {
      for (const from of states) {
        for (const to of availableTransitions(from, actor)) {
          expect(checkTransition(from, to, actor)).toBeNull();
        }
      }
    }
  });
});

describe("canRead", () => {
  // Narrower than expenses, on purpose.
  it("keeps a welfare request to the person who asked and the administrators", () => {
    // It says something private about them — that they could not pay a
    // hospital bill, that there was a death in the family. Other staff have
    // no business in it, even though they can see every expense.
    expect(canRead(TEACHER)).toBe(true);
    expect(canRead(BURSAR)).toBe(true);
    expect(canRead(STRANGER)).toBe(false);
  });
});

describe("summariseWelfare", () => {
  const REQUESTS: WelfareRequestLike[] = [
    { kind: "MEDICAL", status: "PAID", amountCents: 80_000_00 },
    { kind: "MEDICAL", status: "APPROVED", amountCents: 20_000_00 },
    { kind: "BEREAVEMENT", status: "PAID", amountCents: 50_000_00 },
    { kind: "HARDSHIP", status: "REQUESTED", amountCents: 30_000_00 },
    { kind: "LOAN", status: "DECLINED", amountCents: 10_000_00 },
  ];

  it("separates committed, paid and outstanding", () => {
    const summary = summariseWelfare(REQUESTS);
    expect(summary.committedCents).toBe(150_000_00);
    expect(summary.paidCents).toBe(130_000_00);
    expect(summary.outstandingCents).toBe(20_000_00);
  });

  it("does not count a request nobody has decided as spending", () => {
    expect(summariseWelfare(REQUESTS).pendingCents).toBe(30_000_00);
    expect(summariseWelfare(REQUESTS).byKind.find((k) => k.kind === "HARDSHIP")).toBeUndefined();
  });

  it("drops declined requests entirely", () => {
    expect(summariseWelfare(REQUESTS).byKind.find((k) => k.kind === "LOAN")).toBeUndefined();
  });

  // Counts beside amounts.
  it("reports how many requests made up each total", () => {
    // One large medical bill and twelve small ones are the same figure and a
    // very different picture for a school deciding whether its welfare
    // provision is enough.
    const medical = summariseWelfare(REQUESTS).byKind.find((k) => k.kind === "MEDICAL");
    expect(medical).toEqual({ kind: "MEDICAL", amountCents: 100_000_00, count: 2 });
  });

  it("summarises nothing as zeroes", () => {
    expect(summariseWelfare([])).toEqual({
      committedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      pendingCents: 0,
      byKind: [],
    });
  });
});

describe("validateAmount", () => {
  it("accepts an ordinary amount", () => {
    expect(validateAmount(50_000_00)).toBeNull();
  });

  it("refuses a negative, a fraction and a nonsense figure", () => {
    expect(validateAmount(-1)).toBe("The amount must be above zero");
    expect(validateAmount(10.5)).toBe("Amounts must be in whole minor units");
    expect(validateAmount(100_000_001)).toBe("That amount is larger than this screen will accept");
  });
});
