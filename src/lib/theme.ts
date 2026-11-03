import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "tj.theme.v1";
export const THEME_EVENT = "tj-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const DARK_BROWSER_COLOR = "#0b0f14";
const LIGHT_BROWSER_COLOR = "#f6f8fb";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === "system") return systemPrefersDark ? "dark" : "light";
  return theme;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches === true;
}

/** Apply a theme to the document immediately. Safe to call during hydration. */
export function applyTheme(theme: Theme = readTheme()) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme, systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.dataset["theme"] = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "dark" ? DARK_BROWSER_COLOR : LIGHT_BROWSER_COLOR;
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage may be unavailable (private mode); the theme still applies for this page.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribeToTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onThemeChange = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_KEY) return;
    applyTheme(readTheme());
    callback();
  };
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (readTheme() === "system") applyTheme("system");
    callback();
  };

  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}

function subscribeToSystem(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

const getServerTheme = (): Theme => "system";
const getServerSystemDark = () => false;

/**
 * Theme state shared by the toggle and any component that needs the resolved theme.
 * The blocking script in the document head applies the stored theme before paint.
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, getServerTheme);
  const prefersDark = useSyncExternalStore(
    subscribeToSystem,
    systemPrefersDark,
    getServerSystemDark,
  );
  const resolved = resolveTheme(theme, prefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, prefersDark]);

  return { theme, resolved, setTheme };
}

/**
 * Runs in <head> before the app hydrates so the stored theme is applied without a flash.
 * Keep this script dependency-free; it mirrors applyTheme above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var key=${JSON.stringify(THEME_KEY)};var stored=localStorage.getItem(key);var theme=stored==="light"||stored==="dark"||stored==="system"?stored:"system";var dark=theme==="dark"||(theme==="system"&&window.matchMedia("${DARK_QUERY}").matches);var root=document.documentElement;root.classList.toggle("dark",dark);root.classList.toggle("light",!dark);root.dataset.theme=dark?"dark":"light";root.style.colorScheme=dark?"dark":"light";var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",dark?"${DARK_BROWSER_COLOR}":"${LIGHT_BROWSER_COLOR}");}catch(e){}})();`;
