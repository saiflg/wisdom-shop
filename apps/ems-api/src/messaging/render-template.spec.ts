import {
  buildDedupeKey,
  extractPlaceholders,
  renderTemplate,
  validateTemplate,
  EVENT_PLACEHOLDERS,
} from "./render-template";
import { DEFAULT_TEMPLATES } from "./default-templates";

describe("extractPlaceholders", () => {
  it("finds each distinct placeholder once, in order", () => {
    expect(extractPlaceholders("Hi {{guardianName}}, {{studentName}} and {{studentName}} again")).toEqual([
      "guardianName",
      "studentName",
    ]);
  });

  it("tolerates inner whitespace", () => {
    expect(extractPlaceholders("{{ studentName }}")).toEqual(["studentName"]);
  });

  it("ignores things that only look like placeholders", () => {
    expect(extractPlaceholders("100% {sure} and {{1bad}} and {{}}")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitutes every placeholder", () => {
    const result = renderTemplate("Dear {{guardianName}}, {{studentName}} was absent on {{date}}.", {
      guardianName: "Grace",
      studentName: "Ada",
      date: "3 August",
    });
    expect(result).toEqual({ ok: true, text: "Dear Grace, Ada was absent on 3 August." });
  });

  it("substitutes a repeated placeholder everywhere", () => {
    const result = renderTemplate("{{studentName}} — {{studentName}}", { studentName: "Ada" });
    expect(result.ok && result.text).toBe("Ada — Ada");
  });

  it("refuses rather than producing 'Dear ,'", () => {
    // The case the whole module exists to prevent.
    const result = renderTemplate("Dear {{guardianName}}, your child was absent.", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["guardianName"]);
      expect(result.problem).toContain("{{guardianName}}");
    }
  });

  it("treats an empty or whitespace value as missing, not as a value", () => {
    // An empty string renders exactly the broken message a blank would.
    expect(renderTemplate("Dear {{guardianName}}", { guardianName: "" }).ok).toBe(false);
    expect(renderTemplate("Dear {{guardianName}}", { guardianName: "   " }).ok).toBe(false);
  });

  it("reports every missing placeholder at once, not just the first", () => {
    // A school fixing a template should see the whole problem in one pass.
    const result = renderTemplate("{{a}} {{b}} {{c}}", { b: "here" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["a", "c"]);
  });

  it("does not report the same missing placeholder twice", () => {
    const result = renderTemplate("{{a}} and {{a}}", {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["a"]);
  });

  it("renders a template with no placeholders unchanged", () => {
    expect(renderTemplate("School is closed tomorrow.", {})).toEqual({
      ok: true,
      text: "School is closed tomorrow.",
    });
  });

  it("leaves a legitimate zero or false-looking string alone", () => {
    // "0" is a real amount; only empty means missing.
    const result = renderTemplate("Balance: {{amount}}", { amount: "0" });
    expect(result.ok && result.text).toBe("Balance: 0");
  });

  it("does not re-scan substituted text for placeholders", () => {
    // A parent's name containing braces must not be treated as a template.
    const result = renderTemplate("Dear {{guardianName}}", { guardianName: "{{studentName}}" });
    expect(result.ok && result.text).toBe("Dear {{studentName}}");
  });
});

describe("validateTemplate", () => {
  it("accepts a template using only what its event supplies", () => {
    expect(
      validateTemplate("Dear {{guardianName}}, {{studentName}} was absent on {{date}}", "ATTENDANCE_ABSENT"),
    ).toBeNull();
  });

  it("rejects a placeholder the event never sets, naming the alternatives", () => {
    // Caught when the school saves it, not at 7am when a register is taken.
    const problem = validateTemplate("Invoice {{invoiceNumber}}", "ATTENDANCE_ABSENT");
    expect(problem).toContain("{{invoiceNumber}}");
    expect(problem).toContain("{{studentName}}");
  });

  it("every event's own default placeholders validate against itself", () => {
    for (const [event, placeholders] of Object.entries(EVENT_PLACEHOLDERS)) {
      const body = placeholders.map((p) => `{{${p}}}`).join(" ");
      expect(validateTemplate(body, event as keyof typeof EVENT_PLACEHOLDERS)).toBeNull();
    }
  });
});

describe("the seeded templates", () => {
  // Every school starts with these, and rendering fails closed — so a
  // placeholder typo here is not cosmetic, it is a notification that can
  // never send, found the morning someone takes a register.
  it.each(DEFAULT_TEMPLATES.map((t) => [`${t.event}/${t.channel}`, t] as const))(
    "%s uses only placeholders its event supplies",
    (_name, template) => {
      expect(validateTemplate(template.body, template.event)).toBeNull();
      if (template.subject) expect(validateTemplate(template.subject, template.event)).toBeNull();
    },
  );

  it("renders every seeded template when the event supplies everything", () => {
    for (const template of DEFAULT_TEMPLATES) {
      const context = Object.fromEntries(EVENT_PLACEHOLDERS[template.event].map((name) => [name, "value"]));
      const body = renderTemplate(template.body, context);
      expect(body.ok).toBe(true);
      if (template.subject) expect(renderTemplate(template.subject, context).ok).toBe(true);
    }
  });

  it("gives email templates a subject and leaves SMS without one", () => {
    for (const template of DEFAULT_TEMPLATES) {
      if (template.channel === "EMAIL") expect(template.subject).toBeTruthy();
      if (template.channel === "SMS") expect(template.subject).toBeUndefined();
    }
  });
});

describe("buildDedupeKey", () => {
  it("is stable for the same event and subject", () => {
    // The property that makes notification send-once: repeating the action
    // must produce the same key so the unique index rejects the duplicate.
    const first = buildDedupeKey("ATTENDANCE_ABSENT", ["student-1", "2026-08-03"]);
    const second = buildDedupeKey("ATTENDANCE_ABSENT", ["student-1", "2026-08-03"]);
    expect(first).toBe(second);
  });

  it("separates different students, dates and events", () => {
    const a = buildDedupeKey("ATTENDANCE_ABSENT", ["student-1", "2026-08-03"]);
    expect(a).not.toBe(buildDedupeKey("ATTENDANCE_ABSENT", ["student-2", "2026-08-03"]));
    expect(a).not.toBe(buildDedupeKey("ATTENDANCE_ABSENT", ["student-1", "2026-08-04"]));
    expect(a).not.toBe(buildDedupeKey("RESULTS_PUBLISHED", ["student-1", "2026-08-03"]));
  });

  it("accepts numbers as well as strings", () => {
    expect(buildDedupeKey("FEE_INVOICE_ISSUED", ["inv", 12])).toBe("FEE_INVOICE_ISSUED:inv:12");
  });
});
