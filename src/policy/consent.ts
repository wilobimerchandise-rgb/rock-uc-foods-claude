import { POLICY_VERSION } from "./content";

export interface ConsentInput { acceptedPolicy: unknown; policyVersion: unknown }
export type ConsentResult =
  | { ok: true; record: { policyVersion: string; acceptedAt: Date } }
  | { ok: false; code: "NOT_ACCEPTED" | "STALE_POLICY"; message: string };

/**
 * Server-side gate for the pay button. The checkbox must be literally `true` (not "true", 1 or "on"),
 * and the version the shopper saw must match the live version. Timestamp comes from the server clock.
 */
export function validateConsent(input: ConsentInput, now: Date = new Date()): ConsentResult {
  if (input.acceptedPolicy !== true) {
    return { ok: false, code: "NOT_ACCEPTED", message: "Please tick the Refund & Cancellation Policy box to continue." };
  }
  if (input.policyVersion !== POLICY_VERSION) {
    return { ok: false, code: "STALE_POLICY", message: "Our policy was updated. Please review it and tick the box again." };
  }
  return { ok: true, record: { policyVersion: POLICY_VERSION, acceptedAt: now } };
}
