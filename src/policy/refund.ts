import { type Kobo, percentOfBps } from "../lib/money";

export const FRESH_MAX_PACKS = 20; // 1-20 packs = fresh; 21+ (or trays/live cooking) = bulk/event
export const FRESH_CANCEL_WINDOW_MS = 30 * 60 * 1000;
const HOUR_MS = 3_600_000;

export type OrderClass = "fresh" | "bulk";

export function classifyOrder(packs: number, opts: { isTray?: boolean; isLiveCooking?: boolean } = {}): OrderClass {
  if (!Number.isInteger(packs) || packs < 1) throw new RangeError("packs must be an integer >= 1");
  return packs > FRESH_MAX_PACKS || opts.isTray || opts.isLiveCooking ? "bulk" : "fresh";
}

/** Bulk refund in basis points. Lower bound inclusive: exactly 72h => 80%, exactly 48h => 50%, exactly 24h => 25%. */
export function bulkRefundBps(msBeforeEvent: number): number {
  if (!Number.isFinite(msBeforeEvent) || msBeforeEvent < 0) return 0;
  if (msBeforeEvent >= 72 * HOUR_MS) return 8000;
  if (msBeforeEvent >= 48 * HOUR_MS) return 5000;
  if (msBeforeEvent >= 24 * HOUR_MS) return 2500;
  return 0;
}

export type CancelBy = "customer" | "us";

export interface RefundInput {
  orderClass: OrderClass;
  cancelledBy: CancelBy;
  foodKobo: Kobo;            // food subtotal (server-computed, never client-supplied)
  deliveryFeeKobo: Kobo;     // 0n when none/not yet confirmed
  verifiedPaidKobo: Kobo;    // ONLY payments verified in the bank statement
  placedAt: Date;
  cancelRequestedAt: Date;
  cookingStartedAt: Date | null;
  eventAt?: Date | null;     // required for bulk
}

export interface RefundResult { refundKobo: Kobo; foodRefundKobo: Kobo; deliveryRefundKobo: Kobo; reason: string }

const none = (reason: string): RefundResult => ({ refundKobo: 0n, foodRefundKobo: 0n, deliveryRefundKobo: 0n, reason });

/** Cap a food+delivery refund at what was actually verified as paid. */
function capped(food: Kobo, delivery: Kobo, paid: Kobo, reason: string): RefundResult {
  if (paid <= 0n) return none("No verified payment: nothing to refund");
  let f = food, d = delivery;
  if (f + d > paid) {
    // Reduce delivery first, then food, so the total never exceeds verified money received.
    const over = f + d - paid;
    const dCut = over < d ? over : d;
    d -= dCut;
    f -= over - dCut;
  }
  return { refundKobo: f + d, foodRefundKobo: f, deliveryRefundKobo: d, reason };
}

export function computeRefund(i: RefundInput): RefundResult {
  if (i.foodKobo < 0n || i.deliveryFeeKobo < 0n || i.verifiedPaidKobo < 0n) throw new RangeError("negative kobo");
  if (i.cancelRequestedAt.getTime() < i.placedAt.getTime()) throw new RangeError("cancel request is before order time");
  if (i.orderClass === "bulk" && !i.eventAt) throw new RangeError("eventAt is required for bulk orders");
  if (i.cancelledBy === "us") {
    return capped(i.foodKobo, i.deliveryFeeKobo, i.verifiedPaidKobo, "We cancelled / out of stock: 100% including delivery fee");
  }
  if (i.orderClass === "fresh") {
    const elapsed = i.cancelRequestedAt.getTime() - i.placedAt.getTime();
    const cookingStarted = i.cookingStartedAt !== null && i.cookingStartedAt.getTime() <= i.cancelRequestedAt.getTime();
    if (!cookingStarted && elapsed <= FRESH_CANCEL_WINDOW_MS) {
      return capped(i.foodKobo, i.deliveryFeeKobo, i.verifiedPaidKobo, "Within 30 mins and before cooking: 100% of food and delivery fee");
    }
    return none("After cooking started or more than 30 mins: non-refundable");
  }
  const bps = bulkRefundBps(i.eventAt!.getTime() - i.cancelRequestedAt.getTime());
  if (bps === 0) return none("Less than 24 hours before event: non-refundable");
  // Assumption (owner to confirm): the percentage applies to the food subtotal; delivery fee is non-refundable.
  return capped(percentOfBps(i.foodKobo, bps), 0n, i.verifiedPaidKobo, `Bulk order: ${bps / 100}% of food`);
}

/** Delivery may be marked delivered after 2 call attempts and a 15 minute wait counted from the FIRST failed call. */
export function canMarkDeliveredAfterFailedContact(callAttempts: number, firstFailedCallAt: Date, now: Date): boolean {
  return callAttempts >= 2 && now.getTime() - firstFailedCallAt.getTime() >= 15 * 60 * 1000;
}

/** Quality issues must be reported within 2 hours of delivery/collection. */
export function isWithinQualityWindow(deliveredAt: Date, reportedAt: Date): boolean {
  const d = reportedAt.getTime() - deliveredAt.getTime();
  return d >= 0 && d <= 2 * HOUR_MS;
}
