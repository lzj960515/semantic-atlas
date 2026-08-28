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
