import { brandRamp, brandingStyle, type Branding } from "./branding";

const BRANDING: Branding = {
  schoolSlug: "st-marys",
  schoolName: "St Mary's College",
  tagline: "Learning with purpose",
  logoUrl: null,
  primaryColor: "#1d4ed8",
  accentColor: "#0f766e",
  onPrimaryColor: "#ffffff",
};

describe("brandRamp", () => {
  it("puts the school's exact colour at 600, where the buttons read it", () => {
    expect(brandRamp("#1d4ed8")["--brand-600"]).toBe("29 78 216");
  });

  it("emits space-separated triplets, the only form Tailwind can add alpha to", () => {
    for (const value of Object.values(brandRamp("#1d4ed8"))) {
      expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });

  it("gets lighter towards 50 and darker towards 900", () => {
    const ramp = brandRamp("#1d4ed8");
    const sum = (triplet: string) => triplet.split(" ").reduce((total, n) => total + Number(n), 0);

    expect(sum(ramp["--brand-50"])).toBeGreaterThan(sum(ramp["--brand-500"]));
    expect(sum(ramp["--brand-500"])).toBeGreaterThan(sum(ramp["--brand-600"]));
    expect(sum(ramp["--brand-600"])).toBeGreaterThan(sum(ramp["--brand-900"]));
  });

  it("stays in range at both extremes rather than producing negative channels", () => {
    for (const hex of ["#000000", "#ffffff"]) {
      for (const value of Object.values(brandRamp(hex))) {
        for (const channel of value.split(" ").map(Number)) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("accepts shorthand hex, which is what a colour input may hand back", () => {
    expect(brandRamp("#abc")["--brand-600"]).toBe("170 187 204");
  });
});

describe("brandingStyle", () => {
  it("declares every ramp stop plus the on-brand colour and the gradient", () => {
    const css = brandingStyle(BRANDING);
    for (const stop of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(css).toContain(`--brand-${stop}:`);
    }
    expect(css).toContain("--on-brand: 255 255 255;");
    expect(css).toContain("--brand-gradient: linear-gradient(");
  });

  it("scopes the whole thing to :root and closes the block", () => {
    const css = brandingStyle(BRANDING);
    expect(css.startsWith(":root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css.match(/\{/g)).toHaveLength(1);
  });

  it("carries the school's own colours into the gradient", () => {
    const css = brandingStyle(BRANDING);
    expect(css).toContain("rgb(29 78 216)");
    expect(css).toContain("rgb(15 118 110)");
  });

  it("cannot be used to inject a stylesheet through a colour field", () => {
    // This string is what a loosened API validation would let through. It
    // must not appear in the output — every value is rebuilt as numbers.
    const hostile: Branding = {
      ...BRANDING,
      primaryColor: "#fff;} body{display:none} :root{--x:",
    };

    const css = brandingStyle(hostile);
    expect(css).not.toContain("display:none");
    expect(css).not.toContain("body{");
    expect(css.match(/\{/g)).toHaveLength(1);
  });
});
