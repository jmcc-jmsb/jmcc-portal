// ABOUTME: i18n for the SPA — locale context, useT() hook, and {placeholder} interpolation.
// ABOUTME: fr.json is typed against en.json, so a missing or stray French key fails typecheck.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import en from './en.json';
import fr from './fr.json';

export type Locale = 'en' | 'fr';
export type TranslationKey = keyof typeof en;

/* This annotation is the whole enforcement mechanism for "EN and FR keys added
   together" (CLAUDE.md). Add a key to en.json without adding it to fr.json and
   `astro check` fails here, not in front of a delegate. */
const dicts: Record<Locale, Record<TranslationKey, string>> = { en, fr };

const STORAGE_KEY = 'jmcc.locale';

/** Pre-auth fallback. Once a session exists, profiles.locale is authoritative. */
function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'fr') return stored;
  return window.navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

type Vars = Record<string, string | number>;

export function translate(lang: Locale, key: TranslationKey, vars?: Vars): string {
  // Fall back to English rather than rendering a raw key — a delegate seeing
  // "auth.sentDetail" is worse than a delegate seeing the English sentence.
  const raw = dicts[lang][key] ?? dicts.en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? 'en');

  // Detection runs after mount so the server and the first client render agree.
  useEffect(() => {
    if (!initial) setLocaleState(detectLocale());
  }, [initial]);

  // Keeps `lang` honest for screen readers and for CSS that hangs off :lang().
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}

/** Shorthand for the common case: `const t = useT()`. */
export function useT() {
  return useLocale().t;
}
