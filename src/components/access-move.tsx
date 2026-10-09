import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { type Category, type CategoryMoveImpact, type Space } from "@/lib/acl";
import { t } from "@/lib/i18n";

import { INPUT_SM, actionLabel } from "./access-shared";

export function MovePickDialog({
  category,
  spaces,
  fromSpaceId,
  busy,
  onCancel,
  onContinue,
}: {
  category?: Category | null;
  spaces?: Space[];
  fromSpaceId?: string;
  busy?: boolean;
  onCancel: () => void;
  onContinue: (destId: string) => void;
}) {
  const others = (spaces || []).filter((space) => space.id !== fromSpaceId);
  const [dest, setDest] = useState(others[0]?.id || "");
  return (
    <div>
      <h3 className="dialog-title">{t("access.moveTitle", { name: category?.name })}</h3>
      <p className="mt-2 text-sm text-muted">{t("access.movePickLead")}</p>
      {others.length ? (
        <label className="am-field mt-3">
          <span>{t("access.moveDest")}</span>
          <Select className={INPUT_SM} value={dest} onChange={(e) => setDest(e.target.value)}>
            {others.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("access.moveNoDest")}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" disabled={busy || !dest} onClick={() => onContinue(dest)}>
          {t("access.movePreview")}
        </Button>
      </div>
    </div>
  );
}

export function MoveSectionDialog({
  impact,
  busy,
  onCancel,
  onConfirm,
}: {
  impact?: CategoryMoveImpact | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!impact) return null;
  return (
    <div>
      <h3 className="dialog-title">{t("access.moveTitle", { name: impact.categoryName })}</h3>
      <p className="mt-2 text-sm text-muted">
        {t("access.moveFromTo", { from: impact.fromName, to: impact.toName })}
      </p>
      {impact.changed ? (
        <div className="am-impact">
          <p className="am-kicker">{t("access.moveImpact")}</p>
          <p className="am-note">
            {t("access.moveImpactLead", { roles: impact.roleCount, users: impact.userCount })}
          </p>
          {impact.lost.map((row) => (
            <p key={`l-${row.id}`} className="am-impact-row">
              {row.name} — {t("access.loses")} {row.lost.map(actionLabel).join(", ")}
            </p>
          ))}
          {impact.gained.map((row) => (
            <p key={`g-${row.id}`} className="am-impact-row">
              {row.name} — {t("access.gains")} {row.gained.map(actionLabel).join(", ")}
            </p>
          ))}
          <p className="am-note">{t("access.moveDirectKeep")}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("access.moveNoImpact")}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" onClick={onConfirm} disabled={busy}>
          {t("access.moveConfirm")}
        </Button>
      </div>
    </div>
  );
}
