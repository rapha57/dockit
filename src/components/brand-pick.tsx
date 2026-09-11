import type { ReactNode } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { t, te } from "@/lib/i18n";

export function BrandPick({
  label,
  hint,
  resetLabel,
  accept,
  src,
  variant,
  onFile,
  onReset,
  children,
}: {
  label: string;
  hint?: string;
  resetLabel: string;
  accept: string;
  src: string;
  variant?: string;
  onFile: (file: File) => Promise<void>;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="brand-slot">
      <span>{label}</span>
      <label
        className={`brand-preview${variant === "tab" ? " is-tab" : ""}`}
        title={t("settings.importBrand", { label: label.toLowerCase() })}
      >
        {children}
        <Upload className="brand-preview-action size-3.5" aria-hidden />
        <input
          type="file"
          accept={accept}
          className="hidden"
          aria-label={t("settings.importBrand", { label: label.toLowerCase() })}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await onFile(file);
            } catch (err) {
              toast.error(te(err));
            }
          }}
        />
      </label>
      {src ? (
        <button type="button" className="settings-link" onClick={onReset}>
          {resetLabel}
        </button>
      ) : (
        <p className="settings-hint">{hint}</p>
      )}
    </div>
  );
}
