import { describe, it, expect } from "vitest";
import { bulkRefundBps, classifyOrder, computeRefund, canMarkDeliveredAfterFailedContact, isWithinQualityWindow, type RefundInput } from "../src/policy/refund";

const H = 3_600_000;
const t0 = new Date("2026-10-20T10:00:00Z");
const at = (mins: number) => new Date(t0.getTime() + mins * 60000);

describe("bulkRefundBps boundaries (policy table, lower bound inclusive)", () => {
  it.each([
    [100 * H, 8000], [72 * H, 8000], [72 * H - 1, 5000], [48 * H, 5000], [48 * H - 1, 2500],
    [24 * H, 2500], [24 * H - 1, 0], [0, 0], [-5, 0], [NaN, 0],
  ])("%s ms before -> %s bps", (ms, bps) => expect(bulkRefundBps(ms)).toBe(bps));
});

describe("classifyOrder", () => {
  it("20 packs fresh, 21 bulk, tray/live cooking bulk", () => {
    expect(classifyOrder(20)).toBe("fresh");
    expect(classifyOrder(21)).toBe("bulk");
    expect(classifyOrder(1, { isTray: true })).toBe("bulk");
    expect(classifyOrder(5, { isLiveCooking: true })).toBe("bulk");
  });
  it("rejects 0 and fractions", () => { expect(() => classifyOrder(0)).toThrow(); expect(() => classifyOrder(2.5)).toThrow(); });
});

const fresh = (o: Partial<RefundInput> = {}): RefundInput => ({
  orderClass: "fresh", cancelledBy: "customer", foodKobo: 500000n, deliveryFeeKobo: 100000n,
  verifiedPaidKobo: 600000n, placedAt: t0, cancelRequestedAt: at(10), cookingStartedAt: null, ...o,
});

describe("fresh orders", () => {
  it("within 30 mins and not cooking: 100% food + delivery", () => {
    const r = computeRefund(fresh());
    expect([r.foodRefundKobo, r.deliveryRefundKobo, r.refundKobo]).toEqual([500000n, 100000n, 600000n]);
  });
  it("exactly 30 minutes is still allowed; 30m+1s is not", () => {
    expect(computeRefund(fresh({ cancelRequestedAt: at(30) })).refundKobo).toBe(600000n);
    expect(computeRefund(fresh({ cancelRequestedAt: new Date(at(30).getTime() + 1000) })).refundKobo).toBe(0n);
  });
  it("cooking started: nothing even inside 30 mins", () => {
    expect(computeRefund(fresh({ cookingStartedAt: at(5) })).refundKobo).toBe(0n);
  });
  it("cooking marked after the cancel request does not block the refund", () => {
    expect(computeRefund(fresh({ cookingStartedAt: at(20) })).refundKobo).toBe(600000n);
  });
  it("we cancel: 100% even after cooking and >30 mins", () => {
    expect(computeRefund(fresh({ cancelledBy: "us", cookingStartedAt: at(5), cancelRequestedAt: at(90) })).refundKobo).toBe(600000n);
  });
  it("never refunds more than verified money (only 70% deposit verified)", () => {
    const r = computeRefund(fresh({ verifiedPaidKobo: 420000n })); // 70% of 600000
    expect(r.refundKobo).toBe(420000n);
    expect(r.foodRefundKobo + r.deliveryRefundKobo).toBe(420000n);
  });
  it("no verified payment (fake screenshot): nothing", () => {
    expect(computeRefund(fresh({ verifiedPaidKobo: 0n })).refundKobo).toBe(0n);
    expect(computeRefund(fresh({ cancelledBy: "us", verifiedPaidKobo: 0n })).refundKobo).toBe(0n);
  });
  it("cancel before order time throws", () => { expect(() => computeRefund(fresh({ cancelRequestedAt: at(-1) }))).toThrow(); });
  it("negative inputs throw", () => { expect(() => computeRefund(fresh({ foodKobo: -1n }))).toThrow(); });
});

