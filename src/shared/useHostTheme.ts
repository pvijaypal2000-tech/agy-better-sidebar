import { useEffect } from "react";
import type { TableStylePreset, ThemePreset } from "./types";

export function useResolvedTheme(
  _hostTheme: "light" | "dark",
  themePreset: ThemePreset,
  tableStyle: TableStylePreset = "card",
): boolean {
  const isDark = themePreset === "night";

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme-preset", themePreset);
    root.setAttribute("data-resolved-theme", isDark ? "dark" : "light");
    root.setAttribute("data-table-style", tableStyle);
  }, [themePreset, isDark, tableStyle]);

  return isDark;
}
