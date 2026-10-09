import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme";
import { t, localeTag } from "@/lib/i18n";
import { CSS_MAX, sanitizeThemeCss } from "@/lib/theme-css";

export type ThemeColors = { bg: string; surface: string; header: string };
export type ThemeDraft = {
  light: ThemeColors;
  dark: ThemeColors;
  lightExtra: string;
  darkExtra: string;
};

const THEME_COLOR_FIELDS: { id: keyof ThemeColors; cssVar: string }[] = [
  {
    id: "bg",
    cssVar: "--color-bg",
  },
  {
    id: "surface",
    cssVar: "--color-surface",
  },
  {
    id: "header",
    cssVar: "--color-header",
  },
];
export const LIGHT_COLORS = {
  bg: "#fcfcfd",
  surface: "#ffffff",
  header: "#fcfcfc",
};
export const DARK_COLORS = {
  bg: "#0e1116",
  surface: "#171b22",
  header: "#12151b",
};
const MANAGED_BLOCK_RE =
  /html\.(?:light|dark)\s*\{\s*(?:--color-(?:bg|surface|header)\s*:\s*#[0-9a-fA-F]{3,8}\s*;\s*)+\}/g;
export function expandHex(raw: string) {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s))
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}
export function hexLuma(raw: unknown) {
  const hex = expandHex(String(raw || ""));
  if (!hex) return 1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function parseThemeCss(css: string, fallback: ThemeColors) {
  const colors = {
    ...fallback,
  };
  for (const field of THEME_COLOR_FIELDS) {
    const re = new RegExp(
      `${field.cssVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(#[0-9a-fA-F]{3,8})`,
      "g",
    );
    let match;
    let last = null;
    while ((match = re.exec(css))) last = match[1];
    const hex = last ? expandHex(last) : null;
    if (hex) colors[field.id] = hex;
  }
  return {
    colors,
    extra: css.replace(MANAGED_BLOCK_RE, "").trim(),
  };
}
export function composeThemeCss(mode: string, colors: ThemeColors, extra: string) {
  const block = `html.${mode} {\n  --color-bg: ${colors.bg};\n  --color-surface: ${colors.surface};\n  --color-header: ${colors.header};\n}`;
  const rest = extra.trim();
  return rest ? `${rest}\n${block}\n` : `${block}\n`;
}
export function ThemeColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="theme-chip">
      <span>{label}</span>
      <span
        className={`theme-hex${hexLuma(value) < 0.55 ? " is-dark" : ""}`}
        style={{
          background: value,
        }}
      >
        <input
          type="color"
          value={value}
          aria-label={`${label} (hex ${value})`}
          title={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
        <span className="theme-hex-code">{value}</span>
      </span>
    </label>
  );
}
export function ThemeForm({
  value,
  onChange,
  onSave,
}: {
  value: ThemeDraft;
  onChange: (patch: Partial<ThemeDraft>) => void;
  onSave: () => void;
}) {
  const { theme, apply } = useTheme();
  const [pane, setPane] = useState(theme);
  const light = pane === "light";
  const colors = light ? value.light : value.dark;
  const extra = light ? value.lightExtra : value.darkExtra;
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "portal-user-theme-draft";
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById("portal-user-theme-draft");
      if (!el) return;
      const css =
        theme === "dark"
          ? composeThemeCss("dark", value.dark, value.darkExtra)
          : composeThemeCss("light", value.light, value.lightExtra);
      el.textContent = sanitizeThemeCss(css);
    });
    return () => cancelAnimationFrame(frame);
  }, [theme, value]);
  return (
    <form
      id="settings-form"
      className="settings-stack theme-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="settings-card">
        <p className="settings-kicker">{t("theme.colors")}</p>
        <div className="am-filters" role="tablist" aria-label={t("theme.colors")}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "light"}
            className={pane === "light" ? "is-on" : ""}
            onClick={() => {
              setPane("light");
              apply("light");
            }}
          >
            {t("theme.light")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "dark"}
            className={pane === "dark" ? "is-on" : ""}
            onClick={() => {
              setPane("dark");
              apply("dark");
            }}
          >
            {t("theme.dark")}
          </button>
        </div>
        <div className="theme-palette">
          {THEME_COLOR_FIELDS.map((field) => (
            <ThemeColorField
              key={field.id}
              label={t(`theme.${field.id}`)}
              value={colors[field.id]}
              onChange={(next) =>
                onChange(
                  light
                    ? { light: { ...value.light, [field.id]: next } }
                    : { dark: { ...value.dark, [field.id]: next } },
                )
              }
            />
          ))}
        </div>
        <div className="theme-css-meta">
          <span />
          <button
            type="button"
            className="settings-link"
            onClick={() =>
              onChange(light ? { light: { ...LIGHT_COLORS } } : { dark: { ...DARK_COLORS } })
            }
          >
            {t("theme.resetColors")}
          </button>
        </div>
      </div>
      <div className="settings-card">
        <p className="settings-kicker">{t("theme.css")}</p>
        <textarea
          className="field-input theme-extra-css w-full resize-y rounded-lg border border-border bg-transparent p-2.5 font-mono leading-relaxed text-fg outline-none placeholder:text-subtle"
          value={extra}
          spellCheck={false}
          maxLength={CSS_MAX}
          placeholder={t("theme.cssHint")}
          onChange={(e) =>
            onChange(light ? { lightExtra: e.target.value } : { darkExtra: e.target.value })
          }
        />
        <div className="theme-css-meta">
          <span>
            {extra.length.toLocaleString(localeTag())} / {CSS_MAX.toLocaleString(localeTag())}
          </span>
          <button
            type="button"
            className="settings-link"
            onClick={() => {
              onChange(light ? { lightExtra: "" } : { darkExtra: "" });
            }}
          >
            {t("theme.reset")}
          </button>
        </div>
      </div>
    </form>
  );
}
