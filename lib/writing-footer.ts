import type { FooterFormat, FooterType } from "@/lib/studio";

export const PAGE_FOOTER_FORMATS = [
  { value: "page-of-total", label: "Page 1 / 12" },
  { value: "number-of-total", label: "1 / 12" },
  { value: "page-only", label: "Page 1" },
  { value: "number-only", label: "1" },
] as const satisfies ReadonlyArray<{ value: FooterFormat; label: string }>;

export const DATE_FOOTER_FORMATS = [
  { value: "date-long", label: "11 septembre 2026" },
  { value: "date-short", label: "11/09/2026" },
  { value: "date-iso", label: "2026-09-11" },
] as const satisfies ReadonlyArray<{ value: FooterFormat; label: string }>;

const pageFormats = new Set<FooterFormat>(PAGE_FOOTER_FORMATS.map((item) => item.value));
const dateFormats = new Set<FooterFormat>(DATE_FOOTER_FORMATS.map((item) => item.value));

export function footerFormatForType(type: FooterType, format: FooterFormat): FooterFormat {
  if (type === "date") return dateFormats.has(format) ? format : "date-long";
  if (type === "page") return pageFormats.has(format) ? format : "page-of-total";
  return format;
}

export function formatFooterText(
  type: FooterType,
  format: FooterFormat,
  text = "",
  pageNumber = 1,
  totalPages = 1,
  date = new Date(),
) {
  if (type === "none") return "";
  if (type === "custom") return text.trim();
  if (type === "date") return formatFooterDate(footerFormatForType(type, format), date);

  const current = Math.max(1, Math.trunc(pageNumber));
  const total = Math.max(current, Math.trunc(totalPages));
  switch (footerFormatForType(type, format)) {
    case "number-of-total": return `${current} / ${total}`;
    case "page-only": return `Page ${current}`;
    case "number-only": return `${current}`;
    default: return `Page ${current} / ${total}`;
  }
}

function formatFooterDate(format: FooterFormat, date: Date) {
  if (format === "date-short") {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date);
  }
  if (format === "date-iso") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  }).format(date);
}
