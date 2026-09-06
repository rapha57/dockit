import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("settings-field", className)} data-slot="field">
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint ? <p className="theme-css-meta">{hint}</p> : null}
      {error ? <p className="theme-css-meta is-warn">{error}</p> : null}
    </div>
  );
}
