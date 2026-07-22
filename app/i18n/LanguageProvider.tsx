"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  type Language,
} from "./config";
import { ui, type TranslationKey } from "./dictionary";

interface LanguageContextValue {
  readonly language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render always use the default so hydration matches;
  // the stored / browser preference is applied right after mount.
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const stored = normalizeLanguage(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    );
    const preferred = stored ?? normalizeLanguage(navigator.language);
    if (preferred && preferred !== DEFAULT_LANGUAGE) {
      setLanguageState(preferred);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Ignore private-mode / storage-disabled failures.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey) => ui[language][key] ?? ui.en[key] ?? key,
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
