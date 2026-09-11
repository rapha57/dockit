import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { sanitizeThemeCss } from "@/lib/theme-css";
import { t } from "@/lib/i18n";

const KEY = "portal-theme";
const THEME_EVENT = "portal-theme";
const MODES = ["light", "dark", "system"] as const;

type ThemeMode = (typeof MODES)[number];
type Resolved = "dark" | "light";

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readMode(): ThemeMode {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "dark" || t === "light" || t === "system") return t;
  } catch {
    /* ignore */
  }
  return "light";
}

function resolveMode(mode: ThemeMode): Resolved {
  if (mode === "system") return systemDark() ? "dark" : "light";
  return mode;
}

function writeMode(mode: ThemeMode) {
  const next = resolveMode(mode);
  document.documentElement.classList.toggle("light", next === "light");
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "try{var t=localStorage.getItem('portal-theme');var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.classList.toggle('light',!d)}catch(e){document.documentElement.classList.add('light')}",
      }}
    />
  );
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [theme, setTheme] = useState<Resolved>("light");

  useEffect(() => {
    const sync = () => {
      const next = readMode();
      setMode(next);
      setTheme(resolveMode(next));
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readMode() === "system") writeMode("system");
    };
    window.addEventListener(THEME_EVENT, sync);
    mq.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      mq.removeEventListener("change", onSystem);
    };
  }, []);

  function apply(next: Resolved) {
    setMode(next);
    setTheme(next);
    writeMode(next);
  }

  function toggle() {
    const i = MODES.indexOf(mode);
    const next = MODES[(i + 1) % MODES.length];
    setMode(next);
    setTheme(resolveMode(next));
    writeMode(next);
  }

  return { theme, mode, toggle, apply };
}

export function ThemeCss({ light, dark }: { light: string; dark: string }) {
  const { theme } = useTheme();
  const css = sanitizeThemeCss(theme === "dark" ? dark : light);
  return <style id="portal-user-theme">{css}</style>;
}

export function ThemeToggle() {
  const { theme, mode, toggle } = useTheme();
  const auto = mode === "system";
  const label =
    mode === "light"
      ? t("themeMode.night")
      : mode === "dark"
        ? t("themeMode.system")
        : t("themeMode.day");
  return (
    <Button
      variant="ghost"
      size="icon"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {auto ? <span className="theme-toggle-pip" aria-hidden="true" /> : null}
    </Button>
  );
}

export function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <div className="portal-toaster">
      <Toaster
        theme={theme}
        position="top-center"
        toastOptions={{
          className: "bg-elevated text-fg border border-border",
        }}
      />
    </div>
  );
}
