/**
 * Renders the dashboard in Arabic.
 *
 * The first screen anybody sees after signing in, and it is almost entirely
 * numbers: eight stat cards, each a count. Every one of them went through
 * String(value) and came out in Latin digits, on a page whose money and
 * dates had already moved to Arabic ones.
 */

import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import DashboardPage from "./page";

const list = (n: number) => ({ data: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, status: "PUBLISHED" })) });

jest.mock("@/lib/use-students", () => ({ useStudents: () => list(12) }));
jest.mock("@/lib/use-teachers", () => ({ useTeachers: () => list(4) }));
jest.mock("@/lib/use-classes", () => ({ useClasses: () => list(3) }));
jest.mock("@/lib/use-subjects", () => ({ useSubjects: () => list(9) }));
jest.mock("@/lib/use-schemes-of-work", () => ({ useSchemesOfWork: () => list(2) }));
jest.mock("@/lib/use-lesson-plans", () => ({ useLessonPlans: () => list(5) }));
jest.mock("@/lib/use-quizzes", () => ({ useQuizzes: () => list(7) }));
jest.mock("@/lib/use-curriculum-settings", () => ({
  useCurriculumSettings: () => ({ data: { mode: "HYBRID" } }),
}));
jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "u1", firstName: "Amina", roles: ["SCHOOL_ADMIN"] } }),
}));
jest.mock("@/lib/branding-context", () => ({ useBranding: () => ({ schoolName: "Demo Academy" }) }));
jest.mock("@/components/gateway-health-banner", () => ({ GatewayHealthBanner: () => null }));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <DashboardPage />
    </I18nProvider>,
  );
}

describe("the dashboard in Arabic", () => {
  it("labels every stat card in Arabic", () => {
    renderArabic();

    for (const key of ["dashboard.title", "dashboard.students", "dashboard.teachers", "dashboard.classes",
                       "dashboard.subjects", "dashboard.curriculum", "dashboard.lessonPlans",
                       "dashboard.quizzes", "dashboard.curriculumMode"] as const) {
      expect(screen.getByText(translate("ar", key))).toBeInTheDocument();
    }
  });

  it("counts in Arabic digits, not Latin ones", () => {
    const { container } = renderArabic();
    const text = container.textContent ?? "";

    // Twelve students, four teachers, nine subjects: ١٢، ٤، ٩.
    expect(text).toContain("١٢");
    expect(text).toContain("٩");
    expect(text).not.toMatch(/\b12\b/);
    expect(text).not.toMatch(/\b\d+ published\b/);
  });

  it("leaves no English sentence on the screen", () => {
    const { container } = renderArabic();

    const text = (container.textContent ?? "").replace(/Demo Academy|Amina/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });
});
