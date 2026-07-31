import { canDownload } from "./entitlement";

const base = {
  roles: ["CUSTOMER"],
  productVendorUserId: null,
  requestingUserId: "user_1",
  purchasedOrderStatuses: [] as string[],
};

describe("download entitlement", () => {
  describe("customers", () => {
    it.each(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"])(
      "allows a customer whose order is %s",
      (status) => {
        expect(canDownload({ ...base, purchasedOrderStatuses: [status] })).toEqual({ allowed: true });
      },
    );

    it("refuses a customer who never bought it", () => {
      expect(canDownload(base)).toEqual({ allowed: false, reason: "not-purchased" });
    });

    it.each(["PENDING", "CANCELLED", "REFUNDED"])(
      "refuses a customer whose only order is %s",
      (status) => {
        // PENDING has not been paid for; a refunded customer no longer owns
        // what they bought. Both are "you have an order" rather than "you
        // have nothing", so they get a different reason and a different
        // message.
        expect(canDownload({ ...base, purchasedOrderStatuses: [status] })).toEqual({
          allowed: false,
          reason: "order-not-settled",
        });
      },
    );

    it("allows when any one of several orders is settled", () => {
      // A cancelled first attempt followed by a successful purchase must not
      // be held against the customer.
      expect(
        canDownload({ ...base, purchasedOrderStatuses: ["CANCELLED", "PAID"] }),
      ).toEqual({ allowed: true });
    });

    it("refuses when every order is unsettled, however many there are", () => {
      expect(
        canDownload({ ...base, purchasedOrderStatuses: ["PENDING", "CANCELLED", "REFUNDED"] }),
      ).toEqual({ allowed: false, reason: "order-not-settled" });
    });
  });

  describe("staff", () => {
    it.each(["ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR"])(
      "allows %s without a purchase, for support and verification",
      (role) => {
        expect(canDownload({ ...base, roles: [role] })).toEqual({ allowed: true });
      },
    );

    it("does not treat SUPPORT as catalogue staff", () => {
      // SUPPORT can read orders but is not on the catalogue allowlist, so it
      // gets no blanket access to every purchasable file.
      expect(canDownload({ ...base, roles: ["SUPPORT"] })).toEqual({
        allowed: false,
        reason: "not-purchased",
      });
    });
  });

  describe("vendors", () => {
    it("allows the vendor who owns the product", () => {
      expect(
        canDownload({
          ...base,
          roles: ["VENDOR"],
          productVendorUserId: "user_1",
          requestingUserId: "user_1",
        }),
      ).toEqual({ allowed: true });
    });

    it("refuses a different vendor", () => {
      // The headline case: holding the VENDOR role must not open another
      // seller's files.
      expect(
        canDownload({
          ...base,
          roles: ["VENDOR"],
          productVendorUserId: "user_2",
          requestingUserId: "user_1",
        }),
      ).toEqual({ allowed: false, reason: "not-purchased" });
    });

    it("does not match a platform-owned product against a null vendor", () => {
      // A product with no vendor has productVendorUserId null. If that were
      // compared loosely, any user could match it.
      expect(
        canDownload({
          ...base,
          roles: ["VENDOR"],
          productVendorUserId: null,
          requestingUserId: "user_1",
        }),
      ).toEqual({ allowed: false, reason: "not-purchased" });
    });
  });
});
