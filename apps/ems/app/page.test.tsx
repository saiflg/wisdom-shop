import { render as renderBare, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import ComingSoonPage from "./page";

// The page reads its words from the dictionary now, so it needs the
// provider - the same harness login-form.test.tsx uses.
const render = (ui: React.ReactElement) => renderBare(<I18nProvider>{ui}</I18nProvider>);

describe("ComingSoonPage", () => {
  it("shows the product name and a way back to the shop", () => {
    render(<ComingSoonPage />);

    expect(screen.getByRole("heading", { name: /wisdom campus/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to wisdom shop/i })).toHaveAttribute(
      "href",
      "http://localhost:3000",
    );
  });

  it("lists the roadmap items rather than clickable features that go nowhere", () => {
    render(<ComingSoonPage />);

    expect(screen.getByText("Wisdom Teacher")).toBeInTheDocument();
    expect(screen.queryAllByRole("link").length).toBe(1);
  });
});
