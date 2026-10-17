import { describe, it, expect } from "vitest";
import { parseNairaToKobo, formatKobo, formatNaira, percentOfBps, applyPercentRoundHalfUp, splitDeposit, lineTotal, MAX_KOBO } from "../src/lib/money";

describe("parseNairaToKobo", () => {
  it.each([["1500", 150000n], ["₦1,500", 150000n], ["1500.5", 150050n], ["1 500.05", 150005n], ["0.01", 1n]])(
    "%s -> %s", (s, k) => expect(parseNairaToKobo(s)).toEqual({ ok: true, kobo: k }));
  it("avoids the float trap 0.1+0.2 style: 19.99 is exactly 1999 kobo", () => {
    expect(parseNairaToKobo("19.99")).toEqual({ ok: true, kobo: 1999n });
  });
  it.each(["", "  ", "abc", "-5", "0", "0.00", "1.234", "1e3", "NaN", "₦", "1,5,0.00x", "100000001"])(
    "rejects %j", (s) => expect(parseNairaToKobo(s).ok).toBe(false));
  it("rejects null/undefined/objects", () => {
    for (const v of [null, undefined, {}, []]) expect(parseNairaToKobo(v).ok).toBe(false);
  });
});

describe("formatKobo", () => {
  it.each([[0n, "₦0.00"], [5n, "₦0.05"], [150000n, "₦1,500.00"], [123456789n, "₦1,234,567.89"]])(
    "%s -> %s", (k, s) => expect(formatKobo(k)).toBe(s));
  it("never prints NGN", () => expect(formatKobo(100n)).not.toContain("NGN"));
});

describe("percent and deposit (hand-computed)", () => {
  it("70% of ₦1,000.00 = ₦700.00", () => expect(percentOfBps(100000n, 7000)).toBe(70000n));
  it("rounds half up: 70% of 5 kobo = 3.5 -> 4", () => expect(percentOfBps(5n, 7000)).toBe(4n));
  it("70% of 1 kobo = 0.7 -> 1", () => expect(percentOfBps(1n, 7000)).toBe(1n));
  it("deposit + balance always equals total (odd amounts)", () => {
    for (const t of [1n, 3n, 99n, 12345n, 150001n, 9999999n]) {
      const { deposit, balance } = splitDeposit(t);
      expect(deposit + balance).toBe(t);
    }
  });
  it("₦12,345.67 -> deposit 864197 (8641.969 rounds up), balance 370370", () => {
    expect(splitDeposit(1234567n)).toEqual({ deposit: 864197n, balance: 370370n });
  });
  it("rejects bad bps", () => { expect(() => percentOfBps(1n, 10001)).toThrow(); expect(() => percentOfBps(1n, 1.5)).toThrow(); });
  it("lineTotal", () => { expect(lineTotal(150000n, 3)).toBe(450000n); expect(() => lineTotal(1n, 0)).toThrow(); expect(() => lineTotal(1n, 1.5)).toThrow(); });
});

describe("repo-added cases", () => {
  it("formatNaira alias and integer formatting beyond 2^53 kobo", () => {
    expect(formatNaira(123456789n)).toBe("₦1,234,567.89");
    expect(formatNaira(150000n)).toBe("₦1,500.00");
    expect(formatKobo(9_007_199_254_740_993n)).toBe("₦90,071,992,547,409.93"); // a float would corrupt this
  });
  it("applyPercentRoundHalfUp alias: 7.5% of 333 kobo = 24.975 -> 25; 10% of 970000 = 97000", () => {
    expect(applyPercentRoundHalfUp(333n, 750)).toBe(25n);
    expect(applyPercentRoundHalfUp(970000n, 1000)).toBe(97000n);
  });
  it("negative has its own message", () => {
    expect(parseNairaToKobo("-5")).toEqual({ ok: false, error: "Negative amounts are not allowed" });
  });
  it("accepts numbers from spreadsheets, rejects NaN/Infinity", () => {
    expect(parseNairaToKobo(3500)).toEqual({ ok: true, kobo: 350000n });
    expect(parseNairaToKobo(NaN).ok).toBe(false);
    expect(parseNairaToKobo(Infinity).ok).toBe(false);
  });
  it("the price ceiling equals the database ceiling (10,000,000,000 kobo)", () => {
    expect(MAX_KOBO).toBe(10_000_000_000n);
    expect(parseNairaToKobo("100000000")).toEqual({ ok: true, kobo: 10_000_000_000n });
    expect(parseNairaToKobo("100000000.01").ok).toBe(false);
  });
});
