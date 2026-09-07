/**
 * Renders the attendance screen in Arabic, with a class chosen and one
 * register already taken.
 *
 * The register is the point. An empty page proves the headings translate; a
 * page with a register on it exercises the status chips a teacher actually
 * taps — present, absent, late, excused — and the history underneath, which
 * is where the date and the name of whoever took it appear.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import AttendancePage from "./page";

const CLASS = {
  id: "c1",
  name: "Grade 5",
  academicYear: "2026/2027",
  enrollments: [
    { id: "e1", studentProfile: { id: "sp1", user: { firstName: "Fatima", lastName: "Bello" } } },
  ],
};

const REGISTER = {
  id: "r1",
  date: "2026-09-04T00:00:00.000Z",
  session: null,
  takenBy: null,
  records: [
    {
      id: "rec1",
      status: "LATE",
      note: null,
      amendments: [{ id: "am1", from: "PRESENT", to: "LATE" }],
      studentProfile: { id: "sp1", user: { firstName: "Fatima", lastName: "Bello" } },
    },
  ],
};

jest.mock("@/lib/use-classes", () => ({
  useClasses: () => ({ data: [CLASS] }),
  useClass: () => ({ data: CLASS }),
}));
jest.mock("@/lib/use-attendance", () => ({
  ATTENDANCE_STATUSES: ["PRESENT", "ABSENT", "LATE", "EXCUSED"],
  useAmendAttendance: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useClassRegisters: () => ({ data: [REGISTER] }),
  useTakeRegister: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <AttendancePage />
    </I18nProvider>,
  );
}

describe("the attendance screen in Arabic", () => {
  it("shows the heading and the chooser labels in Arabic", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "attendance.title"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "attendance.date"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "attendance.session"))).toBeInTheDocument();
  });

  // The register and its history only exist once a class is chosen, which is
  // most of the translated surface on this page.
  it("shows the register and the history in Arabic once a class is chosen", async () => {
    const user = userEvent.setup();
    renderArabic();

    await user.selectOptions(screen.getByRole("combobox"), "c1");

    expect(screen.getByText(translate("ar", "attendance.history"))).toBeInTheDocument();
    expect(screen.getAllByText(translate("ar", "attendance.late")).length).toBeGreaterThan(0);
  });

  // Every status a teacher can tap, and the one already recorded. These come
  // from a Record<AttendanceStatus, TranslationKey>, so a status added later
  // without a key would not compile - but a key that exists and is empty
  // would, and that is what this catches.
  it.each(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const)(
    "has an Arabic word for %s",
    (status) => {
      const key = `attendance.${status.toLowerCase()}` as never;
      const word = translate("ar", key);
      expect(word).toBeTruthy();
      expect(word).not.toMatch(/^attendance\./);
      expect(word).not.toMatch(/[A-Za-z]/);
    },
  );

  // The amendment tag was "amended ×2" with a Latin 2 - a number written
  // straight into JSX never passes through translate(), so it stayed in
  // Latin digits beside a date and a count that had both moved to Arabic.
  it("counts amendments in Arabic digits", async () => {
    const user = userEvent.setup();
    const { container } = renderArabic();

    await user.selectOptions(screen.getByRole("combobox"), "c1");

    expect(container.textContent).toContain(translate("ar", "attendance.amended"));
    expect(container.textContent).toMatch(/×[٠-٩]/);
  });

  it("leaves no English sentence on the screen, class chosen", async () => {
    const user = userEvent.setup();
    const { container } = renderArabic();

    await user.selectOptions(screen.getByRole("combobox"), "c1");

    // The class name and the child's name are what the school typed.
    const text = (container.textContent ?? "").replace(/Grade 5|Fatima Bello|2026\/2027/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });
});
