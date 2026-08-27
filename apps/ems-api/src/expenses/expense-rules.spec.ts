import {
  availableTransitions,
  checkTransition,
  isCommitted,
  summariseExpenses,
  validateExpenseAmount,
  type ExpenseLike,
} from "./expense-rules";

const BURSAR = { isAdmin: true, isRequester: false };
const BURSAR_WHO_ASKED = { isAdmin: true, isRequester: true };
const TEACHER_WHO_ASKED = { isAdmin: false, isRequester: true };

describe("checkTransition", () => {
  it("lets an administrator approve somebody else's request", () => {
    expect(checkTransition("REQUESTED", "APPROVED", BURSAR)).toBeNull();
  });

  // The control this module exists for.
  it("refuses to let anyone approve their own spending", () => {
    // The oldest control in bookkeeping, and the one a school with three
    // administrators is most likely to lose: the person who needs the diesel
    // and the person who can approve it are often the same person.
    expect(checkTransition("REQUESTED", "APPROVED", BURSAR_WHO_ASKED)).toBe(
      "Spending cannot be approved by the person who asked for it",
    );
    expect(checkTransition("REQUESTED", "REJECTED", BURSAR_WHO_ASKED)).toBe(
      "Spending cannot be decided by the person who asked for it",
    );
  });

  it("refuses to pay out on something nobody approved", () => {
    expect(checkTransition("REQUESTED", "PAID", BURSAR)).toBe(
      "Money cannot be paid out on an expense nobody approved",
    );
  });

  it("lets an approved expense be paid", () => {
    expect(checkTransition("APPROVED", "PAID", BURSAR)).toBeNull();
  });

  it("treats paid as final", () => {
    // Money that has left cannot be un-spent by editing a row.
    expect(checkTransition("PAID", "REJECTED", BURSAR)).toBe("That expense has already been paid");
    expect(checkTransition("PAID", "APPROVED", BURSAR)).toBe("That expense has already been paid");
  });

  it("lets a rejected request be raised again", () => {
    expect(checkTransition("REJECTED", "REQUESTED", TEACHER_WHO_ASKED)).toBeNull();
  });

  it("does not let a teacher approve anything", () => {
    expect(checkTransition("REQUESTED", "APPROVED", { isAdmin: false, isRequester: false })).toBe(
      "Only an administrator can approve spending",
    );
  });
});

describe("availableTransitions", () => {
  it("offers an administrator approve or reject on somebody else's request", () => {
    expect(availableTransitions("REQUESTED", BURSAR).sort()).toEqual(["APPROVED", "REJECTED"]);
  });

  it("offers the administrator who asked nothing on their own request", () => {
    // So the screen cannot show an Approve button the API will refuse.
    expect(availableTransitions("REQUESTED", BURSAR_WHO_ASKED)).toEqual([]);
  });

  it("offers nothing at all once it is paid", () => {
    expect(availableTransitions("PAID", BURSAR)).toEqual([]);
  });

  it("never offers a move checkTransition would refuse", () => {
    const states = ["REQUESTED", "APPROVED", "PAID", "REJECTED"] as const;
    for (const actor of [BURSAR, BURSAR_WHO_ASKED, TEACHER_WHO_ASKED]) {
      for (const from of states) {
        for (const to of availableTransitions(from, actor)) {
          expect(checkTransition(from, to, actor)).toBeNull();
        }
      }
    }
  });
});

describe("isCommitted", () => {
  it("counts approved and paid, and nothing else", () => {
    expect(isCommitted("APPROVED")).toBe(true);
    expect(isCommitted("PAID")).toBe(true);
    expect(isCommitted("REQUESTED")).toBe(false);
    expect(isCommitted("REJECTED")).toBe(false);
  });
});

describe("summariseExpenses", () => {
  const EXPENSES: ExpenseLike[] = [
    { category: "Diesel", amountCents: 50_000_00, status: "PAID" },
    { category: "Diesel", amountCents: 30_000_00, status: "APPROVED" },
    { category: "Stationery", amountCents: 12_000_00, status: "PAID" },
    { category: "Repairs", amountCents: 90_000_00, status: "REQUESTED" },
    { category: "Repairs", amountCents: 5_000_00, status: "REJECTED" },
  ];

  it("separates what is committed from what has been paid", () => {
    const summary = summariseExpenses(EXPENSES);
    expect(summary.committedCents).toBe(92_000_00);
    expect(summary.paidCents).toBe(62_000_00);
    expect(summary.outstandingCents).toBe(30_000_00);
  });

  // The rule that matters for the number a head teacher decides on.
  it("does not count a request nobody has approved as spending", () => {
    // Counting it would overstate what the school has spent — and overstate
    // it in the direction that makes somebody cut what they did not need to.
    const summary = summariseExpenses(EXPENSES);
    expect(summary.pendingCents).toBe(90_000_00);
    // The 90,000 sits in pending and nowhere else: committed is the two
    // Diesel rows plus Stationery, and Repairs never reaches a category
    // total because nothing in it was approved.
    expect(summary.committedCents).toBe(92_000_00);
    expect(summary.byCategory.find((c) => c.category === "Repairs")).toBeUndefined();
  });

  it("ignores what was turned down entirely", () => {
    // Rejected money is neither spent nor pending; it is a decision already
    // made, and carrying it anywhere would double-count the conversation.
    const summary = summariseExpenses([{ category: "Repairs", amountCents: 5_000_00, status: "REJECTED" }]);
    expect(summary).toMatchObject({ committedCents: 0, pendingCents: 0, paidCents: 0 });
    expect(summary.byCategory).toEqual([]);
  });

  it("groups committed money by category, largest first", () => {
    expect(summariseExpenses(EXPENSES).byCategory).toEqual([
      { category: "Diesel", amountCents: 80_000_00 },
      { category: "Stationery", amountCents: 12_000_00 },
    ]);
  });

  it("breaks ties by name so the order never reshuffles", () => {
    const tied: ExpenseLike[] = [
      { category: "Water", amountCents: 1_000_00, status: "PAID" },
      { category: "Books", amountCents: 1_000_00, status: "PAID" },
    ];
    expect(summariseExpenses(tied).byCategory.map((c) => c.category)).toEqual(["Books", "Water"]);
  });

  it("summarises nothing as zeroes", () => {
    expect(summariseExpenses([])).toEqual({
      committedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      pendingCents: 0,
      byCategory: [],
    });
  });
});

describe("validateExpenseAmount", () => {
  it("accepts an ordinary amount", () => {
    expect(validateExpenseAmount(50_000_00)).toBeNull();
  });

  it("refuses a negative", () => {
    // A refund is a different thing and should be recorded as what it is,
    // not as spending with a minus in front of it.
    expect(validateExpenseAmount(-500)).toBe("The amount must be above zero");
  });

  it("refuses a fractional minor unit and a nonsense figure", () => {
    expect(validateExpenseAmount(10.5)).toBe("Amounts must be in whole minor units");
    expect(validateExpenseAmount(Number.NaN)).toBe("That amount is not a number");
    expect(validateExpenseAmount(1_000_000_001)).toBe("That amount is larger than this screen will accept");
  });
});
