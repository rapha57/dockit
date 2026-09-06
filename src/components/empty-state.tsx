import { Layers, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type EmptyStateProps = {
  editMode?: boolean;
  onAdd?: () => void;
  compact?: boolean;
  icon?: LucideIcon;
  text?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ editMode, onAdd, compact, icon: Icon = Layers, text, action }: EmptyStateProps) {
  return (
    <div className={`empty-page${compact ? " is-compact" : ""}`}>
      <div className="empty-page-mark">
        <Icon className="size-7" aria-hidden />
      </div>
      <p>{text || (compact || editMode ? t("empty.categoryLead") : t("empty.noApps"))}</p>
      {action ? (
        <div className="empty-page-action">{action}</div>
      ) : editMode && onAdd ? (
        <Button className="empty-page-action" onClick={onAdd}>
          <Plus className="size-4" />
          {t("empty.addCategory")}
        </Button>
      ) : null}
    </div>
  );
}
