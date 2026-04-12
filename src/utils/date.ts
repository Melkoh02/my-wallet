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
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      if (options?.dayOfMonth != null) {
        // Clamp to valid day for the month
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(options.dayOfMonth, maxDay));
      }
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      if (options?.dayOfMonth != null) {
        const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(options.dayOfMonth, maxDay));
      }
      break;
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
