import { resolveRecipients, type GuardianLinkInput } from "./resolve-recipients";

const ADA = "student-ada";
const BOB = "student-bob";

const link = (over: Partial<GuardianLinkInput> = {}): GuardianLinkInput => ({
  guardianUserId: "guardian-grace",
  studentProfileId: ADA,
  guardianName: "Grace One",
  email: "grace@example.com",
  phone: "+2348000000001",
  notifyByEmail: true,
  notifyBySms: true,
  ...over,
});

describe("resolveRecipients", () => {
  it("resolves a linked guardian on email", () => {
    const { recipients } = resolveRecipients([link()], ADA, "EMAIL");
    expect(recipients).toEqual([
      { userId: "guardian-grace", name: "Grace One", address: "grace@example.com", channel: "EMAIL" },
    ]);
  });

  it("uses the phone number on SMS", () => {
    const { recipients } = resolveRecipients([link()], ADA, "SMS");
    expect(recipients[0]?.address).toBe("+2348000000001");
  });

  it("NEVER resolves a guardian of another child", () => {
    // The invariant this module exists for. Passing the whole school's links
    // is the realistic careless call, so it must be safe.
    const links = [
      link({ guardianUserId: "guardian-grace", studentProfileId: ADA, email: "grace@example.com" }),
      link({ guardianUserId: "guardian-gary", studentProfileId: BOB, email: "gary@example.com" }),
    ];

    const forAda = resolveRecipients(links, ADA, "EMAIL");
    expect(forAda.recipients.map((r) => r.address)).toEqual(["grace@example.com"]);
    expect(JSON.stringify(forAda)).not.toContain("gary@example.com");

    const forBob = resolveRecipients(links, BOB, "EMAIL");
    expect(forBob.recipients.map((r) => r.address)).toEqual(["gary@example.com"]);
    expect(JSON.stringify(forBob)).not.toContain("grace@example.com");
  });

  it("does not even report another family's guardian as skipped", () => {
    // Skipped entries are shown to the school in the outbox, so leaking a
    // name there would be the same disclosure by a quieter route.
    const links = [link({ studentProfileId: BOB, guardianName: "Gary Two", notifyByEmail: false })];
    const result = resolveRecipients(links, ADA, "EMAIL");
    expect(result.recipients).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain("Gary");
  });

  it("skips an opted-out guardian with a reason rather than dropping them", () => {
    const result = resolveRecipients([link({ notifyByEmail: false })], ADA, "EMAIL");
    expect(result.recipients).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/opted out/i);
  });

  it("honours the opt-out per channel", () => {
    // A parent who mutes email may still want the text message.
    const muted = link({ notifyByEmail: false, notifyBySms: true });
    expect(resolveRecipients([muted], ADA, "EMAIL").recipients).toHaveLength(0);
    expect(resolveRecipients([muted], ADA, "SMS").recipients).toHaveLength(1);
  });

  it("skips a guardian with no address for that channel", () => {
    const result = resolveRecipients([link({ email: null })], ADA, "EMAIL");
    expect(result.recipients).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/no email address/i);
  });

  it("treats a blank address as no address", () => {
    expect(resolveRecipients([link({ email: "   " })], ADA, "EMAIL").recipients).toHaveLength(0);
  });

  it("resolves both parents of the same child", () => {
    const result = resolveRecipients(
      [
        link({ guardianUserId: "g1", guardianName: "Grace", email: "grace@example.com" }),
        link({ guardianUserId: "g2", guardianName: "George", email: "george@example.com" }),
      ],
      ADA,
      "EMAIL",
    );
    expect(result.recipients.map((r) => r.address)).toEqual(["grace@example.com", "george@example.com"]);
  });

  it("does not message the same address twice", () => {
    // Two links, one shared inbox — the send-once index would catch it, but
    // reporting it as a delivery failure would mislead the school.
    const result = resolveRecipients(
      [
        link({ guardianUserId: "g1", email: "family@example.com" }),
        link({ guardianUserId: "g2", email: "family@example.com" }),
      ],
      ADA,
      "EMAIL",
    );
    expect(result.recipients).toHaveLength(1);
  });

  it("returns nothing for a student with no guardians at all", () => {
    expect(resolveRecipients([], ADA, "EMAIL")).toEqual({ recipients: [], skipped: [] });
  });

  it("ignores the email/SMS opt-out for WhatsApp, which has its own consent model", () => {
    const result = resolveRecipients([link({ notifyByEmail: false, notifyBySms: false })], ADA, "WHATSAPP");
    expect(result.recipients).toHaveLength(1);
  });
});
