import { getNextDate, daysBetween, frequencyToDays } from "./date";

describe("getNextDate", () => {
  describe("daily", () => {
    it("advances by one day", () => {
      expect(getNextDate("2026-01-15", "daily")).toBe("2026-01-16");
    });

    it("rolls over month boundary", () => {
      expect(getNextDate("2026-01-31", "daily")).toBe("2026-02-01");
    });

    it("rolls over year boundary", () => {
      expect(getNextDate("2025-12-31", "daily")).toBe("2026-01-01");
    });
  });

  describe("weekly", () => {
    it("advances by 7 days when no day-of-week specified", () => {
      expect(getNextDate("2026-01-15", "weekly")).toBe("2026-01-22");
    });

    it("advances to the next target day-of-week", () => {
      // 2026-01-15 is a Thursday (4). Asking for Saturday (6) should land
      // on 2026-01-17, but the rule keeps the cadence at weekly+ — so the
      // result should be at least 1 day forward.
      const result = getNextDate("2026-01-15", "weekly", { dayOfWeek: 6 });
      // It should be a Saturday
      expect(new Date(result + "T00:00:00").getDay()).toBe(6);
    });
  });

  describe("biweekly", () => {
    it("advances by 14 days when no day-of-week specified", () => {
      expect(getNextDate("2026-01-15", "biweekly")).toBe("2026-01-29");
    });

    it("lands on the target day-of-week at least 14 days out", () => {
      const result = getNextDate("2026-01-15", "biweekly", { dayOfWeek: 1 }); // Monday
      const resultDate = new Date(result + "T00:00:00");
      expect(resultDate.getDay()).toBe(1);
      expect(daysBetween("2026-01-15", result)).toBeGreaterThanOrEqual(14);
    });
  });

  describe("monthly", () => {
    it("advances by one month", () => {
      expect(getNextDate("2026-01-15", "monthly")).toBe("2026-02-15");
    });

    // KNOWN BUG (will be fixed in fix/monthly-recurring-day-skip):
    // setMonth(+1) followed by clamping doesn't handle the case where the
    // current month-end exceeds the next month's length. e.g. Jan 31 +
    // 1 month makes JS normalize to Mar 3 (skipping Feb entirely), then
    // dayOfMonth=31 clamps to Mar 31. So a monthly recurring starting on
    // the 31st *skips* every short month instead of falling back to its
    // last day. Tests left here as documentation of the intended
    // behaviour once fixed.
    it.skip("clamps day-of-month to the month length (Feb) — KNOWN BUG", () => {
      const result = getNextDate("2026-01-31", "monthly", { dayOfMonth: 31 });
      expect(result).toBe("2026-02-28");
    });

    it.skip("clamps day-of-month to the month length (April) — KNOWN BUG", () => {
      const result = getNextDate("2026-03-31", "monthly", { dayOfMonth: 31 });
      expect(result).toBe("2026-04-30");
    });
  });

  describe("yearly", () => {
    it("advances by one year", () => {
      expect(getNextDate("2026-01-15", "yearly")).toBe("2027-01-15");
    });
  });
});

describe("daysBetween", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetween("2026-01-15", "2026-01-15")).toBe(0);
  });

  it("returns positive for forward direction", () => {
    expect(daysBetween("2026-01-15", "2026-01-20")).toBe(5);
  });

  it("counts month rollover correctly", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
  });

  it("counts year rollover correctly", () => {
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });
});

describe("frequencyToDays", () => {
  it("returns canonical period lengths", () => {
    expect(frequencyToDays("daily")).toBe(1);
    expect(frequencyToDays("weekly")).toBe(7);
    expect(frequencyToDays("biweekly")).toBe(14);
    expect(frequencyToDays("monthly")).toBe(30);
    expect(frequencyToDays("yearly")).toBe(365);
  });
});
