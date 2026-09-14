import { useState } from "react";
import { Folder, LogIn, Shield, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessUsers, AccessGroups, AccessRoles } from "@/components/access";
import { IdentitySourcesPanel, seedLdapDirs } from "@/components/auth-panel";
import { t } from "@/lib/i18n";
import type { MenuSpace, OidcPayload, LdapPayload } from "@/lib/portal-ui";
import type { PortalSettings, SessionInfo } from "@/lib/portal";

export function AccessFrame({
  token,
  session,
  spaces,
  settings,
  busy,
  onClose,
  onSaveOidc,
  onSaveLdap,
  onSaveLoginOrder,
}: {
  token: string;
  session: SessionInfo | null;
  spaces: MenuSpace[];
  settings: PortalSettings;
  busy: boolean;
  onClose: () => void;
  onSaveOidc: (payload: OidcPayload) => void;
  onSaveLdap: (payload: LdapPayload) => void;
  onSaveLoginOrder: (order: string[]) => void;
}) {
  const [section, setSection] = useState("users");
  const canAccess = Boolean(
    session?.canManageUsers ||
    session?.canManageGroups ||
    session?.canManageRoles,
  );
  const canSettings = Boolean(session?.canManageSettings);
  const pane = canAccess || canSettings ? section : "users";
  const current =
    pane === "auth"
      ? {
          label: t("access.auth"),
          lead: t("access.authLead"),
        }
      : pane === "groups"
        ? {
            label: t("access.groups"),
            lead: t("access.groupsLead"),
          }
        : pane === "roles"
          ? {
              label: t("access.roles"),
              lead: t("access.rolesLead"),
            }
          : {
              label: t("access.users"),
              lead: t("access.usersLead"),
            };
  const accessPane = true;
  return (
    <div className="settings-frame is-wide is-access">
      <nav className="settings-nav" aria-label={t("access.sectionsAria")}>
        <p className="menu-title">{t("access.title")}</p>
        <button
          type="button"
          className={`settings-nav-item ${pane === "users" ? "is-on" : ""}`}
          onClick={() => setSection("users")}
        >
          <Users className="size-4 shrink-0" />
          {t("access.users")}
        </button>
        {canAccess ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "groups" ? "is-on" : ""}`}
            onClick={() => setSection("groups")}
          >
            <Folder className="size-4 shrink-0" />
            {t("access.groups")}
          </button>
        ) : null}
        {canAccess ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "roles" ? "is-on" : ""}`}
            onClick={() => setSection("roles")}
          >
            <Shield className="size-4 shrink-0" />
            {t("access.roles")}
          </button>
        ) : null}
        {canSettings ? (
          <button
            type="button"
            className={`settings-nav-item ${pane === "auth" ? "is-on" : ""}`}
            onClick={() => setSection("auth")}
          >
            <LogIn className="size-4 shrink-0" />
            {t("access.auth")}
          </button>
        ) : null}
      </nav>
      <div className="settings-body">
        <div className="settings-head">
          <div className="settings-head-copy">
            <h3 className="dialog-title">{current.label}</h3>
            <p className="settings-lead">{current.lead}</p>
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
        <div className={`settings-pane${accessPane ? " is-access" : ""}`}>
          {pane === "auth" ? (
            <IdentitySourcesPanel
              settings={settings}
              busy={busy}
              onSaveLdap={onSaveLdap}
              onSaveOidc={onSaveOidc}
              onSaveLoginOrder={onSaveLoginOrder}
            />
          ) : pane === "roles" ? (
            <AccessRoles token={token} spaces={spaces} directories={seedLdapDirs(settings)} />
          ) : pane === "groups" ? (
            <AccessGroups
              token={token}
              actor={session ?? undefined}
              spaces={spaces}
              directories={seedLdapDirs(settings)}
            />
          ) : (
            <AccessUsers token={token} actor={session ?? undefined} spaces={spaces} />
          )}
        </div>
      </div>
    </div>
  );
}
