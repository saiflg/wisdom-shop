import {
  availableCopies,
  borrowProblem,
  daysOverdue,
  dueDateFor,
  isOverdue,
  summariseLibrary,
} from "./library-rules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("dueDateFor", () => {
  it("adds the loan period to the day it went out", () => {
    expect(dueDateFor(day("2026-09-07"), 14)).toEqual(day("2026-09-21"));
  });

  it("ignores the time of day it was issued", () => {
    // Otherwise a book scanned at 4pm is due at 4pm, and two children given
    // the same book on the same day have different deadlines.
    expect(dueDateFor(new Date("2026-09-07T16:30:00Z"), 7)).toEqual(day("2026-09-14"));
  });

  it("never issues a book already due", () => {
    expect(dueDateFor(day("2026-09-07"), 0)).toEqual(day("2026-09-08"));
    expect(dueDateFor(day("2026-09-07"), -5)).toEqual(day("2026-09-08"));
  });
});

describe("isOverdue", () => {
  // The off-by-one that charges a child for being on time.
  it("does not call a book due today overdue", () => {
    // They have until the end of the day they were given. A library that says
    // otherwise fines a child for being punctual, and a ten-year-old assumes
    // the computer is right and never reports it.
    expect(isOverdue({ dueOn: day("2026-09-21"), returnedOn: null }, day("2026-09-21"))).toBe(false);
  });

  it("calls it overdue the day after", () => {
    expect(isOverdue({ dueOn: day("2026-09-21"), returnedOn: null }, day("2026-09-22"))).toBe(true);
  });

  it("is not fooled by the time of day", () => {
    // 11pm on the due date is still the due date.
    expect(isOverdue({ dueOn: day("2026-09-21"), returnedOn: null }, new Date("2026-09-21T23:59:00Z"))).toBe(
      false,
    );
  });

  it("is never overdue once it is back", () => {
    expect(
      isOverdue({ dueOn: day("2026-09-21"), returnedOn: day("2026-09-30") }, day("2026-10-15")),
    ).toBe(false);
  });
});

describe("daysOverdue", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue({ dueOn: day("2026-09-21"), returnedOn: null }, day("2026-09-24"))).toBe(3);
  });

  it("is zero on the due date itself", () => {
    expect(daysOverdue({ dueOn: day("2026-09-21"), returnedOn: null }, day("2026-09-21"))).toBe(0);
  });

  it("is zero for a book that came back", () => {
    expect(
      daysOverdue({ dueOn: day("2026-09-21"), returnedOn: day("2026-09-25") }, day("2026-10-01")),
    ).toBe(0);
  });

  it("counts correctly across a month boundary", () => {
    // Naive date arithmetic gets this wrong often enough to be worth pinning.
    expect(daysOverdue({ dueOn: day("2026-09-28"), returnedOn: null }, day("2026-10-03"))).toBe(5);
  });
});

describe("availableCopies", () => {
  it("is what is owned less what is out", () => {
    expect(availableCopies(5, 2)).toBe(3);
  });

  it("never goes negative", () => {
    // If the copy count and the loan rows disagree — a copy withdrawn while
    // it was out — the honest answer is "none", not a negative that reads as
    // a shortage nobody can act on.
    expect(availableCopies(2, 5)).toBe(0);
    expect(availableCopies(-1, 0)).toBe(0);
  });
});

describe("borrowProblem", () => {
  const OK = {
    availableCopies: 2,
    alreadyHasThisBook: false,
    currentLoans: 1,
    maxPerBorrower: 3,
    overdueLoans: 0,
  };

  it("allows an ordinary loan", () => {
    expect(borrowProblem(OK)).toBeNull();
  });

  it("refuses when every copy is out", () => {
    expect(borrowProblem({ ...OK, availableCopies: 0 })).toBe("Every copy of that book is out");
  });

  it("refuses a second copy of the same book", () => {
    expect(borrowProblem({ ...OK, alreadyHasThisBook: true })).toBe(
      "They already have a copy of that book",
    );
  });

  it("refuses somebody with something overdue, and counts it", () => {
    expect(borrowProblem({ ...OK, overdueLoans: 1 })).toBe(
      "They have a book overdue. It has to come back first.",
    );
    expect(borrowProblem({ ...OK, overdueLoans: 3 })).toBe(
      "They have 3 books overdue. Those have to come back first.",
    );
  });

  it("refuses somebody at their limit", () => {
    expect(borrowProblem({ ...OK, currentLoans: 3 })).toBe(
      "They already have 3 books out, which is the limit",
    );
  });

  it("reports the most concrete reason first", () => {
    // A librarian holding a book needs "every copy is out" before "this child
    // is at their limit" — they are different conversations, and the first
    // one is about the book in their hand.
    expect(borrowProblem({ ...OK, availableCopies: 0, currentLoans: 3, overdueLoans: 2 })).toBe(
      "Every copy of that book is out",
    );
  });
});

describe("summariseLibrary", () => {
  it("keeps titles and copies apart", () => {
    // Forty copies of one book and forty different books are the same number
    // and a very different library.
    const summary = summariseLibrary([
      { copies: 40, outstandingLoans: 5, overdueLoans: 1 },
      { copies: 1, outstandingLoans: 0, overdueLoans: 0 },
    ]);
    expect(summary.titles).toBe(2);
    expect(summary.copies).toBe(41);
  });

  it("totals what is out, what is left and what is late", () => {
    const summary = summariseLibrary([
      { copies: 5, outstandingLoans: 2, overdueLoans: 1 },
      { copies: 3, outstandingLoans: 3, overdueLoans: 0 },
    ]);
    expect(summary).toMatchObject({ copies: 8, onLoan: 5, available: 3, overdue: 1 });
  });

  it("never reports more out than the school owns", () => {
    const summary = summariseLibrary([{ copies: 2, outstandingLoans: 9, overdueLoans: 0 }]);
    expect(summary.onLoan).toBe(2);
    expect(summary.available).toBe(0);
  });

  it("summarises an empty library as zeroes", () => {
    expect(summariseLibrary([])).toEqual({ titles: 0, copies: 0, onLoan: 0, available: 0, overdue: 0 });
  });
});
