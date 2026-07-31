import { canReview, summariseRatings } from "./review-policy";

const base = { purchasedOrderStatuses: [] as string[], hasExistingReview: false };

describe("canReview", () => {
  it.each(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"])(
    "allows a customer whose order is %s",
    (status) => {
      expect(canReview({ ...base, purchasedOrderStatuses: [status] })).toEqual({ allowed: true });
    },
  );

  it("refuses someone who never bought it", () => {
    // The whole point of verified-purchase reviews: an account that has not
    // paid for the product cannot rate it.
    expect(canReview(base)).toEqual({ allowed: false, reason: "not-purchased" });
  });

  it.each(["PENDING", "CANCELLED", "REFUNDED"])(
    "refuses a customer whose only order is %s",
    (status) => {
      expect(canReview({ ...base, purchasedOrderStatuses: [status] })).toEqual({
        allowed: false,
        reason: "order-not-settled",
      });
    },
  );

  it("allows when any one order settled", () => {
    expect(
      canReview({ ...base, purchasedOrderStatuses: ["CANCELLED", "PAID"] }),
    ).toEqual({ allowed: true });
  });

  it("refuses a second review from the same person", () => {
    // Otherwise one customer could weight the average by posting repeatedly.
    expect(
      canReview({ purchasedOrderStatuses: ["PAID"], hasExistingReview: true }),
    ).toEqual({ allowed: false, reason: "already-reviewed" });
  });

  it("reports the purchase problem before the duplicate one", () => {
    // Someone who never bought it should be told that, not told they have
    // already reviewed something they cannot review.
    expect(
      canReview({ purchasedOrderStatuses: [], hasExistingReview: true }),
    ).toEqual({ allowed: false, reason: "not-purchased" });
  });
});

describe("summariseRatings", () => {
  it("averages to one decimal place", () => {
    expect(summariseRatings([5, 4]).average).toBe(4.5);
    expect(summariseRatings([5, 4, 4]).average).toBe(4.3);
    expect(summariseRatings([1, 2]).average).toBe(1.5);
  });

  it("counts the distribution", () => {
    const summary = summariseRatings([5, 5, 3, 1]);
    expect(summary.count).toBe(4);
    expect(summary.distribution).toEqual({ "1": 1, "2": 0, "3": 1, "4": 0, "5": 2 });
  });

  it("handles no reviews without dividing by zero", () => {
    const summary = summariseRatings([]);
    expect(summary).toEqual({
      average: 0,
      count: 0,
      distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    });
  });

  it("always reports every bucket, even the empty ones", () => {
    // A histogram missing its zero rows renders as a gap rather than a bar
    // of length zero.
    expect(Object.keys(summariseRatings([5]).distribution).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("ignores a rating outside 1–5 rather than inventing a bucket", () => {
    // The DTO already bounds this; the summary should not crash or grow a
    // "0" key if a stray row ever gets in.
    const summary = summariseRatings([5, 0, 9]);
    expect(Object.keys(summary.distribution).sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(summary.distribution["5"]).toBe(1);
  });
});
