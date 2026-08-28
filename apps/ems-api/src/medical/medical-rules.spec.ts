import { criticalOnly, forEmergency, summarise, validateEntry, type MedicalEntryLike } from "./medical-rules";

const entry = (over: Partial<MedicalEntryLike> = {}): MedicalEntryLike => ({
  kind: "CONDITION",
  severity: "MINOR",
  title: "Something",
  archivedAt: null,
  ...over,
});

describe("forEmergency", () => {
  // The ordering this exists for.
  it("puts a life-threatening entry first whatever kind it is", () => {
    // Somebody reaching for this record is doing so quickly. An anaphylactic
    // allergy sorted below a note about travel sickness, because the note was
    // added later, is the failure this prevents.
    const entries = [
      entry({ kind: "NOTE", severity: null, title: "Travel sickness" }),
      entry({ kind: "MEDICATION", severity: "MINOR", title: "Vitamin D" }),
      entry({ kind: "ALLERGY", severity: "LIFE_THREATENING", title: "Peanuts" }),
    ];
    expect(forEmergency(entries)[0]?.title).toBe("Peanuts");
  });

  it("orders by severity before kind", () => {
    const entries = [
      entry({ kind: "ALLERGY", severity: "MINOR", title: "Pollen" }),
      entry({ kind: "CONDITION", severity: "LIFE_THREATENING", title: "Epilepsy" }),
    ];
    expect(forEmergency(entries).map((e) => e.title)).toEqual(["Epilepsy", "Pollen"]);
  });

  // Archived, not deleted.
  it("sinks archived entries without losing them", () => {
    // A condition a child has grown out of is still part of their history,
    // and deleting it would leave the next reader unable to tell "resolved"
    // from "never happened".
    const entries = [
      entry({ title: "Old", archivedAt: new Date("2024-01-01") }),
      entry({ title: "Current" }),
    ];
    const ordered = forEmergency(entries);
    expect(ordered.map((e) => e.title)).toEqual(["Current", "Old"]);
    expect(ordered).toHaveLength(2);
  });

  it("keeps an archived life-threatening entry below a live minor one", () => {
    // It is history, not a live warning.
    const entries = [
      entry({ severity: "LIFE_THREATENING", title: "Resolved", archivedAt: new Date("2024-01-01") }),
      entry({ severity: "MINOR", title: "Live" }),
    ];
    expect(forEmergency(entries)[0]?.title).toBe("Live");
  });

  it("does not modify what it was given", () => {
    const entries = [entry({ severity: "MINOR", title: "B" }), entry({ severity: "LIFE_THREATENING", title: "A" })];
    forEmergency(entries);
    expect(entries[0]?.title).toBe("B");
  });
});

describe("criticalOnly", () => {
  // Short on purpose.
  it("returns only live, life-threatening entries", () => {
    // A short list that is always read beats a complete list that is skimmed.
    // The moment this includes minor notes is the moment a teacher stops
    // reading it before a school trip.
    const entries = [
      entry({ severity: "LIFE_THREATENING", title: "Peanuts" }),
      entry({ severity: "SIGNIFICANT", title: "Asthma" }),
      entry({ severity: "MINOR", title: "Pollen" }),
      entry({ severity: "LIFE_THREATENING", title: "Old", archivedAt: new Date("2024-01-01") }),
    ];
    expect(criticalOnly(entries).map((e) => e.title)).toEqual(["Peanuts"]);
  });

  it("is empty when there is nothing critical", () => {
    expect(criticalOnly([entry({ severity: "MINOR" })])).toEqual([]);
  });
});

describe("validateEntry", () => {
  it("accepts an ordinary entry", () => {
    expect(validateEntry({ kind: "ALLERGY", severity: "LIFE_THREATENING", title: "Peanuts" })).toBeNull();
    expect(validateEntry({ kind: "NOTE", severity: null, title: "Dislikes swimming" })).toBeNull();
  });

  // Asked for, never defaulted.
  it("insists on a severity for an allergy or condition", () => {
    // A default of "minor" would be a clinical claim this software has no
    // basis for making, about the entry somebody most needs it for.
    expect(validateEntry({ kind: "ALLERGY", severity: null, title: "Peanuts" })).toBe(
      "Say how serious it is — nobody can judge that from the name alone",
    );
    expect(validateEntry({ kind: "CONDITION", severity: null, title: "Asthma" })).toBe(
      "Say how serious it is — nobody can judge that from the name alone",
    );
  });

  it("refuses a severity on a plain note", () => {
    // It would turn "dislikes swimming" into a medical grading.
    expect(validateEntry({ kind: "NOTE", severity: "MINOR", title: "Dislikes swimming" })).toBe(
      "A note does not carry a severity",
    );
  });

  it("wants to know what it is", () => {
    expect(validateEntry({ kind: "NOTE", severity: null, title: "  " })).toBe("Say what it is");
  });

  it("allows a medication without a severity", () => {
    expect(validateEntry({ kind: "MEDICATION", severity: null, title: "Inhaler" })).toBeNull();
  });
});

describe("summarise", () => {
  it("counts the live entries by kind", () => {
    const summary = summarise([
      entry({ kind: "ALLERGY", severity: "LIFE_THREATENING" }),
      entry({ kind: "ALLERGY", severity: "MINOR" }),
      entry({ kind: "CONDITION", severity: "SIGNIFICANT" }),
      entry({ kind: "MEDICATION", severity: null }),
      entry({ kind: "NOTE", severity: null, archivedAt: new Date("2024-01-01") }),
    ]);
    expect(summary).toMatchObject({
      critical: 1,
      allergies: 2,
      conditions: 1,
      medications: 1,
      archived: 1,
    });
  });

  // The distinction that keeps a green tick honest.
  it("knows nothing recorded from nothing serious", () => {
    // A child with no record and a child assessed as having nothing of
    // concern are different, and showing both as a reassuring tick would
    // invent the second.
    expect(summarise([]).empty).toBe(true);
    expect(summarise([entry({ severity: "MINOR" })]).empty).toBe(false);
    expect(summarise([entry({ severity: "MINOR" })]).critical).toBe(0);
  });
});
