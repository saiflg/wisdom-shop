import {
  choosePayerEmail,
  explainRefusal,
  hasUndeliverableDomain,
  isUsablePayerEmail,
  looksWellFormed,
  payerEmailProblem,
} from "./payer-email";

describe("hasUndeliverableDomain", () => {
  it("rejects every TLD reserved so it can never resolve", () => {
    // RFC 2606 / RFC 6761. These are the natural things to put in seed data
    // and in a fallback, and a real gateway refuses all of them.
    expect(hasUndeliverableDomain("fees@school.invalid")).toBe(true);
    expect(hasUndeliverableDomain("segun@demo-academy.example")).toBe(true);
    expect(hasUndeliverableDomain("someone@my.test")).toBe(true);
    expect(hasUndeliverableDomain("root@localhost")).toBe(true);
  });

  it("rejects the reserved second-level example domains", () => {
    expect(hasUndeliverableDomain("a@example.com")).toBe(true);
    expect(hasUndeliverableDomain("a@example.org")).toBe(true);
  });

  it("accepts an ordinary address", () => {
    expect(hasUndeliverableDomain("segun@gmail.com")).toBe(false);
    expect(hasUndeliverableDomain("bursar@almadina.edu.ng")).toBe(false);
  });

  it("is not fooled by a domain that merely contains a reserved word", () => {
    // "example" as a label is fine; only the reserved forms are refused.
    expect(hasUndeliverableDomain("a@example-school.com")).toBe(false);
    expect(hasUndeliverableDomain("a@testing.ng")).toBe(false);
  });

  it("is case-insensitive, because addresses are typed by people", () => {
    expect(hasUndeliverableDomain("A@Demo-Academy.EXAMPLE")).toBe(true);
  });
});

describe("looksWellFormed", () => {
  it("accepts ordinary addresses including multi-part domains", () => {
    expect(looksWellFormed("bursar@almadina.edu.ng")).toBe(true);
  });

  it("rejects what is obviously not an address", () => {
    expect(looksWellFormed("segun")).toBe(false);
    expect(looksWellFormed("segun@")).toBe(false);
    expect(looksWellFormed("segun@school")).toBe(false);
    expect(looksWellFormed("a b@school.com")).toBe(false);
  });
});

describe("payerEmailProblem", () => {
  it("says nothing about a usable address", () => {
    expect(payerEmailProblem("segun@gmail.com")).toBeNull();
  });

  it("distinguishes missing from malformed from reserved", () => {
    expect(payerEmailProblem(null)).toMatch(/no email address on file/i);
    expect(payerEmailProblem("   ")).toMatch(/no email address on file/i);
    expect(payerEmailProblem("not-an-address")).toMatch(/not valid/i);
    expect(payerEmailProblem("fees@school.invalid")).toMatch(/reserved domain/i);
  });

  it("quotes the offending address so a bursar knows which record to fix", () => {
    // "Invalid email" tells nobody which of four hundred families is wrong.
    expect(payerEmailProblem("segun@demo-academy.example")).toContain("segun@demo-academy.example");
  });

  it("tolerates surrounding spaces", () => {
    expect(payerEmailProblem("  segun@gmail.com  ")).toBeNull();
  });
});

