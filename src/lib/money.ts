// All money is integer kobo as bigint. Never use Number/float for money.
export type Kobo = bigint;

// ₦100,000,000 sanity ceiling. Must equal the database check on price_kobo (<= 10000000000).
export const MAX_KOBO: Kobo = 10_000_000_000n;

export type ParseResult = { ok: true; kobo: Kobo } | { ok: false; error: string };

/** Parse a typed naira string ("₦1,500", "1500.5", "1 500.00") using integer math only. Rejects 0 and negatives. */
export function parseNairaToKobo(input: unknown): ParseResult {
  if (typeof input !== "string" && typeof input !== "number") {
    return { ok: false, error: "Price is required" };
  }
  if (typeof input === "number" && !Number.isFinite(input)) {
    return { ok: false, error: "Price must be a finite number" };
  }
  let s = String(input).trim();
  if (s === "") return { ok: false, error: "Price is required" };
  if (/e/i.test(s)) return { ok: false, error: "Scientific notation is not allowed" };
  s = s.replace(/^₦/, "").replace(/[,\s]/g, "");
  if (s.startsWith("-")) return { ok: false, error: "Negative amounts are not allowed" };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: "Use digits with at most 2 decimals, e.g. 1500 or 1500.50" };
  }
  const [whole = "0", frac = ""] = s.split(".");
  const kobo = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  if (kobo <= 0n) return { ok: false, error: "Price must be greater than ₦0" };
  if (kobo > MAX_KOBO) return { ok: false, error: "Price is above the allowed maximum" };
  return { ok: true, kobo };
}

/** Display with ₦ and thousands separators, integer math only (no floats). Never "NGN". */
export function formatKobo(kobo: Kobo): string {
  const neg = kobo < 0n;
  const abs = neg ? -kobo : kobo;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}₦${whole}.${frac}`;
}

/** Alias kept so existing imports of formatNaira keep working. */
export const formatNaira = formatKobo;

/** kobo * bps / 10000, rounded half up, once. bps: 7000 = 70%. */
export function percentOfBps(kobo: Kobo, bps: number): Kobo {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError("bps must be an integer 0..10000");
  if (kobo < 0n) throw new RangeError("kobo must be >= 0");
  return (kobo * BigInt(bps) + 5_000n) / 10_000n;
}

/** Alias kept so existing imports of applyPercentRoundHalfUp keep working. */
export const applyPercentRoundHalfUp = percentOfBps;

/** Line total = unit price * quantity (integer qty 1..10000). */
export function lineTotal(unit: Kobo, qty: number): Kobo {
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) throw new RangeError("quantity must be an integer 1..10000");
  return unit * BigInt(qty);
}

/** Deposit rounded half up; balance = total - deposit so the two always sum exactly. */
export function splitDeposit(total: Kobo, depositBps = 7000): { deposit: Kobo; balance: Kobo } {
  const deposit = percentOfBps(total, depositBps);
  return { deposit, balance: total - deposit };
}
