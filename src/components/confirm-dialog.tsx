import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modal-shell";
import { t } from "@/lib/i18n";

const EVENT = "dockit-confirm";

type AskConfirmOptions = {
  title?: ReactNode;
  body?: ReactNode;
  okLabel?: string;
  danger?: boolean;
};

type ConfirmDetail = AskConfirmOptions & {
  resolve: (ok: boolean) => void;
};

export function askConfirm({ title, body, okLabel, danger = true }: AskConfirmOptions = {}) {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmDetail>(EVENT, { detail: { title, body, okLabel, danger, resolve } }),
    );
  });
}

export type ConfirmDialogProps = {
  open?: boolean;
  title?: ReactNode;
  body?: ReactNode;
  onCancel: () => void;
  onOk: () => void;
  busy?: boolean;
  okLabel?: string;
  danger?: boolean;
  inline?: boolean;
};

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
}: ConfirmDialogProps) {
  const box = (
    <div
      role={inline ? "alertdialog" : undefined}
      aria-modal={inline ? false : undefined}
      aria-labelledby={inline ? "dockit-confirm-title" : undefined}
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
  if (inline) return box;
  if (open === false || typeof document === "undefined") return null;
  return (
    <ModalShell onClose={onCancel} labelledBy="dockit-confirm-title" role="alertdialog">
      {box}
    </ModalShell>
  );
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<ConfirmDetail | null>(null);
  useEffect(() => {
    function onAsk(e: Event) {
      setAsk((e as CustomEvent<ConfirmDetail>).detail);
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