describe("bulk orders (food ₦100,000.00 = 10,000,000 kobo, delivery ₦5,000 non-refundable)", () => {
  const event = new Date("2026-10-30T12:00:00Z");
  const bulk = (hoursBefore: number, o: Partial<RefundInput> = {}): RefundInput => ({
    orderClass: "bulk", cancelledBy: "customer", foodKobo: 10_000_000n, deliveryFeeKobo: 500_000n,
    verifiedPaidKobo: 10_500_000n, placedAt: t0, cancelRequestedAt: new Date(event.getTime() - hoursBefore * H),
    cookingStartedAt: null, eventAt: event, ...o,
  });
  it.each([[73, 8_000_000n], [72, 8_000_000n], [71.99, 5_000_000n], [48, 5_000_000n], [47, 2_500_000n], [24, 2_500_000n], [23.99, 0n], [1, 0n]])(
    "%s h before -> %s kobo", (h, k) => expect(computeRefund(bulk(h)).refundKobo).toBe(k));
  it("delivery fee is not refunded on customer cancellation", () => {
    expect(computeRefund(bulk(100)).deliveryRefundKobo).toBe(0n);
  });
  it("capped at verified deposit only (70% = 7,350,000 paid, 80% of food = 8,000,000 -> 7,350,000)", () => {
    expect(computeRefund(bulk(100, { verifiedPaidKobo: 7_350_000n })).refundKobo).toBe(7_350_000n);
  });
  it("we cancel bulk: 100% incl. delivery", () => {
    expect(computeRefund(bulk(1, { cancelledBy: "us" })).refundKobo).toBe(10_500_000n);
  });
  it("odd kobo rounds half up once: 80% of 1,001 kobo = 800.8 -> 801", () => {
    expect(computeRefund(bulk(100, { foodKobo: 1001n, verifiedPaidKobo: 1001n })).refundKobo).toBe(801n);
  });
  it("missing event date throws", () => { expect(() => computeRefund(bulk(100, { eventAt: null }))).toThrow(); });
});

describe("delivery failure and quality windows", () => {
  it("needs 2 calls AND 15 minutes", () => {
    expect(canMarkDeliveredAfterFailedContact(2, t0, at(15))).toBe(true);
    expect(canMarkDeliveredAfterFailedContact(1, t0, at(60))).toBe(false);
    expect(canMarkDeliveredAfterFailedContact(2, t0, at(14))).toBe(false);
  });
  it("2-hour quality window inclusive, future/negative rejected", () => {
    expect(isWithinQualityWindow(t0, new Date(t0.getTime() + 2 * H))).toBe(true);
    expect(isWithinQualityWindow(t0, new Date(t0.getTime() + 2 * H + 1))).toBe(false);
    expect(isWithinQualityWindow(t0, new Date(t0.getTime() - 1))).toBe(false);
  });
});

describe("regressions found in review", () => {
  const t1 = new Date("2026-10-20T10:00:00Z");
  const m = (mins: number) => new Date(t1.getTime() + mins * 60000);
  it("we cancel with only the 70% deposit verified: parts add up to the refund and never exceed money received", () => {
    const r = computeRefund({ orderClass: "fresh", cancelledBy: "us", foodKobo: 500000n, deliveryFeeKobo: 100000n,
      verifiedPaidKobo: 420000n, placedAt: t1, cancelRequestedAt: m(90), cookingStartedAt: m(5) });
    expect(r.refundKobo).toBe(420000n);
    expect(r.foodRefundKobo + r.deliveryRefundKobo).toBe(420000n);
  });
  it("overpayment is not refunded beyond what was owed", () => {
    const r = computeRefund({ orderClass: "fresh", cancelledBy: "us", foodKobo: 500000n, deliveryFeeKobo: 0n,
      verifiedPaidKobo: 900000n, placedAt: t1, cancelRequestedAt: m(10), cookingStartedAt: null });
    expect(r.refundKobo).toBe(500000n);
  });
  it("zero food and zero delivery inside 30 minutes does not crash (no divide by zero)", () => {
    const r = computeRefund({ orderClass: "fresh", cancelledBy: "customer", foodKobo: 0n, deliveryFeeKobo: 0n,
      verifiedPaidKobo: 0n, placedAt: t1, cancelRequestedAt: m(5), cookingStartedAt: null });
    expect(r.refundKobo).toBe(0n);
  });
  it("2 calls + 15 minutes is counted from the FIRST failed call, not from when the order was placed", () => {
    const firstCall = m(300); // order placed 5 hours earlier
    expect(canMarkDeliveredAfterFailedContact(2, firstCall, m(305))).toBe(false);
    expect(canMarkDeliveredAfterFailedContact(2, firstCall, m(315))).toBe(true);
  });
});
