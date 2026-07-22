"use client";

import {
  LANGUAGES,
  LANGUAGE_LABELS,
  LANGUAGE_NAMES,
} from "../i18n/config";
import { useLanguage } from "../i18n/LanguageProvider";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      className={`language-switcher${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={t("lang.aria")}
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          className={code === language ? "is-active" : undefined}
          aria-pressed={code === language}
          title={LANGUAGE_NAMES[code]}
          onClick={() => setLanguage(code)}
        >
          {LANGUAGE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
