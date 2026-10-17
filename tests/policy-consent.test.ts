import { describe, it, expect } from "vitest";
import { validateConsent } from "../src/policy/consent";
import { POLICY_VERSION, CHECKOUT_CONSENT_LABEL, FULL_POLICY, INVOICE_FOOTER, PAYMENT_VERIFICATION_RULE, ALLERGEN_NOTICE } from "../src/policy/content";

describe("validateConsent", () => {
  const now = new Date("2026-10-16T09:00:00Z");
  it("accepts true + current version, stamps server time", () => {
    expect(validateConsent({ acceptedPolicy: true, policyVersion: POLICY_VERSION }, now)).toEqual({ ok: true, record: { policyVersion: POLICY_VERSION, acceptedAt: now } });
  });
  it.each([false, "true", 1, "on", null, undefined])("rejects acceptedPolicy=%j", (v) => {
    const r = validateConsent({ acceptedPolicy: v, policyVersion: POLICY_VERSION });
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("NOT_ACCEPTED");
  });
  it("rejects stale or missing version", () => {
    for (const v of ["old", "", undefined]) {
      const r = validateConsent({ acceptedPolicy: true, policyVersion: v });
      expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("STALE_POLICY");
    }
  });
});

describe("policy wording (owner-supplied, must not drift)", () => {
  it("checkout label has the four key rules", () => {
    for (const s of ["Fresh meals cannot be cancelled after cooking starts", "Less than 24 hours no refund", "Delivery fees non-refundable", "within 2 hours with photo"])
      expect(CHECKOUT_CONSENT_LABEL).toContain(s);
  });
  it("invoice footer carries the 80/50/25 ladder and phone", () => {
    for (const s of ["72h+ 80%", "48-72h 50%", "24-48h 25%", "08033729125"]) expect(INVOICE_FOOTER).toContain(s);
  });
  it("full policy bulk table matches the ladder used by code", () => {
    const bulk = FULL_POLICY.sections.find((s) => s.heading.startsWith("2."))!;
    expect(bulk.table!.rows.map((r) => r[1])).toEqual(["80% refund", "50% refund", "25% refund", "Non-refundable"]);
  });
  it("fraud rule and allergen notice present", () => {
    expect(PAYMENT_VERIFICATION_RULE.body).toContain("not verified in our bank statement");
    expect(ALLERGEN_NOTICE).toContain("cannot guarantee a completely allergen-free environment");
  });
});
