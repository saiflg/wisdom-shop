import {
  assignProblem,
  orderStops,
  seatsByDirection,
  seatsTaken,
  stopsOutOfOrder,
  validatePickupMinute,
  type AssignmentLike,
} from "./transport-rules";

const morning = (n: number): AssignmentLike[] => Array.from({ length: n }, () => ({ direction: "MORNING" }));
const both = (n: number): AssignmentLike[] => Array.from({ length: n }, () => ({ direction: "BOTH" }));

describe("seatsTaken", () => {
  // The rule that is easy to get wrong.
  it("counts each run separately", () => {
    // A bus with thirty seats doing two runs carries thirty in the morning
    // and thirty in the afternoon, not thirty in total. Counting every
    // assignment against one capacity would refuse half a school a seat that
    // exists.
    const assignments: AssignmentLike[] = [
      ...morning(20),
      ...Array.from({ length: 15 }, () => ({ direction: "AFTERNOON" as const })),
    ];
    expect(seatsTaken(assignments, "MORNING")).toBe(20);
    expect(seatsTaken(assignments, "AFTERNOON")).toBe(15);
  });

  it("counts a both-ways child once on each run", () => {
    // Not twice on one run, and not missing from the other.
    expect(seatsTaken(both(10), "MORNING")).toBe(10);
    expect(seatsTaken(both(10), "AFTERNOON")).toBe(10);
  });

  it("reports both runs together", () => {
    expect(seatsByDirection([...morning(5), ...both(3)])).toEqual({ morning: 8, afternoon: 3 });
  });

  it("is zero for an empty route", () => {
    expect(seatsByDirection([])).toEqual({ morning: 0, afternoon: 0 });
  });
});

describe("assignProblem", () => {
  const OK = {
    seats: 30,
    existing: morning(10),
    direction: "MORNING" as const,
    alreadyOnThisRoute: false,
    clashingRoute: null,
  };

  it("allows an ordinary assignment", () => {
    expect(assignProblem(OK)).toBeNull();
  });

  it("refuses somebody already on this route", () => {
    expect(assignProblem({ ...OK, alreadyOnThisRoute: true })).toBe("They are already on this route");
  });

  // More important than capacity.
  it("refuses a child already on another route for the same run", () => {
    // A child on two buses at once is not a full bus — it is a child nobody
    // is waiting for at one of two gates.
    expect(assignProblem({ ...OK, clashingRoute: "Route B" })).toBe(
      "They are already on Route B for that run",
    );
  });

  it("puts the clash before the capacity", () => {
    expect(assignProblem({ ...OK, seats: 10, clashingRoute: "Route B" })).toBe(
      "They are already on Route B for that run",
    );
  });

  it("refuses when the run is full, and says which run", () => {
    expect(assignProblem({ ...OK, seats: 10 })).toBe("The morning run is full");
    expect(assignProblem({ ...OK, seats: 10, existing: both(10), direction: "AFTERNOON" })).toBe(
      "The afternoon run is full",
    );
  });

  it("checks both runs when the child rides both ways", () => {
    // Full in the afternoon only: a both-ways assignment still has to be
    // refused, even though the morning has room.
    const existing = [...morning(2), ...Array.from({ length: 10 }, () => ({ direction: "AFTERNOON" as const }))];
    expect(assignProblem({ ...OK, seats: 10, existing, direction: "BOTH" })).toBe(
      "The afternoon run is full",
    );
  });

  it("refuses a route with no vehicle on it", () => {
    expect(assignProblem({ ...OK, seats: 0 })).toBe("That route has no vehicle with seats on it yet");
  });

  it("allows the last seat", () => {
    // Off-by-one in the other direction: seat thirty of thirty is a seat.
    expect(assignProblem({ ...OK, seats: 11, existing: morning(10) })).toBeNull();
  });
});

describe("orderStops", () => {
  it("orders by position", () => {
    const stops = [
      { name: "Ojota", position: 3, pickupMinute: null },
      { name: "Ikeja", position: 1, pickupMinute: null },
      { name: "Maryland", position: 2, pickupMinute: null },
    ];
    expect(orderStops(stops).map((s) => s.name)).toEqual(["Ikeja", "Maryland", "Ojota"]);
  });

  it("breaks ties by name so the order never reshuffles", () => {
    // A route that reordered between page loads would show a parent a
    // different pickup time each time they checked.
    const stops = [
      { name: "Zebra", position: 1, pickupMinute: null },
      { name: "Alpha", position: 1, pickupMinute: null },
    ];
    expect(orderStops(stops).map((s) => s.name)).toEqual(["Alpha", "Zebra"]);
    expect(orderStops([...stops].reverse()).map((s) => s.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("does not modify what it was given", () => {
    const stops = [
      { name: "B", position: 2, pickupMinute: null },
      { name: "A", position: 1, pickupMinute: null },
    ];
    orderStops(stops);
    expect(stops[0].name).toBe("B");
  });
});

describe("stopsOutOfOrder", () => {
  it("is quiet when times climb along the route", () => {
    expect(
      stopsOutOfOrder([
        { name: "Ikeja", position: 1, pickupMinute: 6 * 60 + 30 },
        { name: "Maryland", position: 2, pickupMinute: 6 * 60 + 50 },
        { name: "Ojota", position: 3, pickupMinute: 7 * 60 + 10 },
      ]),
    ).toEqual([]);
  });

  it("catches a time that goes backwards", () => {
    // Almost always 07:50 typed as 06:50 — and the consequence is a family
    // standing outside an hour early.
    const problems = stopsOutOfOrder([
      { name: "Ikeja", position: 1, pickupMinute: 6 * 60 + 30 },
      { name: "Maryland", position: 2, pickupMinute: 7 * 60 + 50 },
      { name: "Ojota", position: 3, pickupMinute: 6 * 60 + 50 },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Ojota (06:50)");
    expect(problems[0]).toContain("Maryland (07:50)");
  });

  it("skips stops with no time set rather than treating them as midnight", () => {
    // Otherwise every route a school has half-filled in reads as broken.
    expect(
      stopsOutOfOrder([
        { name: "Ikeja", position: 1, pickupMinute: 6 * 60 + 30 },
        { name: "Maryland", position: 2, pickupMinute: null },
        { name: "Ojota", position: 3, pickupMinute: 7 * 60 },
      ]),
    ).toEqual([]);
  });

  it("is quiet about two stops at the same minute", () => {
    // Two stops on the same street at 06:30 is a rounding, not an error.
    expect(
      stopsOutOfOrder([
        { name: "A", position: 1, pickupMinute: 390 },
        { name: "B", position: 2, pickupMinute: 390 },
      ]),
    ).toEqual([]);
  });
});

describe("validatePickupMinute", () => {
  it("accepts a time of day and an unset one", () => {
    expect(validatePickupMinute(390)).toBeNull();
    expect(validatePickupMinute(null)).toBeNull();
    expect(validatePickupMinute(undefined)).toBeNull();
  });

  it("refuses something that is not a time", () => {
    expect(validatePickupMinute(-1)).toBe("That is not a time of day");
    expect(validatePickupMinute(1440)).toBe("That is not a time of day");
    expect(validatePickupMinute(6.5)).toBe("A pickup time has to be a whole number of minutes");
  });

  it("accepts the last minute of the day", () => {
    expect(validatePickupMinute(1439)).toBeNull();
  });
});
