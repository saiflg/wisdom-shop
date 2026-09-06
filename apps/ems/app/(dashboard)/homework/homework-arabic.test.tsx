/**
 * Renders the homework screen in Arabic and reads what it actually says.
 *
 * The dictionaries are already proved complete by i18n.test.ts, and
 * no-hardcoded-text.test.ts proves no English is left in the file. Neither
 * of those renders anything. This one does, because "every key resolves"
 * was the same kind of claim that turned out to need checking on the AI
 * teacher — the wiring can be right and the screen still wrong.
 */

import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import HomeworkPage from "./page";

jest.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "u1", roles: ["SCHOOL_ADMIN"] } }),
}));
jest.mock("@/lib/use-classes", () => ({
  useClasses: () => ({ data: [{ id: "c1", name: "Grade 5", academicYear: "2026/2027" }] }),
}));
jest.mock("@/lib/use-subjects", () => ({
  useSubjects: () => ({ data: [{ id: "s1", name: "Mathematics", gradeLevel: "Grade 5" }] }),
}));
jest.mock("@/lib/use-homework", () => ({
  toMarks: (value: number | null) => (value === null ? null : value / 100),
  useAssignment: () => ({ data: null, isLoading: false }),
  // Empty on purpose: the empty state is the one a demo hits first, and it is
  // pure translated prose with no data to hide behind.
  useAssignments: () => ({ data: [], isLoading: false, error: null }),
  useCreateAssignment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useMarkSubmission: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useReleaseMarks: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSubmitWork: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateAssignment: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <HomeworkPage />
    </I18nProvider>,
  );
}

describe("the homework screen in Arabic", () => {
  it("shows the heading and the staff explanation in Arabic", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "homework.title"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "homework.staffIntro"))).toBeInTheDocument();
  });

  it("flips the document to right-to-left", () => {
    renderArabic();

    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });

  it("leaves no English sentence on the screen", () => {
    const { container } = renderArabic();

    // Two or more Latin words in a row. Single words survive deliberately:
    // a class is called "Grade 5" and a subject "Mathematics", both of them
    // data the school typed, and neither ours to translate.
    const english = (container.textContent ?? "").match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? [];
    expect(english).toEqual([]);
  });
});
