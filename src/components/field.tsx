import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export function Field({ label, hint, error, className, children }) {
  return (
    <div className={cn("settings-field", className)} data-slot="field">
      {label ? <Label>{label}</Label> : null}
      {children}
      {hint ? <p className="settings-hint">{hint}</p> : null}
      {error ? <p className="settings-hint is-warn">{error}</p> : null}
    </div>
  );
}
