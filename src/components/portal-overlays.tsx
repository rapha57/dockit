import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModalShell } from "@/components/modal-shell";
import { HistoryPanel } from "@/components/history-panel";
import { CurationPanel } from "@/components/curation-panel";
import { LegendPanel, StatsPanel } from "@/components/stats";
import { AdminPanel } from "@/components/settings-panel";
import { LockForm } from "@/components/auth-panel";
import { AccessFrame } from "@/components/access-frame";
import { ItemForm, CardForm, FavsForm } from "@/components/editors";
import { MovePickDialog, MoveSectionDialog } from "@/components/access";
import { itemKind } from "@/lib/item-kind";
import { sessionGone } from "@/lib/session-gone";
import { t, te } from "@/lib/i18n";
import type { Category, CategoryMoveImpact } from "@/lib/acl";
import type { ClickStats, CustomIcon, PortalCard, PortalCategory, SessionInfo } from "@/lib/portal";
import {
  createCard,
  createCategory,
  createSpace,
  deleteCard,
  deleteCategory,
  deleteSpace,
  getPortal,
  importPortal,
  importSpace,
  manageTags,
  moveCategory,
  resetClicks,
  resetProbes,
  resetPortal,
  startOidc,
  unlockEdit,
  updateCard,
  updateCategory,
  updateFavsOptions,
  updateLdapSettings,
  updateLoginOrder,
  updateOidcSettings,
  updateSettings,
  updateSpace,
  updateThemeCss,
} from "@/lib/portal";
import type { MenuSpace, PortalData } from "@/lib/portal-ui";

export type PortalModal = { kind: string; [key: string]: unknown };

type ApplyFn = (
  fn: () => Promise<PortalData>,
  opts?: { close?: boolean; onDone?: () => void },
) => Promise<void> | void;

type IconPicker = {
  token: string;
  library: CustomIcon[];
  online: boolean;
  navRichIcons: boolean;
  onLibrary: (icons: CustomIcon[]) => void;
};

