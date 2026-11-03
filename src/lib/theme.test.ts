import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTheme, readTheme, resolveTheme, setTheme, THEME_KEY } from "./theme";

function root() {
  return document.documentElement;
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    root().className = "";
    root().removeAttribute("data-theme");
    root().style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="#1a1f26" />';
  });

  afterEach(() => {
    localStorage.clear();
    root().className = "";
    root().removeAttribute("data-theme");
    root().style.colorScheme = "";
  });

  it("resolves explicit and system preferences", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("applies the resolved theme, color scheme and browser chrome colour", () => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;

    applyTheme("light");
    expect(root().classList.contains("light")).toBe(true);
    expect(root().classList.contains("dark")).toBe(false);
    expect(root().dataset["theme"]).toBe("light");
    expect(root().style.colorScheme).toBe("light");
    expect(meta.content).toBe("#f6f8fb");

    applyTheme("dark");
    expect(root().classList.contains("dark")).toBe(true);
    expect(root().classList.contains("light")).toBe(false);
    expect(root().dataset["theme"]).toBe("dark");
    expect(root().style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#0b0f14");
  });

  it("persists the selected theme and falls back to system for bad values", () => {
    setTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(readTheme()).toBe("dark");

    localStorage.setItem(THEME_KEY, "neon");
    expect(readTheme()).toBe("system");
  });
});
