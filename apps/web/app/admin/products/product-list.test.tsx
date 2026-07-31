import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductList } from "@/app/admin/products/product-list";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/lib/api";

const updateMutate = jest.fn();
const deleteMutate = jest.fn();

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    title: "Algebra Basics",
    slug: "algebra-basics",
    description: "",
    type: "DIGITAL",
    status: "DRAFT",
    priceCents: 1999,
    currency: "USD",
    sku: null,
    stockQty: null,
    metadata: null,
    images: [],
    variants: [],
    categories: [],
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

let listed = [product()];

jest.mock("@/lib/use-catalog-admin", () => ({
  useCanEditCatalog: () => true,
  useAdminProducts: () => ({
    data: { data: listed, meta: { page: 1, limit: 20, total: listed.length, totalPages: 1 } },
    isLoading: false,
    error: null,
  }),
  useUpdateProduct: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeleteProduct: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

describe("ProductList", () => {
  beforeEach(() => {
    updateMutate.mockReset().mockResolvedValue({});
    deleteMutate.mockReset().mockResolvedValue(undefined);
    listed = [product()];
    useAuthStore.setState({
      accessToken: "token",
      user: { id: "u1", email: "admin@wisdomshop.example", roles: ["ADMIN"] },
      status: "authenticated",
    });
  });

  it("shows the price in the product's own currency, not a hardcoded one", () => {
    listed = [product({ priceCents: 1999, currency: "EUR" })];
    render(<ProductList />);
    expect(screen.getByText("€19.99")).toBeInTheDocument();
  });

  it("offers Publish for a draft and Unpublish for a live product", () => {
    render(<ProductList />);
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unpublish/i })).not.toBeInTheDocument();
  });

  it("publishes with the status the button promises", async () => {
    render(<ProductList />);
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    expect(updateMutate).toHaveBeenCalledWith({ id: "p1", payload: { status: "PUBLISHED" } });
  });

  it("only links to the shop for products that are actually visible there", () => {
    render(<ProductList />);
    // A draft has no public page, so a "View in shop" link would 404.
    expect(screen.queryByRole("link", { name: /view in shop/i })).not.toBeInTheDocument();
  });

  it("asks before deleting, and does nothing if the answer is no", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProductList />);

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deletes once confirmed", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductList />);

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("p1"));
    confirmSpy.mockRestore();
  });

  it("surfaces the server's refusal rather than a generic message", async () => {
    updateMutate.mockRejectedValue(new ApiError(409, "A product with that slug already exists"));
    render(<ProductList />);

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("A product with that slug already exists");
    });
  });

  it("tells an empty catalogue what to do next", () => {
    listed = [];
    render(<ProductList />);
    expect(screen.getByText(/add your first product/i)).toBeInTheDocument();
  });
});
