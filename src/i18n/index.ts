import { normalizeLocale, type Locale } from "./locale.js";
export type { Locale } from "./locale.js";
import { createInstance, type i18n } from "i18next";
import { en as zodEnglish, zhCN as zodChinese } from "zod/locales";
import enCli from "./locales/en/cli.js";
import zhCli from "./locales/zh-CN/cli.js";
import enViewer from "./locales/en/viewer.js";
import zhViewer from "./locales/zh-CN/viewer.js";
import enErrors from "./locales/en/errors.js";
import zhErrors from "./locales/zh-CN/errors.js";

const resources = {
  en: { translation: { cli: enCli, viewer: enViewer, errors: enErrors } },
  "zh-CN": { translation: { cli: zhCli, viewer: zhViewer, errors: zhErrors } },
};

/** System locale for CLI use; SEMANTIC_ATLAS_LANG is a debug/test override. */
export function getLocale(environment: NodeJS.ProcessEnv = process.env): Locale {
  const selected = [
    environment.SEMANTIC_ATLAS_LANG,
    environment.LC_ALL,
    environment.LC_MESSAGES,
    environment.LANG,
  ].find((value) => value?.trim());
  return normalizeLocale(selected ?? "") ?? "en";
}

export function getResources(): typeof resources {
  return resources;
}

const instances = new Map<Locale, i18n>();

export function getTranslator(
  locale: Locale,
): (key: string, values?: Record<string, unknown>) => string {
  let instance = instances.get(locale);
  if (!instance) {
    instance = createInstance();
    // Bundled resources need no asynchronous backend or process-global language state.
    void instance.init({
      lng: locale,
      fallbackLng: "en",
      resources,
      initAsync: false,
      interpolation: { escapeValue: false },
    });
    instances.set(locale, instance);
  }
  const translator = instance;
  return (key, values = {}) => translator.t(key, values);
}

export function t(key: string, values: Record<string, unknown> = {}): string {
  return getTranslator(getLocale())(key, values);
}

/** Keep Zod's official localization scoped to the individual parse. */
export function validationOptions() {
  return { error: (getLocale() === "zh-CN" ? zodChinese : zodEnglish)().localeError };
}
