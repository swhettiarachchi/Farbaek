import { describe, expect, it } from "vitest";
import { OLD_CHAT_THEME_COOKIE, THEME_COOKIE, browserBarColor, clearOldChatCookie, isTheme, readTheme, showsDark, themeCookie } from "./theme";

describe("the saved look", () => {
  it("is Light unless a real choice was saved", () => {
    expect(readTheme(undefined)).toBe("light");
    expect(readTheme(null)).toBe("light");
    expect(readTheme("")).toBe("light");
    expect(readTheme("light")).toBe("light");
    expect(readTheme("dark")).toBe("dark");
    expect(readTheme("system")).toBe("system");
  });

  it("never trusts what a cookie says beyond the three choices", () => {
    for (const bad of ["Dark", "dark ", "night", "dark; path=/", '"><script>', "__proto__", "1"]) {
      expect(readTheme(bad), bad).toBe("light");
      expect(isTheme(bad), bad).toBe(false);
    }
    expect(isTheme(1)).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("keeps a choice made in Chat before every page had one", () => {
    expect(readTheme(undefined, "dark")).toBe("dark");
    expect(readTheme(undefined, "system")).toBe("system");
    expect(readTheme(undefined, "sepia")).toBe("light");
  });

  it("lets the newer choice win over Chat's older one", () => {
    expect(readTheme("light", "dark")).toBe("light");
    expect(readTheme("dark", "light")).toBe("dark");
  });
});

describe("the cookie", () => {
  it("covers every page for a year and stays on this site", () => {
    const cookie = themeCookie("dark", true);
    expect(cookie.startsWith(`${THEME_COOKIE}=dark;`)).toBe(true);
    expect(cookie).toContain("path=/;");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("samesite=lax");
    expect(cookie.endsWith("; secure")).toBe(true);
    expect(themeCookie("light", false)).not.toContain("secure");
  });

  it("removes Chat's older cookie on the path it was set on", () => {
    const gone = clearOldChatCookie(true);
    expect(gone.startsWith(`${OLD_CHAT_THEME_COOKIE}=;`)).toBe(true);
    expect(gone).toContain("path=/app/chat");
    expect(gone).toContain("max-age=0");
  });
});

describe("what shows", () => {
  it("is dark for Dark, and for Match device on a dark device only", () => {
    expect(showsDark("dark", false)).toBe(true);
    expect(showsDark("dark", true)).toBe(true);
    expect(showsDark("system", true)).toBe(true);
    expect(showsDark("system", false)).toBe(false);
    expect(showsDark("light", true)).toBe(false);
  });

  it("names one bar colour for a fixed look and both for Match device", () => {
    expect(browserBarColor("light")).toBe("#fbfbfc");
    expect(browserBarColor("dark")).toBe("#0f1013");
    expect(browserBarColor("system")).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
      { media: "(prefers-color-scheme: dark)", color: "#0f1013" },
    ]);
  });
});
