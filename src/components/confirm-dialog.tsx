import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

const EVENT = "dockit-confirm";

export function askConfirm({ title, body, okLabel, danger = true } = {}) {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(EVENT, { detail: { title, body, okLabel, danger, resolve } }),
    );
  });
}

export function ConfirmDialog({
  open,
  title,
  body,
  onCancel,
  onOk,
  busy,
  okLabel,
  danger = true,
  inline = false,
}) {
  const box = (
    <div
      className={inline ? undefined : "am-popup-box"}
      role="alertdialog"
      aria-modal={!inline}
      aria-labelledby="dockit-confirm-title"
      onClick={inline ? undefined : (e) => e.stopPropagation()}
    >
      <h3 id="dockit-confirm-title" className="dialog-title">
        {title}
      </h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t("actions.cancel")}
        </Button>
        <Button
          type="button"
          variant={danger ? "danger" : "default"}
          onClick={onOk}
          disabled={busy}
        >
          {okLabel || t("actions.delete")}
        </Button>
      </div>
    </div>
  );
  useEffect(() => {
    if (inline || open === false) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onCancel?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [inline, open, onCancel]);
  if (inline) return box;
  if (open === false || typeof document === "undefined") return null;
  return createPortal(
    <div className="am-popup" role="presentation" onClick={onCancel}>
      {box}
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  useEffect(() => {
    function onAsk(e) {
      setAsk(e.detail);
    }
    window.addEventListener(EVENT, onAsk);
    return () => window.removeEventListener(EVENT, onAsk);
  }, []);
  if (!ask) return null;
  return (
    <ConfirmDialog
      open
      title={ask.title}
      body={ask.body}
      okLabel={ask.okLabel}
      danger={ask.danger !== false}
      onCancel={() => {
        ask.resolve(false);
        setAsk(null);
      }}
      onOk={() => {
        ask.resolve(true);
        setAsk(null);
      }}
    />
  );
}
