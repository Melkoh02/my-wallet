export type NextDateOptions = {
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
};

export function getNextDate(current: string, frequency: string, options?: NextDateOptions): string {
  const d = new Date(current + "T00:00:00");
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      if (options?.dayOfWeek != null) {
        // Find the next occurrence of target day that is >= 7 days from current
        const wDiff = (options.dayOfWeek - d.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + wDiff);
      } else {
        d.setDate(d.getDate() + 7);
      }
      break;
    case "biweekly":
      if (options?.dayOfWeek != null) {
        // Find the next occurrence of target day that is >= 14 days from current
        d.setDate(d.getDate() + 14);
        const bDiff = (options.dayOfWeek - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + bDiff);
      } else {
        d.setDate(d.getDate() + 14);
      }
      break;
    case "monthly": {
      // gotcha: don't use setMonth(getMonth() + 1) directly. JS auto-rolls
      // when the current day-of-month exceeds the next month's length —
      // Jan 31 → Mar 3 (skipping Feb), Mar 31 → May 1 (skipping Apr).
      // Compute target year+month explicitly, clamp the day to the
      // target month's actual length, then setFullYear(...) in one call so
      // there's no intermediate auto-roll.
      const advanced = d.getMonth() + 1;
      const targetYear = d.getFullYear() + Math.floor(advanced / 12);
      const targetMonth = advanced % 12;
      const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      const desiredDay = options?.dayOfMonth ?? d.getDate();
      const targetDay = Math.min(desiredDay, maxDay);
      d.setFullYear(targetYear, targetMonth, targetDay);
      break;
    }
    case "yearly": {
      // Same gotcha as monthly, applied at year scope: Feb 29 → next year's
      // Mar 1 if not a leap year. Compute year/month/day in one assignment.
      const targetYear = d.getFullYear() + 1;
      const targetMonth = d.getMonth();
      const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
      const desiredDay = options?.dayOfMonth ?? d.getDate();
      const targetDay = Math.min(desiredDay, maxDay);
      d.setFullYear(targetYear, targetMonth, targetDay);
      break;
    }
  }
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / msPerDay);
}

export function frequencyToDays(frequency: string): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    case "yearly":
      return 365;
    default:
      return 30;
  }
}
