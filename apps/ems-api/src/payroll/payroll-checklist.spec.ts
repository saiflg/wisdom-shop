import {
  approvalWarning,
  byPosition,
  carryForward,
  DEFAULT_CHECKLIST,
  isDuplicate,
  nextPosition,
  normaliseLabel,
  progressOf,
  seedFrom,
  type ChecklistItemLike,
} from "./payroll-checklist";

let seq = 0;
function item(overrides: Partial<ChecklistItemLike> = {}): ChecklistItemLike {
  seq += 1;
  return {
    id: `i${seq}`,
    label: `Check ${seq}`,
    position: seq,
    doneAt: null,
    doneByName: null,
    note: null,
    ...overrides,
  };
}

const done = (overrides: Partial<ChecklistItemLike> = {}) =>
  item({ doneAt: new Date("2026-08-01T09:00:00Z"), doneByName: "Halima Sani", ...overrides });

describe("progressOf", () => {
  it("counts what is done against the total", () => {
    const p = progressOf([done(), item(), item()]);
    expect(p).toMatchObject({ total: 3, done: 1, complete: false });
    expect(p.percent).toBe(33);
  });

  it("is complete when every item is ticked", () => {
    const p = progressOf([done(), done()]);
    expect(p).toMatchObject({ done: 2, percent: 100, complete: true });
    expect(p.outstanding).toEqual([]);
  });

  it("treats an empty checklist as complete, not as zero progress", () => {
    // A school that deleted every item has nothing outstanding; showing 0%
    // would nag forever about nothing.
    expect(progressOf([])).toMatchObject({ total: 0, done: 0, percent: 100, complete: true });
  });

  it("rounds to whole percent so a bar never shows 99.7", () => {
    const items = [done(), done(), item()];
    expect(progressOf(items).percent).toBe(67);
  });

  it("lists what is outstanding in the order it appears", () => {
    const p = progressOf([
      item({ label: "Third", position: 3 }),
      done({ label: "First", position: 1 }),
      item({ label: "Second", position: 2 }),
    ]);
    expect(p.outstanding.map((i) => i.label)).toEqual(["Second", "Third"]);
  });
});

describe("normaliseLabel", () => {
  it("trims and collapses whitespace", () => {
    expect(normaliseLabel("  Loan   checked  ")).toBe("Loan checked");
  });
});

describe("isDuplicate", () => {
  it("catches the same item in different case or spacing", () => {
    // "Loan checked" and "loan checked " both on one list is worse than
    // useless: somebody ticks one and the other sits there accusing them.
    expect(isDuplicate("loan checked ", ["Loan checked"])).toBe(true);
    expect(isDuplicate("LOAN  CHECKED", ["Loan checked"])).toBe(true);
  });

  it("allows a genuinely different item", () => {
    expect(isDuplicate("Pension checked", ["Loan checked"])).toBe(false);
  });

  it("is false against an empty list", () => {
    expect(isDuplicate("Anything", [])).toBe(false);
  });
});

describe("nextPosition", () => {
  it("appends after the highest position", () => {
    expect(nextPosition([{ position: 1 }, { position: 7 }, { position: 3 }])).toBe(8);
  });

  it("starts at 1 for an empty list", () => {
    expect(nextPosition([])).toBe(1);
  });
});

describe("byPosition", () => {
  it("orders by position", () => {
    const list = [item({ position: 3 }), item({ position: 1 }), item({ position: 2 })];
    expect([...list].sort(byPosition).map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it("breaks a tie by label, so the order does not shuffle between reads", () => {
    const list = [item({ label: "B", position: 1 }), item({ label: "A", position: 1 })];
    expect([...list].sort(byPosition).map((i) => i.label)).toEqual(["A", "B"]);
  });
});

describe("carryForward", () => {
  it("keeps the labels", () => {
    const carried = carryForward([item({ label: "Loan checked" }), item({ label: "Fees checked" })]);
    expect(carried.map((c) => c.label)).toEqual(["Loan checked", "Fees checked"]);
  });

  it("NEVER carries the ticks", () => {
    // A checklist that arrived pre-completed is worse than none: it looks
    // like the work was done.
    const carried = carryForward([done({ label: "Loan checked" })]);
    expect(carried[0]).toEqual({ label: "Loan checked", position: 1 });
    expect("doneAt" in carried[0]).toBe(false);
  });

  it("renumbers densely, so a deleted item leaves no gap", () => {
    const carried = carryForward([item({ position: 2 }), item({ position: 9 }), item({ position: 40 })]);
    expect(carried.map((c) => c.position)).toEqual([1, 2, 3]);
  });
});

describe("seedFrom", () => {
  it("copies last month's list when there is one", () => {
    const seeded = seedFrom([item({ label: "A school's own check" })]);
    expect(seeded.map((s) => s.label)).toEqual(["A school's own check"]);
  });

  it("falls back to the default list for a school's first run", () => {
    expect(seedFrom([]).map((s) => s.label)).toEqual([...DEFAULT_CHECKLIST]);
  });

  it("numbers from 1 either way", () => {
    expect(seedFrom([])[0].position).toBe(1);
  });
});

describe("approvalWarning", () => {
  it("says nothing when the checks are done", () => {
    expect(approvalWarning(progressOf([done()]))).toBeNull();
  });

  it("names what is outstanding rather than only counting it", () => {
    const warning = approvalWarning(progressOf([item({ label: "Loan checked and updated" }), done()]));
    expect(warning).toContain("Loan checked and updated");
    expect(warning).toContain("1 month-end check has");
  });

  it("uses a plural for several", () => {
    const warning = approvalWarning(progressOf([item({ label: "A" }), item({ label: "B" })]));
    expect(warning).toContain("2 month-end checks have");
  });
});

describe("the default checklist", () => {
  it("covers the silent failures a payroll system cannot detect itself", () => {
    expect(DEFAULT_CHECKLIST).toEqual(
      expect.arrayContaining([
        "Year of service incremented",
        "Penalty column cleared",
        "Loan checked and updated",
        "School fees checked and updated",
      ]),
    );
  });

  it("has no duplicates of its own", () => {
    const seen = DEFAULT_CHECKLIST.map((l) => l.toLowerCase());
    expect(new Set(seen).size).toBe(seen.length);
  });
});