export function PortalOverlays({
  modal,
  setModal,
  busy,
  setBusy,
  data,
  setData,
  token,
  setToken,
  session,
  setSession,
  picker,
  allTags,
  apply,
  enterEdit,
  openMoveCat,
  clickStats,
  setClickStats,
  adminTabRef,
  pinSessCookie,
  writeSessionInfo,
  tokenKey,
  oidcNextKey,
  sessionCanArrange,
  sessionCanManageAcl,
}: {
  modal: PortalModal;
  setModal: Dispatch<SetStateAction<PortalModal>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  data: PortalData;
  setData: Dispatch<SetStateAction<PortalData>>;
  token: string;
  setToken: Dispatch<SetStateAction<string>>;
  session: SessionInfo | null;
  setSession: Dispatch<SetStateAction<SessionInfo | null>>;
  picker: IconPicker;
  allTags: { name: string; count: number }[];
  apply: ApplyFn;
  enterEdit: () => void;
  openMoveCat: (
    category: PortalCategory,
    fromSpaceId: string | undefined,
    destSpaceId: string,
    insertAt: number | undefined,
  ) => void;
  clickStats: ClickStats;
  setClickStats: Dispatch<SetStateAction<ClickStats>>;
  adminTabRef: MutableRefObject<string>;
  pinSessCookie: (token: string | null | undefined) => Promise<void>;
  writeSessionInfo: (session: SessionInfo | null | undefined) => void;
  tokenKey: string;
  oidcNextKey: string;
  sessionCanArrange: (session: SessionInfo | null | undefined) => boolean;
  sessionCanManageAcl: (session: SessionInfo | null | undefined) => boolean;
}) {
  if (modal.kind === "none") return null;
  const close = () =>
    setModal({
      kind: "none",
    });
  return (
    <ModalShell
      wide={
        modal.kind === "admin" ||
        modal.kind === "stats" ||
        modal.kind === "legend" ||
        modal.kind === "card" ||
        modal.kind === "history" ||
        modal.kind === "curation" ||
        modal.kind === "users" ||
        modal.kind === "space" ||
        modal.kind === "category"
      }
      onClose={() => {
        setBusy(false);
        close();
      }}
    >
      {modal.kind === "lock" && (
        <LockForm
          busy={busy}
          oidcEnabled={Boolean(data.settings.oidcEnabled)}
          oidcAutoRedirect={Boolean(data.settings.oidcAutoRedirect)}
          oidcLabel={data.settings.oidcLabel || t("oidc.defaultLabel")}
          ldapEnabled={Boolean(data.settings.ldapEnabled)}
          ldapDomain={data.settings.ldapDomain || ""}
          ldapRealms={data.settings.ldapRealms || []}
          loginOrder={data.settings.loginOrder}
          noPassword={Boolean(data.runtime?.isDev && data.settings.devAdminNoPassword)}
          onCancel={close}
          onOidc={async () => {
            setBusy(true);
            try {
              try {
                sessionStorage.setItem(oidcNextKey, (modal.next as string) || "session");
              } catch {
                // ignore
              }
              const res = await startOidc({
                data: {},
              });
              if (!res?.url) throw new Error("errors.oidcFail");
              window.location.assign(res.url);
            } catch (err) {
              toast.error(te(err));
              setBusy(false);
            }
          }}
          onUnlock={async (username, password, domain) => {
            setBusy(true);
            try {
              const res = await Promise.race([
                unlockEdit({
                  data: {
                    username,
                    password,
                    domain: domain === "ad" ? "ad" : "local",
                  },
                }),
                new Promise<never>((_, reject) => {
                  window.setTimeout(() => reject(new Error("errors.timeout")), 12e3);
                }),
              ]);
              if (res.sessionHttpOnly) {
                await pinSessCookie(res.token);
                try {
                  sessionStorage.removeItem(tokenKey);
                } catch {
                  // ignore
                }
              } else {
                try {
                  sessionStorage.setItem(tokenKey, res.token);
                } catch {
                  // ignore
                }
              }
              setToken(res.token);
              setSession(res.session);
              writeSessionInfo(res.session);
              const next = await getPortal({
                data: {
                  token: res.token,
                  spaceId: data.activeSpaceId,
                },
              });
              setData(next);
              if (modal.next === "admin")
                setModal({
                  kind: "admin",
                  tab: res.session?.canManageSettings ? adminTabRef.current : "about",
                });
              else if (modal.next === "history")
                setModal({
                  kind: "history",
                  tab: "recovery",
                });
              else if (modal.next === "users" && res.session?.canManageUsers)
                setModal({
                  kind: "users",
                });
              else if (modal.next === "curation" && res.session?.canCuration)
                setModal({
                  kind: "curation",
                });
              else if (modal.next === "edit" && sessionCanArrange(res.session)) {
                enterEdit();
                close();
              } else close();
            } catch (err) {
              toast.error(te(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {modal.kind === "stats" && (
        <StatsPanel catalog={data.catalog} scoped={clickStats.fullCatalog === false} onClose={close} />
      )}
      {modal.kind === "legend" && <LegendPanel onClose={close} />}
      {modal.kind === "users" && (
        <AccessFrame
          token={token}
          session={session}
          spaces={data.spaces}
          settings={data.settings}
          busy={busy}
          onClose={close}
          onSaveOidc={(payload) =>
            apply(
              async () => {
                const next = await updateOidcSettings({
                  data: {
                    token,
                    spaceId: data.activeSpaceId,
                    ...payload,
                  },
                });
                toast.success(t("toast.saved"));
                return next;
              },
              {
                close: false,
              },
            )
          }
          onSaveLdap={(payload) =>
            apply(
              async () => {
                const next = await updateLdapSettings({
                  data: {
                    token,
                    spaceId: data.activeSpaceId,
                    ...payload,
                  },
                });
                toast.success(t("toast.saved"));
                return next;
              },
              {
                close: false,
              },
            )
          }
          onSaveLoginOrder={(loginOrder) =>
            apply(
              async () => {
                const next = await updateLoginOrder({
                  data: {
                    token,
                    spaceId: data.activeSpaceId,
                    loginOrder,
                  },
                });
                return next;
              },
              {
                close: false,
              },
            )
          }
        />
      )}
      {modal.kind === "history" && (
        <HistoryPanel
          key={(modal.tab as string) || "recovery"}
          token={token}
          tab={(modal.tab as string) || "recovery"}
          onClose={close}
          onRestored={(next: PortalData) => {
            setData(next);
            if (next.session) {
              setSession(next.session);
              writeSessionInfo(next.session);
            }
          }}
        />
      )}
      {modal.kind === "curation" && (
        <CurationPanel
          token={token}
          busy={busy}
          spacePerms={session?.spacePerms || {}}
          picker={picker}
          catalog={data.catalog}
          probes={data.settings.healthChecks !== false}
          knownTags={allTags}
          tagColors={data.settings.tagColors}
          editContext={(cardId) => {
            for (const space of data.catalog) {
              for (const cat of space.categories) {
                const app = cat.cards.find((a) => a.id === cardId);
                if (app) {
                  return {
                    app,
                    categoryId: cat.id,
                    categories: data.categories.some((c) => c.id === cat.id) ? data.categories : space.categories,
                  };
                }
              }
            }
            return null;
          }}
          onSaveCard={(app, payload, onDone) =>
            apply(() => updateCard({ data: { token, id: app.id, ...payload } }), {
              close: false,
              onDone,
            })
          }
          onClose={close}
        />
      )}
      {modal.kind === "admin" && (
        <AdminPanel
          tab={(modal.tab as string) || "general"}
          settings={data.settings}
          runtime={data.runtime}
          catalog={data.catalog}
          tags={allTags}
          spaces={data.spaces}
          directory={data.directory || []}
          token={token}
          session={session}
          busy={busy}
          onTab={(tab: string) =>
            setModal({
              kind: "admin",
              tab,
            })
          }
          onCancel={close}
          onSaveSettings={(payload, opts) =>
            apply(
              () =>
                updateSettings({
                  data: {
                    token,
                    spaceId: data.activeSpaceId,
                    ...payload,
                  },
                }),
              opts,
            )
          }
          onResetClicks={async () => {
            setBusy(true);
            try {
              const next = await resetClicks({
                data: {
                  token,
                  spaceId: data.activeSpaceId,
                },
              });
              setData(next);
              if (next.clickStats) setClickStats(next.clickStats);
              else
                setClickStats({
                  all: 0,
                  today: 0,
                  week: 0,
                  month: 0,
                  year: 0,
                  spanDays: 0,
                });
              toast.success(t("toast.clicksReset"));
            } catch (err) {
              if (sessionGone(err)) return;
              toast.error(te(err));
            } finally {
              setBusy(false);
            }
          }}
          onResetProbes={async () => {
            setBusy(true);
            try {
              const next = await resetProbes({
                data: {
                  token,
                  spaceId: data.activeSpaceId,
                },
              });
              setData(next);
              toast.success(t("toast.probeReset"));
            } catch (err) {
              if (sessionGone(err)) return;
              toast.error(te(err));
            } finally {
              setBusy(false);
            }
          }}
          onApplyTags={async (payload) => {
            const colorOnly = Boolean(payload.colors) && !payload.rename && !payload.remove && !payload.create;
            if (!colorOnly) setBusy(true);
            try {
              const next = await manageTags({
                data: {
                  token,
                  spaceId: data.activeSpaceId,
                  ...payload,
                },
              });
              setData(next);
              if (!colorOnly) toast.success(t("toast.tagsUpdated"));
            } catch (err) {
              if (sessionGone(err)) return;
              toast.error(te(err));
            } finally {
              if (!colorOnly) setBusy(false);
            }
          }}
          onSaveTheme={(payload) =>
            apply(
              async () => {
                const next = await updateThemeCss({
                  data: {
                    token,
                    spaceId: data.activeSpaceId,
                    ...payload,
                  },
                });
                toast.success(t("toast.themesSaved"));
                return next;
              },
              {
                close: false,
              },
            )
          }
          onResetPortal={() =>
            apply(async () => {
              const next = await resetPortal({
                data: {
                  token,
                },
              });
              if (next.clickStats) setClickStats(next.clickStats);
              toast.success(t("toast.portalReset"));
              return next;
            })
          }
          onImportPortal={(payload) =>
            apply(async () => {
              const next = await importPortal({
                data: {
                  token,
                  payload,
                },
              });
              if (next.clickStats) setClickStats(next.clickStats);
              toast.success(t("toast.imported"));
              return next;
            })
          }
        />
      )}
      {modal.kind === "space" && (
        <ItemForm
          kind="space"
          initial={(modal.space as MenuSpace | null) ?? null}
          busy={busy}
          picker={picker}
          canAcl={sessionCanManageAcl(session)}
          people={data.directory || []}
          token={token}
          canImportSpace={Boolean(session?.isOwner || session?.canCreateSpaces)}
          onImportSpace={(payload) =>
            apply(async () => {
              const next = await importSpace({
                data: {
                  token,
                  payload,
                  afterId: (modal.space as MenuSpace | null)?.id,
                },
              });
              toast.success(t("toast.spaceImported"));
              return next;
            })
          }
          onCancel={close}
          onSave={(name, icon, access) =>
            apply(() =>
              modal.space
                ? updateSpace({
                    data: {
                      token,
                      id: (modal.space as MenuSpace).id,
                      name,
                      icon,
                      ...access,
                    },
                  })
                : createSpace({
                    data: {
                      token,
                      name,
                      icon,
                      ...access,
                    },
                  }),
            )
          }
        />
      )}
      {modal.kind === "favs" && (
        <FavsForm
          hideLabel={Boolean(data.settings.favsHideLabel)}
          busy={busy}
          onCancel={close}
          onSave={(hideLabel) =>
            apply(() =>
              updateFavsOptions({
                data: {
                  token,
                  hideLabel,
                  spaceId: data.activeSpaceId,
                },
              }),
            )
          }
        />
      )}
      {modal.kind === "category" && (
        <ItemForm
          kind="category"
          initial={(modal.category as PortalCategory | null) ?? null}
          busy={busy}
          picker={picker}
          canAcl={sessionCanManageAcl(session)}
          people={data.directory || []}
          onCancel={close}
          onSave={(name, icon, access) =>
            apply(() =>
              modal.category
                ? updateCategory({
                    data: {
                      token,
                      id: (modal.category as PortalCategory).id,
                      name,
                      icon,
                      ...access,
                    },
                  })
                : createCategory({
                    data: {
                      token,
                      spaceId: data.activeSpaceId,
                      name,
                      icon,
                      ...access,
                    },
                  }),
            )
          }
        />
      )}
      {modal.kind === "card" && (
        <CardForm
          categories={
            modal.app && !data.categories.some((c) => c.id === (modal.app as PortalCard).categoryId)
              ? (data.catalog.find((space) =>
                  space.categories.some((c) => c.id === (modal.app as PortalCard).categoryId),
                )?.categories ?? data.categories)
              : data.categories
          }
          categoryId={(modal.categoryId as string) || ""}
          catalog={data.catalog}
          initial={(modal.app as PortalCard | null) ?? null}
          busy={busy}
          picker={picker}
          probes={data.settings.healthChecks !== false}
          knownTags={allTags}
          tagColors={data.settings.tagColors}
          onCancel={close}
          onSave={(payload) =>
            apply(() =>
              modal.app
                ? updateCard({
                    data: {
                      token,
                      id: (modal.app as PortalCard).id,
                      ...payload,
                    },
                  })
                : createCard({
                    data: {
                      token,
                      ...payload,
                    },
                  }),
            )
          }
        />
      )}
      {modal.kind === "move-pick" && (
        <MovePickDialog
          category={modal.category as Category | null | undefined}
          spaces={data.spaces}
          fromSpaceId={modal.fromSpaceId as string | undefined}
          busy={busy}
          onCancel={close}
          onContinue={(destSpaceId) =>
            openMoveCat(
              modal.category as PortalCategory,
              modal.fromSpaceId as string | undefined,
              destSpaceId,
              undefined,
            )
          }
        />
      )}
      {modal.kind === "move-cat" && (
        <MoveSectionDialog
          impact={modal.impact as CategoryMoveImpact & { insertAt?: number }}
          busy={busy}
          onCancel={close}
          onConfirm={() =>
            apply(() =>
              moveCategory({
                data: {
                  token,
                  categoryId: (modal.impact as CategoryMoveImpact).categoryId,
                  destSpaceId: (modal.impact as CategoryMoveImpact).toId,
                  ...(typeof (modal.impact as { insertAt?: number }).insertAt === "number"
                    ? { insertAt: (modal.impact as { insertAt?: number }).insertAt }
                    : {}),
                },
              }),
            )
          }
        />
      )}
      {modal.kind === "confirm-cat" && (
        <ConfirmDialog
          inline
          title={t("confirm.deleteCategory")}
          body={t("confirm.deleteCategoryBody", {
            name: (modal.category as PortalCategory).name,
          })}
          busy={busy}
          onCancel={close}
          onOk={() =>
            apply(() =>
              deleteCategory({
                data: {
                  token,
                  id: (modal.category as PortalCategory).id,
                },
              }),
            )
          }
        />
      )}
      {modal.kind === "confirm-app" && (
        <ConfirmDialog
          inline
          title={itemKind((modal.app as PortalCard).kind).remove}
          body={t("item.removedBody", {
            name:
              String((modal.app as PortalCard).title || "").trim() ||
              itemKind((modal.app as PortalCard).kind).option,
          })}
          busy={busy}
          onCancel={close}
          onOk={() =>
            apply(() =>
              deleteCard({
                data: {
                  token,
                  id: (modal.app as PortalCard).id,
                },
              }),
            )
          }
        />
      )}
      {modal.kind === "confirm-space" && (
        <ConfirmDialog
          inline
          title={t("confirm.deleteSpace")}
          body={t("confirm.deleteSpaceBody", {
            name: (modal.space as MenuSpace).name,
          })}
          busy={busy}
          onCancel={close}
          onOk={() =>
            apply(() =>
              deleteSpace({
                data: {
                  token,
                  id: (modal.space as MenuSpace).id,
                },
              }),
            )
          }
        />
      )}
    </ModalShell>
  );
}
