export type Language = "en" | "es" | "ru";

export const LANGUAGES: readonly Language[] = ["en", "es", "ru"];

export const DEFAULT_LANGUAGE: Language = "en";

// Short codes shown on the top-right switcher.
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "EN",
  es: "ES",
  ru: "RU",
};

// Full names for the accessible menu / title attributes.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
  ru: "Русский",
};

export const LANGUAGE_STORAGE_KEY = "handmade-games-language";

export function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) {
    return null;
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("ru")) {
    return "ru";
  }
  if (lower.startsWith("es")) {
    return "es";
  }
  if (lower.startsWith("en")) {
    return "en";
  }
  return null;
}