describe("choosePayerEmail", () => {
  const school = "bursar@almadina.edu.ng";

  it("prefers a guardian, because they are the one paying", () => {
    const choice = choosePayerEmail({
      guardianEmails: ["mum@gmail.com"],
      studentEmail: "child@gmail.com",
      schoolEmail: school,
    });
    expect(choice).toEqual({ email: "mum@gmail.com", source: "GUARDIAN", problem: null });
  });

  it("skips a guardian whose address a gateway would refuse", () => {
    // The exact case that broke the demo: seeded .example addresses.
    const choice = choosePayerEmail({
      guardianEmails: [null, "segun@demo-academy.example", "dad@yahoo.com"],
      studentEmail: null,
      schoolEmail: school,
    });
    expect(choice.email).toBe("dad@yahoo.com");
    expect(choice.source).toBe("GUARDIAN");
  });

  it("falls back to the student, then to the school", () => {
    expect(choosePayerEmail({ guardianEmails: [], studentEmail: "child@gmail.com", schoolEmail: school }).source)
      .toBe("STUDENT");
    expect(choosePayerEmail({ guardianEmails: [], studentEmail: null, schoolEmail: school }).source)
      .toBe("SCHOOL");
  });

  it("uses the school rather than failing, because a receipt in the bursar's inbox beats a dead checkout", () => {
    const choice = choosePayerEmail({
      guardianEmails: ["segun@demo-academy.example"],
      studentEmail: "tunde@demo-academy.example",
      schoolEmail: school,
    });
    expect(choice.email).toBe(school);
    expect(choice.source).toBe("SCHOOL");
  });

  it("NEVER invents an address when nothing works", () => {
    // Inventing one only moves the failure to the gateway, where the message
    // stops being actionable. This is the whole bug being fixed.
    const choice = choosePayerEmail({
      guardianEmails: ["segun@demo-academy.example"],
      studentEmail: null,
      schoolEmail: null,
    });
    expect(choice.email).toBeNull();
    expect(choice.source).toBeNull();
    expect(choice.problem).toMatch(/reserved domain/i);
  });

  it("reports what is wrong with the address somebody actually typed", () => {
    // More useful than "no email on file" when there is one and it is simply
    // unusable — that sends a bursar looking for a blank field.
    const choice = choosePayerEmail({
      guardianEmails: ["nonsense"],
      studentEmail: null,
      schoolEmail: null,
    });
    expect(choice.problem).toMatch(/not valid/i);
    expect(choice.problem).toContain("nonsense");
  });

  it("says plainly when the family has nothing at all", () => {
    const choice = choosePayerEmail({ guardianEmails: [null], studentEmail: null, schoolEmail: null });
    expect(choice.problem).toMatch(/no email address on file/i);
  });

  it("trims the address it hands to the gateway", () => {
    expect(choosePayerEmail({ guardianEmails: ["  mum@gmail.com "], studentEmail: null, schoolEmail: null }).email)
      .toBe("mum@gmail.com");
  });
});

describe("explainRefusal", () => {
  it("reads as English rather than two fragments jammed together", () => {
    // The first version produced: has "x" uses a reserved domain.
    const choice = choosePayerEmail({
      guardianEmails: ["mother@demo-academy.example"],
      studentEmail: null,
      schoolEmail: null,
    });
    const message = explainRefusal(choice, "Aisha Ibrahim");
    expect(message).not.toMatch(/has "[^"]*" (uses|is)/);
    expect(message).toContain("for Aisha Ibrahim: the email address on file");
  });

  it("points only at places that actually exist in the product", () => {
    const choice = choosePayerEmail({ guardianEmails: [], studentEmail: null, schoolEmail: null });
    expect(explainRefusal(choice, "Tunde")).toMatch(/Settings . Communication/);
  });
  it("names the child and the next step", () => {
    const choice = choosePayerEmail({ guardianEmails: [], studentEmail: null, schoolEmail: null });
    const message = explainRefusal(choice, "Tunde Adewale");
    expect(message).toContain("Tunde Adewale");
    expect(message).toMatch(/parent's record|Settings/i);
  });

  it("never repeats the provider's own wording, which taught nobody anything", () => {
    const choice = choosePayerEmail({ guardianEmails: ["a@b.invalid"], studentEmail: null, schoolEmail: null });
    expect(explainRefusal(choice, "Tunde")).not.toMatch(/Invalid Email Address Passed/i);
  });
});

describe("isUsablePayerEmail", () => {
  it("is the single question every caller asks", () => {
    expect(isUsablePayerEmail("mum@gmail.com")).toBe(true);
    expect(isUsablePayerEmail("fees@school.invalid")).toBe(false);
    expect(isUsablePayerEmail(undefined)).toBe(false);
  });
});
