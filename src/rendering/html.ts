export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeDomToken(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/gu, "-");
}

/** Mark only product-owned text; interpolation data remains literal user content. */
export function translationAttributes(
  key: string,
  values: Record<string, unknown> = {},
  attribute?: "aria-label" | "title",
): string {
  const marker = attribute ? `data-i18n-${attribute}` : "data-i18n";
  return `${marker}="${escapeHtml(key)}" data-i18n-options="${escapeHtml(JSON.stringify(values))}"`;
}
