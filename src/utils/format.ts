import i18n from "@/i18n";

const currencyFormatters: Record<string, Intl.NumberFormat> = {};

function getFormatter(currency: string): Intl.NumberFormat {
  if (!currencyFormatters[currency]) {
    currencyFormatters[currency] = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
  }
  return currencyFormatters[currency];
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return getFormatter(currency).format(amount);
}

/** Formats a raw numeric string with thousand separators while typing. */
export function formatAmountInput(raw: string): string {
  // Strip everything except digits and dot
  const cleaned = raw.replace(/[^0-9.]/g, "");
  // Split integer and decimal parts
  const parts = cleaned.split(".");
  // Add thousand separators to integer part
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Keep at most one decimal separator
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
}

/** Strips formatting (thousand separators) to get the raw numeric string. */
export function unformatAmount(formatted: string): string {
  return formatted.replace(/,/g, "");
}

export function formatDate(dateStr: string): string {
  const { t } = i18n;
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return t("format.today");
  if (diffDays === 1) return t("format.yesterday");

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowTimeString(): string {
  return new Date().toTimeString().slice(0, 5);
}
