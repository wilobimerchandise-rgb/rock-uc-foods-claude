// Single source of truth for policy wording. Website, checkout, invoice and PDF all import from here.
// Bump POLICY_VERSION whenever any text below changes; acceptances are stored against the version.
export const POLICY_VERSION = "2026-10-16.1";
export const BUSINESS = { name: "ROCK UC FOODS", city: "Lagos, Nigeria", phone: "08033729125", tz: "Africa/Lagos" } as const;
export const SITE_URL = process.env.SITE_URL ?? "https://rockucfoods.com"; // owner to confirm the real domain

export const CHECKOUT_CONSENT_LABEL =
  "I agree to the Refund & Cancellation Policy: Fresh meals cannot be cancelled after cooking starts. " +
  "Bulk orders: Less than 24 hours no refund. Delivery fees non-refundable. " +
  "Quality issues must be reported within 2 hours with photo.";
export const CHECKOUT_CONSENT_LINK_TEXT = "Read full policy";
export const POLICY_PATH = "/refund-policy";

export const PAYMENT_VERIFICATION_RULE = {
  title: "Payment Verification Rule (Fraud Prevention)",
  body:
    "Per our policy, refunds are only processed for verified payments. Fake alerts/screenshots not verified in our bank " +
    "statement will not be refunded or cooked. This protects you and us.",
} as const;

export const YOUR_RIGHTS = {
  title: "Your Rights",
  body:
    "Nothing in this policy removes your rights under the Federal Competition and Consumer Protection Act (FCCPA), " +
    "enforced by the FCCPC. For unresolved disputes, contact us first. We aim to resolve within 48 hours.",
  signoff: `${BUSINESS.name} | ${BUSINESS.city}  Tel: ${BUSINESS.phone}`,
} as const;

export const HOW_TO_REQUEST_REFUND = {
  title: "How to Request a Refund",
  lines: [
    `WhatsApp ${BUSINESS.phone}. Subject: REFUND - Order RUC-XXXX`,
    "Include Order ID, reason, photo if quality issue.",
    "We acknowledge within 4 hours (9am-8pm).",
    "Bank transfer: Refund in 24-48 hours.",
  ],
} as const;

export const INVOICE_FOOTER =
  "Cancellation: Fresh orders non-cancellable after cooking. Bulk Orders: 72h+ 80% refund, 48-72h 50%, 24-48h 25%, " +
  "Less than 24h no refund. Refunds: 48h (bank transfer). Issues: report within 2h with photo via " +
  `${BUSINESS.phone}. Full policy at ${SITE_URL.replace(/^https?:\/\//, "")}${POLICY_PATH}.`;

export const ALLERGEN_NOTICE =
  "If you have any severe allergy, please contact us on WhatsApp 08033729125 before ordering. We will advise if we can " +
  "prepare your meal safely. We cannot guarantee a completely allergen-free environment.";

export interface PolicyTable { heading: string; columns: [string, string]; rows: [string, string][] }
export interface PolicySection { heading: string; paragraphs?: string[]; bullets?: string[]; table?: PolicyTable; note?: string }

export const FULL_POLICY: { title: string; intro: string[]; sections: PolicySection[] } = {
  title: "ROCK UC FOODS - REFUND & CANCELLATION POLICY",
  intro: [
    `Contact: ${BUSINESS.phone} | Timezone: ${BUSINESS.tz}`,
    "Fresh, perishable and made-to-order. All meals are cooked after verified payment only. Fake alert / screenshots are not proof. No cooking, no refund until payment is verified in our bank.",
  ],
  sections: [
    {
      heading: "GENERAL RULES",
      bullets: [
        "No returns after collection or delivery.",
        "Delivery fee is non-refundable unless failure is ours.",
        "Refunds go to original verified payment method only.",
        "Report quality issues within 2-hour window with photo evidence.",
      ],
    },
    {
      heading: "1. FRESH MEAL ORDERS (1-20 packs)",
      table: {
        heading: "Fresh meal orders",
        columns: ["When You Cancel", "What Happens"],
        rows: [
          ["Within 30 mins AND before cooking started", "100% refund of food + delivery fee"],
          ["After cooking started or >30 mins", "Non-refundable. You may send someone to collect"],
          ["Wrong address / phone off / refused delivery", "Non-refundable. Marked delivered after 2 calls + 15 min wait"],
          ["We cancel / out of stock", "100% refund including delivery fee"],
        ],
      },
    },
    {
      heading: "2. BULK & EVENT ORDERS (21+ packs, Trays, Live Cooking)",
      table: {
        heading: "Bulk and event orders",
        columns: ["Notice Before Event", "Refund"],
        rows: [
          ["72 hours or more", "80% refund"],
          ["48-72 hours", "50% refund"],
          ["24-48 hours", "25% refund"],
          ["Less than 24 hours / Same day", "Non-refundable"],
        ],
      },
      note: "Guest count changes allowed up to 48h before event.",
    },
    {
      heading: "3. QUALITY ISSUES",
      paragraphs: ["Must report within 2-hour window with Order ID + photo evidence. Keep 50% of food."],
      bullets: [
        "Valid: Spoilage, foreign object, wrong order from us = Replace same day OR 50-100% refund/credit.",
        "Not valid: Taste preference, late due to wrong address or flood beyond control = Non-refundable.",
      ],
    },
    {
      heading: "4. DELIVERY FAILURE BY US",
      paragraphs: [
        "If driver exceeds confirmed window by 90 mins with no contact: 100% refund including delivery fee OR accept late with 20% credit.",
      ],
    },
    { heading: "5. HOW TO REQUEST REFUND", paragraphs: [...HOW_TO_REQUEST_REFUND.lines] },
  ],
};
