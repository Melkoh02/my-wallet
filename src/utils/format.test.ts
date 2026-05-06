import { formatAmountInput, unformatAmount, formatCurrency } from "./format";

describe("formatAmountInput", () => {
  it("strips non-digit/non-dot characters", () => {
    expect(formatAmountInput("ab12c34d")).toBe("1,234");
    expect(formatAmountInput("$1,234.56")).toBe("1,234.56");
  });

  it("adds thousand separators to integer part", () => {
    expect(formatAmountInput("1000")).toBe("1,000");
    expect(formatAmountInput("1234567")).toBe("1,234,567");
    expect(formatAmountInput("999")).toBe("999");
  });

  it("preserves a single decimal separator", () => {
    expect(formatAmountInput("1234.56")).toBe("1,234.56");
    expect(formatAmountInput("0.99")).toBe("0.99");
  });

  it("keeps the first decimal segment and drops anything after a second dot", () => {
    // The function's split-and-recombine only takes parts[0] and parts[1];
    // a third "1.2.3" segment is silently dropped. Documented behaviour.
    expect(formatAmountInput("1.2.3")).toBe("1.2");
  });

  it("handles empty input", () => {
    expect(formatAmountInput("")).toBe("");
  });
});

describe("unformatAmount", () => {
  it("removes commas", () => {
    expect(unformatAmount("1,234.56")).toBe("1234.56");
    expect(unformatAmount("1,000,000")).toBe("1000000");
  });

  it("leaves clean strings alone", () => {
    expect(unformatAmount("1234.56")).toBe("1234.56");
    expect(unformatAmount("")).toBe("");
  });
});

describe("formatCurrency", () => {
  it("formats USD with the dollar symbol", () => {
    // Run-environment-locale is en-US in tests via the formatter override; the
    // function constructs an Intl.NumberFormat with that locale + currency.
    const result = formatCurrency(1234.5, "USD");
    expect(result).toContain("$");
    expect(result).toContain("1,234.5");
  });

  it("defaults to USD when currency is omitted", () => {
    expect(formatCurrency(10)).toContain("$");
  });

  it("formats other currencies with their codes/symbols", () => {
    const eur = formatCurrency(100, "EUR");
    // en-US formatting of EUR shows "€100.00" or similar
    expect(eur).toMatch(/€|EUR/);
  });
});
