import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modal-shell";
import { PortalIcon } from "@/lib/icons";
import { t, te } from "@/lib/i18n";
import { previewAsUser } from "@/lib/portal";
import { sessionGone } from "@/lib/session-gone";
import { prettyLogin } from "@/components/access-shared";
import type { CatalogSpace, MenuSpace } from "@/lib/portal-ui";

type SeeAsPayload = {
  asUser: { id: string; username: string; role?: string; disabled?: boolean };
  spaces: MenuSpace[];
  catalog: CatalogSpace[];
};

export function SeeAsButton({
  username,
  onClick,
}: {
  username: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="am-text-btn"
      onClick={onClick}
      title={t("access.seeAsTitle", { name: prettyLogin(username) })}
    >
      <Eye className="size-3.5" />
      {t("access.seeAs")}
    </button>
  );
}

export function SeeAsPreview({
  token,
  userId,
  username,
  onClose,
}: {
  token: string;
  userId: string;
  username: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [data, setData] = useState<SeeAsPayload | null>(null);
  const [spaceId, setSpaceId] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let live = true;
    setBusy(true);
    previewAsUser({ data: { token, userId } })
      .then((res) => {
        if (!live) return;
        setData(res);
        setSpaceId(res.spaces[0]?.id || "");
        setBusy(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setBusy(false);
        if (!sessionGone(err)) toast.error(te(err));
        onCloseRef.current();
      });
    return () => {
      live = false;
    };
  }, [token, userId]);

  const space = useMemo(
    () => data?.catalog.find((s) => s.id === spaceId) || data?.catalog[0],
    [data, spaceId],
  );
  const cats = (space?.categories || []).filter((c) => (c.cards || []).length > 0);
  const who = prettyLogin(data?.asUser.username || username);

  return (
    <ModalShell size="wide" label={t("access.seeAsTitle", { name: who })} onClose={onClose}>
      <div className="settings-frame is-wide">
        <div className="settings-body">
          <div className="settings-head">
            <div className="settings-head-copy">
              <h3 className="dialog-title">{t("access.seeAsTitle", { name: who })}</h3>
              <p className="settings-lead">
                {data?.asUser.disabled ? t("access.seeAsDisabled") : t("access.seeAsLead")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={t("actions.close")}
              title={t("actions.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="settings-pane is-access">
            {busy ? (
              <p className="am-dim">{t("access.seeAsBusy")}</p>
            ) : !data?.spaces.length ? (
              <p className="am-dim">{t("access.seeAsEmpty")}</p>
            ) : (
              <div className="see-as">
                {data.spaces.length > 1 ? (
                  <div className="see-as-spaces" role="tablist" aria-label={t("access.spaces")}>
                    {data.spaces.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={s.id === (space?.id || spaceId)}
                        className={`see-as-space${s.id === (space?.id || spaceId) ? " is-on" : ""}`}
                        onClick={() => setSpaceId(s.id)}
                      >
                        <PortalIcon name={s.icon} className="size-3.5" />
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {cats.length === 0 ? (
                  <p className="am-dim">{t("access.seeAsEmptySpace")}</p>
                ) : (
                  cats.map((cat) => (
                    <section key={cat.id} className="see-as-cat">
                      <h4 className="see-as-cat-title">
                        <PortalIcon name={cat.icon} className="size-3.5" />
                        {cat.name}
                      </h4>
                      <ul className="see-as-cards">
                        {cat.cards.map((card) => (
                          <li key={card.id} className="see-as-card">
                            <PortalIcon name={card.icon} className="size-3.5 shrink-0" />
                            <span className="truncate">{card.title || t("empty.untitled")}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
