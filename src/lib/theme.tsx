import * as React from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "mibale-theme";

/** Applies the saved theme before paint to avoid a flash. */
export function ThemeScript() {
  const code = `try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function getThemeMode(): ThemeMode {
  try {
    return (localStorage.getItem(KEY) as ThemeMode) || "system";
  } catch {
    return "system";
  }
}

export function applyTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useThemeSync() {
  React.useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => getThemeMode() === "system" && applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
}
