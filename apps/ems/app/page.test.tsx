import { render, screen } from "@testing-library/react";
import ComingSoonPage from "./page";

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
