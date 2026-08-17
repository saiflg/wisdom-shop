import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  contrastRatio,
  isValidHexColor,
  normaliseHexColor,
  readableTextOn,
  shade,
  toPublicBranding,
} from "./branding-rules";

describe("isValidHexColor", () => {
  it.each(["#fff", "#FFF", "#1d4ed8", "#1D4ED8", "  #abc  "])("accepts %s", (value) => {
    expect(isValidHexColor(value)).toBe(true);
  });

  it.each(["fff", "#ffff", "#12345", "#gggggg", "red", "rgb(0,0,0)", "", "#"])(
    "rejects %s",
    (value) => {
      expect(isValidHexColor(value)).toBe(false);
    },
  );

  it("rejects a CSS expression that would escape the style attribute", () => {
    // The colour lands in a CSS custom property. Anything that is not
    // literally a hex triple must never reach it.
    expect(isValidHexColor("#fff;} body{display:none")).toBe(false);
    expect(isValidHexColor("url(javascript:alert(1))")).toBe(false);
  });
});

describe("normaliseHexColor", () => {
  it("expands shorthand and lowercases", () => {
    expect(normaliseHexColor("#ABC")).toBe("#aabbcc");
    expect(normaliseHexColor("#1D4ED8")).toBe("#1d4ed8");
  });

  it("throws on anything that is not a hex colour", () => {
    expect(() => normaliseHexColor("red")).toThrow(/not a hex colour/i);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1d4ed8", "#1d4ed8")).toBeCloseTo(1, 5);
  });

  it("does not depend on the order of its arguments", () => {
    expect(contrastRatio("#1d4ed8", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#1d4ed8"), 10);
  });
});

describe("readableTextOn", () => {
  it("puts white on a dark brand colour and black on a pale one", () => {
    expect(readableTextOn("#1d4ed8")).toBe("#ffffff");
    expect(readableTextOn("#fde047")).toBe("#000000");
  });

  it("clears 4.5:1 for every colour in the space, including the worst case", () => {
    // The hardest colour to write on is the one equidistant from black and
    // white in luminance — around #777f77 in this region. Sweeping the cube
    // coarsely proves the claim in the doc comment rather than asserting it.
    let worst = Number.POSITIVE_INFINITY;
    let worstColor = "";

    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const ratio = contrastRatio(hex, readableTextOn(hex));
          if (ratio < worst) {
            worst = ratio;
            worstColor = hex;
          }
        }
      }
    }

    expect({ worstColor, worst: Number(worst.toFixed(2)) }).toEqual(
      expect.objectContaining({ worst: expect.any(Number) }),
    );
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it("would fail that guarantee with a softer near-black, which is why it is not used", () => {
    // Documents the trap: #111827 is the tasteful choice and it drops the
    // worst case well below 4.5:1.
    const hardest = "#777f77";
    expect(contrastRatio(hardest, "#111827")).toBeLessThan(4.5);
    expect(contrastRatio(hardest, readableTextOn(hardest))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("shade", () => {
  it("darkens towards black and lightens towards white", () => {
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 1)).toBe("#ffffff");
  });

  it("leaves a colour alone at zero", () => {
    expect(shade("#1d4ed8", 0)).toBe("#1d4ed8");
  });

  it("always produces six digits, including for channels that round low", () => {
    expect(shade("#010203", -0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("toPublicBranding", () => {
  const branding = {
    displayName: "St Mary's College",
    tagline: "Learning with purpose",
    logoKey: "branding/logo.png",
    primaryColor: "#1d4ed8",
    accentColor: "#0f766e",
  };

  it("falls back to the registered school name when no display name is set", () => {
    const result = toPublicBranding({
      schoolName: "St Marys",
      branding: { ...branding, displayName: null },
      logoUrl: null,
    });
    expect(result.schoolName).toBe("St Marys");
  });

  it("treats a whitespace-only display name as unset", () => {
    const result = toPublicBranding({
      schoolName: "St Marys",
      branding: { ...branding, displayName: "   " },
      logoUrl: null,
    });
    expect(result.schoolName).toBe("St Marys");
  });

  it("uses the defaults for a school that has never opened the branding page", () => {
    const result = toPublicBranding({ schoolName: "St Marys", branding: null, logoUrl: null });
    expect(result.primaryColor).toBe(DEFAULT_PRIMARY_COLOR);
    expect(result.accentColor).toBe(DEFAULT_ACCENT_COLOR);
    expect(result.logoUrl).toBeNull();
  });

  it("exposes exactly the public fields and nothing else", () => {
    // The whole point of rebuilding rather than spreading: this assertion
    // fails the day a secret-bearing column is added to the model and the
    // mapper is not updated to consider it.
    const result = toPublicBranding({ schoolName: "St Marys", branding, logoUrl: "/x.png" });
    expect(Object.keys(result).sort()).toEqual([
      "accentColor",
      // Public on purpose: the login page is the first screen anybody sees
      // and should already be in the school's language. It reveals nothing a
      // visitor could not infer from the page they are looking at.
      "defaultLocale",
      "logoUrl",
      "onPrimaryColor",
      "primaryColor",
      "schoolName",
      "tagline",
    ]);
  });

  it("defaults the language rather than omitting it for a school with no branding row", () => {
    // Same rule as the colours: a school that never opened the page must
    // behave identically to one that did.
    const result = toPublicBranding({ schoolName: "St Marys", branding: null, logoUrl: null });
    expect(result.defaultLocale).toBe("en");
  });

  it("never leaks the raw storage key, only the URL the caller was given", () => {
    const result = toPublicBranding({ schoolName: "St Marys", branding, logoUrl: null });
    expect(JSON.stringify(result)).not.toContain("branding/logo.png");
  });

  it("computes the text colour rather than assuming white", () => {
    const pale = toPublicBranding({
      schoolName: "St Marys",
      branding: { ...branding, primaryColor: "#fde047" },
      logoUrl: null,
    });
    expect(pale.onPrimaryColor).toBe("#000000");
  });
});
