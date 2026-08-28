import {
  buildCard,
  cardProblem,
  CARDS_PER_SHEET,
  sheetOf,
  slotsFor,
  type CardStudent,
  type SchoolContact,
} from "./id-card-rules";

const SCHOOL: SchoolContact = {
  name: "Demo Academy",
  phone: "0801 234 5678",
  address: "12 Awolowo Road, Ikeja",
};

const STUDENT: CardStudent = {
  name: "Amina Bello",
  studentCode: "DA/2026/0001",
  className: "Grade 5A",
  photoKey: "schools/abc/photos/uuid.jpg",
};

describe("buildCard", () => {
  it("puts the child's name, class and number on the card", () => {
    const card = buildCard(STUDENT, SCHOOL);
    expect(card.name).toBe("Amina Bello");
    expect(card.lines).toEqual(["Grade 5A", "DA/2026/0001", "Demo Academy"]);
  });

  // The whole point of the module.
  it("puts nothing on the card a stranger could use", () => {
    // A school ID is carried by a child, lost by a child, and found by
    // strangers. A home address, a date of birth or a parent's number would
    // all look reasonable on a school ID and none of them belong on one.
    const card = buildCard(STUDENT, SCHOOL);
    const printed = [card.name, ...card.lines, card.ifFound].join(" ");
    expect(printed).not.toContain("Awolowo");
    expect(printed).toMatch(/Demo Academy/);
  });

  it("directs a finder to the school, not to the family", () => {
    expect(buildCard(STUDENT, SCHOOL).ifFound).toBe(
      "If found, please return to Demo Academy, 0801 234 5678",
    );
  });

  it("copes with a school that has no phone number recorded", () => {
    const card = buildCard(STUDENT, { ...SCHOOL, phone: null });
    expect(card.ifFound).toBe("If found, please return to Demo Academy");
  });

  it("leaves out a class or number the school has not recorded", () => {
    const card = buildCard({ ...STUDENT, className: null, studentCode: null }, SCHOOL);
    expect(card.lines).toEqual(["Demo Academy"]);
  });

  it("says whether there is a photograph", () => {
    expect(buildCard(STUDENT, SCHOOL).hasPhoto).toBe(true);
    expect(buildCard({ ...STUDENT, photoKey: null }, SCHOOL).hasPhoto).toBe(false);
  });
});

describe("cardProblem", () => {
  it("prints a card for an ordinary child", () => {
    expect(cardProblem(STUDENT)).toBeNull();
  });

  // Fairness, not tidiness.
  it("still prints a card for a child with no photograph", () => {
    // Refusing would leave the children whose families have not sent a
    // photograph — usually the ones least able to — as the only children in
    // the school without a card.
    expect(cardProblem({ ...STUDENT, photoKey: null })).toBeNull();
  });

  it("refuses only when there is no name", () => {
    expect(cardProblem({ ...STUDENT, name: "   " })).toBe("That child has no name recorded");
  });
});

describe("slotsFor", () => {
  it("lays cards out in two columns", () => {
    const slots = slotsFor(4);
    expect(slots[0]?.x).toBe(slots[2]?.x);
    expect(slots[0]?.y).not.toBe(slots[2]?.y);
    expect(slots[0]?.x).not.toBe(slots[1]?.x);
    expect(slots[0]?.y).toBe(slots[1]?.y);
  });

  it("starts a new sheet after ten", () => {
    const slots = slotsFor(12);
    // The eleventh card sits where the first one does, one sheet later.
    expect(slots[10]?.x).toBe(slots[0]?.x);
    expect(slots[10]?.y).toBe(slots[0]?.y);
  });

  it("produces one slot per card and no more", () => {
    expect(slotsFor(7)).toHaveLength(7);
    expect(slotsFor(0)).toEqual([]);
    expect(slotsFor(-3)).toEqual([]);
  });
});

describe("sheetOf", () => {
  it("counts sheets from zero", () => {
    expect(sheetOf(0)).toBe(0);
    expect(sheetOf(CARDS_PER_SHEET - 1)).toBe(0);
    expect(sheetOf(CARDS_PER_SHEET)).toBe(1);
    expect(sheetOf(CARDS_PER_SHEET * 3)).toBe(3);
  });
});
