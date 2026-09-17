export type Locale = "en" | "zh-CN";

/** Normalize supported locale aliases; the caller/library owns fallback selection. */
export function normalizeLocale(value: string): Locale | undefined {
  const locale = value.trim().split(/[.@]/u)[0]?.replaceAll("_", "-").toLowerCase();
  if (locale === "en" || locale?.startsWith("en-")) return "en";
  if (
    locale === "zh" ||
    locale === "zh-cn" ||
    locale === "zh-sg" ||
    locale === "zh-hans" ||
    locale?.startsWith("zh-hans-")
  )
    return "zh-CN";
  return undefined;
}
