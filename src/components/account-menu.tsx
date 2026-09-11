import { useEffect, useRef, useState } from "react";
import {
  CircleUser,
  History,
  LogIn,
  LogOut,
  Pencil,
  RotateCcw,
  ScanSearch,
  Settings,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/components/confirm-dialog";
import { t, localeTag } from "@/lib/i18n";

function prettyLogin(name: unknown) {
  const s = String(name || "").trim();
  if (!s) return "";
  const lower = s.toLocaleLowerCase(localeTag());
  return lower.charAt(0).toLocaleUpperCase(localeTag()) + lower.slice(1);
}

function accountRoleLabel(role: string | null | undefined, isOwner?: boolean) {
  if (isOwner || role === "owner") return t("account.owner");
  if (role === "editeur") return t("account.editor");
  if (role === "lecteur") return t("account.viewer");
  if (role === "admin") return t("account.admin");
  return t("account.member");
}

function accountStatusLabel(
  loggedIn: boolean,
  role: string | null | undefined,
  isOwner?: boolean,
  username?: string,
) {
  if (!loggedIn) return t("account.guest");
  const who = prettyLogin(username);
  const rank = accountRoleLabel(role, isOwner);
  if (!who) return rank;
  return t("account.who", { name: who, role: rank });
}

export function AccountMenu({
  loggedIn,
  editMode,
  canEdit,
  canOpenSettings,
  canManageUsers,
  canHistory,
  canCuration,
  role,
  username,
  openFavs,
  onLogin,
  onEdit,
  onSettings,
  onHistory,
  onCuration,
  onUsers,
  onOpenFavs,
  onResetLocal,
  onLogout,
  isOwner,
}: {
  loggedIn: boolean;
  editMode: boolean;
  canEdit: boolean;
  canOpenSettings: boolean;
  canManageUsers: boolean;
  canHistory: boolean;
  canCuration: boolean;
  role: string;
  username?: string;
  isOwner?: boolean;
  openFavs: boolean;
  onLogin: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onHistory: () => void;
  onCuration: () => void;
  onUsers: () => void;
  onOpenFavs: (on: boolean) => void;
  onResetLocal: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);
  const showEdit = loggedIn && canEdit && !editMode;
  const showSettings = loggedIn && canOpenSettings;
  const showHistory = loggedIn && canHistory;
  const showUsers = loggedIn && canManageUsers;
  const showCuration = loggedIn && canCuration;
  const showInstance = showSettings || showUsers || showHistory || showCuration;
  const status = accountStatusLabel(loggedIn, role, isOwner, username);
  const localPrefs = (
    <>
      <div className="menu-sep" />
      <p className="menu-kicker">{t("account.browser")}</p>
      <label className="account-check is-local">
        <input
          type="checkbox"
          checked={Boolean(openFavs)}
          onChange={(e) => onOpenFavs(e.target.checked)}
        />
        {t("account.openFavs")}
      </label>
      <button
        type="button"
        role="menuitem"
        className="is-local is-danger"
        onClick={async () => {
          setOpen(false);
          if (
            !(await askConfirm({
              title: t("account.resetPrefs"),
              body: t("account.resetPrefsConfirm"),
              okLabel: t("account.resetPrefs"),
            }))
          )
            return;
          onResetLocal();
        }}
      >
        <RotateCcw className="size-4 shrink-0" />
        {t("account.resetPrefs")}
      </button>
    </>
  );
  return (
    <div className="account-menu" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("aria.account")}
        title={t("aria.account")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleUser className={`account-ico size-4${loggedIn ? " is-on" : ""}`} />
      </Button>
      {open ? (
        <div className="account-panel" role="menu">
          <p className="menu-kicker">{status}</p>
          {!loggedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogin();
              }}
            >
              <LogIn className="size-4 shrink-0" />
              {t("account.login")}
            </button>
          ) : null}
          {showEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Pencil className="size-4 shrink-0" />
              {t("account.edit")}
            </button>
          ) : null}
          {showEdit && showInstance ? <div className="menu-sep" /> : null}
          {showInstance ? <p className="menu-kicker">{t("account.instance")}</p> : null}
          {showSettings ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
            >
              <Settings className="size-4 shrink-0" />
              {t("settings.title")}
            </button>
          ) : null}
          {showUsers ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onUsers();
              }}
            >
              <Users className="size-4 shrink-0" />
              {t("access.title")}
            </button>
          ) : null}
          {showHistory ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onHistory();
              }}
            >
              <History className="size-4 shrink-0" />
              {t("history.title")}
            </button>
          ) : null}
          {showCuration ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCuration();
              }}
            >
              <ScanSearch className="size-4 shrink-0" />
              {t("curation.title")}
            </button>
          ) : null}
          {loggedIn ? (
            <>
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <LogOut className="size-4 shrink-0" />
                {t("account.logout")}
              </button>
            </>
          ) : null}
          {localPrefs}
        </div>
      ) : null}
    </div>
  );
}
