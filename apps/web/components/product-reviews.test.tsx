import { render, screen } from "@testing-library/react";
import { ProductReviews } from "@/components/product-reviews";
import { useAuthStore } from "@/store/auth-store";

const reviewsQuery = { data: undefined as unknown, isLoading: false };
const eligibilityQuery = { data: undefined as unknown };

jest.mock("@/lib/use-reviews", () => ({
  ...jest.requireActual("@/lib/use-reviews"),
  useReviews: () => reviewsQuery,
  useReviewEligibility: () => eligibilityQuery,
  useCreateReview: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateReview: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteReview: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

function page(overrides: Record<string, unknown> = {}) {
  return {
    data: [],
    summary: { average: 0, count: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } },
    meta: { page: 1, limit: 10, total: 0, totalPages: 1 },
    ...overrides,
  };
}

function signIn() {
  useAuthStore.setState({
    accessToken: "token",
    user: { id: "u1", email: "buyer@wisdomshop.example", roles: ["CUSTOMER"] },
    status: "authenticated",
  });
}

describe("ProductReviews", () => {
  beforeEach(() => {
    reviewsQuery.data = page();
    reviewsQuery.isLoading = false;
    eligibilityQuery.data = undefined;
    useAuthStore.setState({ accessToken: null, user: null, status: "unauthenticated" });
  });

  it("shows reviews to a signed-out visitor without offering the form", () => {
    reviewsQuery.data = page({
      data: [
        {
          id: "r1",
          rating: 5,
          title: "Great",
          body: "Really useful.",
          createdAt: "2026-07-31T00:00:00.000Z",
          updatedAt: "2026-07-31T00:00:00.000Z",
          authorName: "Ada L.",
          authorUserId: "u9",
        },
      ],
      summary: { average: 5, count: 1, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 } },
    });

    render(<ProductReviews slug="a-book" />);

    expect(screen.getByText("Great")).toBeInTheDocument();
    expect(screen.getByText("Ada L.")).toBeInTheDocument();
    // Reviews are public; the form is not.
    expect(screen.queryByRole("button", { name: /post review/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("offers the form to a customer who is eligible", () => {
    signIn();
    eligibilityQuery.data = { canReview: true, reason: null, yourReview: null };

    render(<ProductReviews slug="a-book" />);
    expect(screen.getByRole("button", { name: /post review/i })).toBeInTheDocument();
  });

  it("explains why a non-buyer cannot review, instead of a dead form", () => {
    signIn();
    eligibilityQuery.data = { canReview: false, reason: "not-purchased", yourReview: null };

    render(<ProductReviews slug="a-book" />);

    expect(screen.getByText(/only customers who bought this product/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post review/i })).not.toBeInTheDocument();
  });

  it("tells a customer with an unpaid order to wait", () => {
    signIn();
    eligibilityQuery.data = { canReview: false, reason: "order-not-settled", yourReview: null };

    render(<ProductReviews slug="a-book" />);
    expect(screen.getByText(/once your order has been paid for/i)).toBeInTheDocument();
  });

  it("offers edit and remove to someone who already reviewed", () => {
    signIn();
    eligibilityQuery.data = {
      canReview: false,
      reason: "already-reviewed",
      yourReview: {
        id: "r1",
        rating: 4,
        title: "Good",
        body: null,
        createdAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z",
        authorName: "Buy Er",
        authorUserId: "u1",
      },
    };

    render(<ProductReviews slug="a-book" />);

    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    // "You've already reviewed this" would be noise next to Edit/Remove.
    expect(screen.queryByText(/already reviewed this product/i)).not.toBeInTheDocument();
  });

  it("says so plainly when there are no reviews", () => {
    render(<ProductReviews slug="a-book" />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it("gives the rating an accessible name rather than bare stars", () => {
    reviewsQuery.data = page({
      summary: { average: 4.5, count: 2, distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 1 } },
    });

    render(<ProductReviews slug="a-book" />);
    // A screen reader should hear the value, not count glyphs.
    expect(screen.getByRole("img", { name: /rated 4.5 out of 5/i })).toBeInTheDocument();
  });
});
