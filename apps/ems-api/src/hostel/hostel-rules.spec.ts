import {
  allocateProblem,
  bedsFree,
  bedsTaken,
  nightsStayed,
  releaseProblem,
  summariseOccupancy,
  type AllocationLike,
} from "./hostel-rules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const inRoom = (n: number): AllocationLike[] => Array.from({ length: n }, () => ({ releasedOn: null }));
const released = (n: number): AllocationLike[] =>
  Array.from({ length: n }, () => ({ releasedOn: day("2026-07-20") }));

describe("bedsTaken", () => {
  it("counts only the children still in the room", () => {
    expect(bedsTaken([...inRoom(3), ...released(5)])).toBe(3);
  });

  it("is zero for an empty room", () => {
    expect(bedsTaken(released(4))).toBe(0);
    expect(bedsTaken([])).toBe(0);
  });
});

describe("bedsFree", () => {
  it("is beds less children", () => {
    expect(bedsFree({ beds: 6, allocations: inRoom(4) })).toBe(2);
  });

  it("never goes negative when the bed count is edited down", () => {
    // A real situation: somebody reduces a room from six beds to four while
    // six children are in it. "None free" is honest; a negative reads as a
    // shortage nobody can act on.
    expect(bedsFree({ beds: 4, allocations: inRoom(6) })).toBe(0);
  });

  it("does not count children who have left", () => {
    expect(bedsFree({ beds: 4, allocations: [...inRoom(1), ...released(3)] })).toBe(3);
  });
});

describe("allocateProblem", () => {
  const OK = { bedsFree: 2, currentRoom: null, sameRoom: false };

  it("allows an ordinary allocation", () => {
    expect(allocateProblem(OK)).toBeNull();
  });

  // The check that comes before capacity, and why.
  it("refuses a child who already has a bed elsewhere", () => {
    // A child recorded in two rooms is not an overbooked dormitory — it is a
    // child who cannot be found at ten at night, because the list says one
    // place and they are in another.
    expect(allocateProblem({ ...OK, currentRoom: "Yellow House, Room 3" })).toBe(
      "They already have a bed in Yellow House, Room 3. Release it first.",
    );
  });

  it("puts that before a full room", () => {
    expect(allocateProblem({ bedsFree: 0, currentRoom: "Room 3", sameRoom: false })).toBe(
      "They already have a bed in Room 3. Release it first.",
    );
  });

  it("says something different when it is the same room", () => {
    // "Release it first" would be nonsense advice here.
    expect(allocateProblem({ ...OK, currentRoom: "Room 3", sameRoom: true })).toBe(
      "They already have a bed in this room",
    );
  });

  it("refuses a full room", () => {
    expect(allocateProblem({ ...OK, bedsFree: 0 })).toBe("Every bed in that room is taken");
  });

  it("allows the last bed", () => {
    expect(allocateProblem({ ...OK, bedsFree: 1 })).toBeNull();
  });
});

describe("releaseProblem", () => {
  it("allows an ordinary release", () => {
    expect(releaseProblem(day("2026-09-01"), day("2026-12-15"))).toBeNull();
  });

  it("allows releasing on the same day", () => {
    // A child who arrived and went home the same day still slept nowhere.
    expect(releaseProblem(day("2026-09-01"), day("2026-09-01"))).toBeNull();
  });

  it("refuses a release before the allocation", () => {
    // A negative stay makes every report that counts nights quietly wrong.
    expect(releaseProblem(day("2026-09-01"), day("2026-08-20"))).toBe(
      "A bed cannot be given up before it was taken",
    );
  });

  it("refuses something that is not a date", () => {
    expect(releaseProblem(day("2026-09-01"), new Date("nonsense"))).toBe("That is not a date");
  });
});

describe("nightsStayed", () => {
  it("counts nights between the two dates", () => {
    expect(nightsStayed(day("2026-09-01"), day("2026-09-08"), day("2026-10-01"))).toBe(7);
  });

  it("counts up to today for a child still in the room", () => {
    expect(nightsStayed(day("2026-09-01"), null, day("2026-09-15"))).toBe(14);
  });

  it("is zero on the day they arrived", () => {
    // They have not slept there yet.
    expect(nightsStayed(day("2026-09-01"), null, day("2026-09-01"))).toBe(0);
  });

  it("never goes negative", () => {
    expect(nightsStayed(day("2026-09-10"), day("2026-09-01"), day("2026-10-01"))).toBe(0);
  });

  it("counts correctly across a month boundary", () => {
    expect(nightsStayed(day("2026-09-28"), day("2026-10-03"), day("2026-10-10"))).toBe(5);
  });
});

describe("summariseOccupancy", () => {
  it("totals rooms, beds and who is in them", () => {
    const summary = summariseOccupancy([
      { beds: 6, allocations: inRoom(4) },
      { beds: 4, allocations: inRoom(4) },
      { beds: 4, allocations: [] },
    ]);
    expect(summary).toMatchObject({ rooms: 3, beds: 14, occupied: 8, free: 6 });
  });

  it("counts the empty rooms, which is what an admin is looking for", () => {
    const summary = summariseOccupancy([
      { beds: 4, allocations: inRoom(1) },
      { beds: 4, allocations: [] },
      { beds: 4, allocations: released(3) },
    ]);
    expect(summary.emptyRooms).toBe(2);
  });

  // Reported, not made impossible.
  it("reports a room holding more children than it has beds", () => {
    // The bed count can be edited down after children are already in. Silently
    // clamping it would hide that somebody has nowhere to sleep.
    const summary = summariseOccupancy([{ beds: 2, allocations: inRoom(5) }]);
    expect(summary.overfullRooms).toBe(1);
    expect(summary.occupied).toBe(5);
    expect(summary.free).toBe(0);
  });

  it("summarises no rooms as zeroes", () => {
    expect(summariseOccupancy([])).toEqual({
      rooms: 0,
      beds: 0,
      occupied: 0,
      free: 0,
      emptyRooms: 0,
      overfullRooms: 0,
    });
  });
});
