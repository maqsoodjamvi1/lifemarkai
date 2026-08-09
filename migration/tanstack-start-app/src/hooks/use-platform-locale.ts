import { useCallback,useEffect,useState } from "react";
import {
getStoredPlatformLocale,
PLATFORM_LOCALE_STORAGE_KEY,
PLATFORM_LOCALES,
translatePlatform,
type PlatformLocale,
type PlatformStringKey,
} from "@/lib/platform-locale";

/** Platform UI locale — persisted in localStorage, synced to `<html lang>`. */
export function usePlatformLocale() {
  const [locale, setLocaleState] = useState<PlatformLocale>("en");

  useEffect(() => {
    const stored = getStoredPlatformLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored;
  }, []);

  useEffect(() => {
    function onChange(e: Event) {
      const next = (e as CustomEvent<PlatformLocale>).detail;
      if (next) setLocaleState(next);
    }
    window.addEventListener("lifemark-platform-locale", onChange);
    return () => window.removeEventListener("lifemark-platform-locale", onChange);
  }, []);

  const setLocale = useCallback((next: PlatformLocale) => {
    try {
      localStorage.setItem(PLATFORM_LOCALE_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    document.documentElement.lang = next;
    setLocaleState(next);
    window.dispatchEvent(new CustomEvent("lifemark-platform-locale", { detail: next }));
  }, []);

  const t = useCallback(
    (key: PlatformStringKey) => translatePlatform(locale, key),
    [locale],
  );

  return { locale, setLocale, t, locales: PLATFORM_LOCALES };
}
