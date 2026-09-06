/**
 * Renders the students screen in Arabic, and makes its form refuse a submit.
 *
 * The reason this page rather than another: it carries the schemaFor(t)
 * factory that thirteen files were converted to. A zod schema built at module
 * scope freezes its messages at import, when no language has been chosen yet,
 * so before that change every validation message in the app would have stayed
 * English no matter what the reader picked. Nothing proves the fix except
 * making a real form reject a real submit and reading what it says.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { translate } from "@/lib/i18n";
import StudentsPage from "./page";

jest.mock("@/lib/use-students", () => ({
  useStudents: () => ({ data: [], isLoading: false, error: null }),
  useCreateStudent: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/lib/branding-context", () => ({
  useBranding: () => ({ schoolName: "Demo Academy" }),
}));
// Renders its children: the "new student" button is passed into this bar
// rather than sitting beside it, so stubbing the bar out hides the button.
jest.mock("@/components/data-exchange-bar", () => ({
  DataExchangeBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

function renderArabic() {
  window.localStorage.setItem("wisdom-campus-locale", "ar");
  return render(
    <I18nProvider>
      <StudentsPage />
    </I18nProvider>,
  );
}

describe("the students screen in Arabic", () => {
  it("shows the heading and the empty state in Arabic", () => {
    renderArabic();

    expect(screen.getByText(translate("ar", "students.title"))).toBeInTheDocument();
    expect(screen.getByText(translate("ar", "students.none"))).toBeInTheDocument();
  });

  it("refuses an empty submit in Arabic, not in English", async () => {
    const user = userEvent.setup();
    renderArabic();

    await user.click(screen.getByRole("button", { name: translate("ar", "students.new") }));
    await user.click(screen.getByRole("button", { name: translate("ar", "students.create") }));

    // These come out of the zod schema, which is why they are the point of
    // this test: they are built from `t` inside the component, and would be
    // English here if the schema had stayed at module scope.
    await waitFor(() => {
      expect(screen.getByText(translate("ar", "students.errorFirstName"))).toBeInTheDocument();
    });
    expect(screen.getByText(translate("ar", "students.errorLastName"))).toBeInTheDocument();
  });

  it("leaves no English sentence on the screen, form open", async () => {
    const user = userEvent.setup();
    const { container } = renderArabic();

    await user.click(screen.getByRole("button", { name: translate("ar", "students.new") }));

    // The admission-number example is built from the school's own name, which
    // the school typed and which is not ours to translate.
    const text = (container.textContent ?? "").replace(/Demo Academy|DEM[A-Z/0-9-]*/g, " ");
    expect(text.match(/[A-Za-z]{2,}\s+[A-Za-z]{2,}/g) ?? []).toEqual([]);
  });
});
