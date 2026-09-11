import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export function FormActions({
  busy,
  onCancel,
  label = t("actions.save"),
  form,
  disabled,
  hideCancel,
}: {
  busy: boolean;
  onCancel?: () => void;
  label?: string;
  form?: string;
  disabled?: boolean;
  hideCancel?: boolean;
}) {
  return (
    <div className={`settings-actions${hideCancel ? " is-save-only" : ""}`}>
      {hideCancel ? null : (
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
      )}
      <Button type="submit" form={form} size="default" disabled={busy || disabled}>
        {label}
      </Button>
    </div>
  );
}
