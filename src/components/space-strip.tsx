import { Fragment, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Copy, GripVertical, Lock, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { PortalIcon } from "@/lib/icons";
import { t } from "@/lib/i18n";
import { tagTone } from "@/lib/tag-colors";
import type { MenuSpace } from "@/lib/portal-ui";

export function pickVisibleSpaceIds(
  spaces: { id: string }[] | null | undefined,
  widths: Map<string, number>,
  activeId: string | null | undefined,
  avail: number,
  favW: number,
  plusW: number,
  moreW: number,
  gap: number,
) {
  const ids = (spaces || []).map((s) => s.id);
  const wOf = (id: string) => widths.get(id) || 72;
  function total(vis: string[], showMore: boolean) {
    const n = 1 + vis.length + (showMore ? 1 : 0) + (plusW > 0 ? 1 : 0);
    let w = favW + (showMore ? moreW : 0) + plusW;
    for (const id of vis) w += wOf(id);
    return w + Math.max(0, n - 1) * gap;
  }
  function pack(showMore: boolean) {
    const vis: string[] = [];
    for (const id of ids) {
      if (total([...vis, id], showMore) <= avail || id === activeId) vis.push(id);
    }
    if (activeId && ids.includes(activeId) && !vis.includes(activeId)) vis.push(activeId);
    while (total(vis, showMore) > avail) {
      const drop = [...vis].reverse().find((id) => id !== activeId);
      if (!drop) break;
      vis.splice(vis.indexOf(drop), 1);
    }
    return vis;
  }
  let vis = pack(false);
  let hid = ids.filter((id) => !vis.includes(id));
  if (hid.length) {
    vis = pack(true);
    hid = ids.filter((id) => !vis.includes(id));
  }
  return hid;
}

export type SpaceStripHandlers = {
  goFavs: () => void;
  goSpace: (id: string) => void;
  editFavs: () => void;
  editSpace: (space: MenuSpace) => void;
  duplicateSpace: (space: MenuSpace) => void;
  deleteSpace: (space: MenuSpace) => void;
  addSpace: () => void;
  onSpacePointerDown: (e: ReactPointerEvent<HTMLButtonElement>, space: MenuSpace, index: number) => void;
  onMoreSpacePointerDown: (e: ReactPointerEvent<HTMLButtonElement>, space: MenuSpace) => void;
  didDrag: () => boolean;
  toggleMore: () => void;
  closeMore: () => void;
};

export function SpaceStrip({
  spaces,
  overflowIds,
  moreMenuSpaces,
  moreGapAt,
  moreOpen,
  dragSpaceId,
  carryDestSpaceId,
  spaceOverMore,
  onFavs,
  favsPage,
  favCount,
  favsHideLabel,
  editMode,
  canReorder,
  canEditFavs,
  canEditSpace,
  canCreateSpaces,
  canDeleteSpaces,
  activeSpaceId,
  searching,
  searchHitIds,
  spaceListRef,
  spaceStripRef,
  spaceMoreRef,
  morePanelRef,
  handlers,
}: {
  spaces: MenuSpace[];
  overflowIds: string[];
  moreMenuSpaces: MenuSpace[];
  moreGapAt: number;
  moreOpen: boolean;
  dragSpaceId?: string;
  carryDestSpaceId?: string | null;
  spaceOverMore: boolean;
  onFavs: boolean;
  favsPage: boolean;
  favCount: number;
  favsHideLabel: boolean;
  editMode: boolean;
  canReorder: boolean;
  canEditFavs: boolean;
  canEditSpace: (id: string) => boolean;
  canCreateSpaces: boolean;
  canDeleteSpaces: boolean;
  activeSpaceId: string;
  searching: boolean;
  searchHitIds: string[];
  spaceListRef: RefObject<HTMLDivElement | null>;
  spaceStripRef: RefObject<HTMLDivElement | null>;
  spaceMoreRef: RefObject<HTMLDivElement | null>;
  morePanelRef: RefObject<HTMLDivElement | null>;
  handlers: SpaceStripHandlers;
}) {
  if (spaces.length === 0) return null;
  const clickOrDrag = (fn: () => void) => {
    if (handlers.didDrag()) return;
    fn();
  };
  return (
    <div ref={spaceListRef} className="space-row">
      <div ref={spaceStripRef} className="space-strip">
        <button
          type="button"
          data-space-slot="fav"
          onClick={() => clickOrDrag(handlers.goFavs)}
          className={`space-item ${onFavs ? "is-on" : ""} ${favsHideLabel ? "is-icon" : ""}`}
          aria-pressed={onFavs}
          aria-label={t("nav.favorites")}
          title={t("nav.favorites")}
        >
          <Star className="space-ico" fill={onFavs || favCount > 0 ? "currentColor" : "none"} />
          {favsHideLabel ? null : <span>{t("nav.favorites")}</span>}
          {favCount > 0 ? (
            <span className="count-chip" data-tone={tagTone(t("nav.favorites"))}>
              {favCount}
            </span>
          ) : null}
          {editMode && onFavs && canEditFavs ? (
            <span
              className="ml-1 flex items-center gap-[0.35rem]"
              data-space-action=""
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span
                role="button"
                className="card-tool"
                aria-label={t("aria.editSpace")}
                title={t("aria.editSpace")}
                onClick={handlers.editFavs}
              >
                <Pencil className="size-3.5" />
              </span>
            </span>
          ) : null}
        </button>
        {spaces.map((space, spaceIndex) => (
          <Fragment key={space.id}>
            {overflowIds.includes(space.id) &&
            dragSpaceId === space.id &&
            !spaceOverMore &&
            spaces.slice(spaceIndex + 1).some((s) => !overflowIds.includes(s.id)) ? (
              <div className="drop-slot space-gap">
                <span className="drop-slot-label">{t("nav.dropHere")}</span>
              </div>
            ) : null}
            <button
              type="button"
              data-space-id={space.id}
              onClick={() => clickOrDrag(() => handlers.goSpace(space.id))}
              onPointerDown={(e) => handlers.onSpacePointerDown(e, space, spaceIndex)}
              className={`space-item ${canReorder ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${dragSpaceId === space.id ? "is-src" : ""} ${carryDestSpaceId === space.id ? "is-drop" : ""} ${space.id === activeSpaceId && !favsPage ? "is-on" : searching && searchHitIds.includes(space.id) ? "text-fg" : searching ? "text-subtle" : ""} ${space.hideLabel ? "is-icon" : ""} ${overflowIds.includes(space.id) ? "is-overflow" : ""}`}
              title={space.name}
              aria-label={space.name}
            >
              {canReorder ? <GripVertical className="space-ico text-subtle" aria-hidden /> : null}
              <PortalIcon name={space.icon} className="space-ico" />
              {space.hideLabel ? null : <span className="space-item-name">{space.name}</span>}
              {space.restricted ? (
                <span title={t("aria.restrictedSpace")}>
                  <Lock className="space-ico text-muted" aria-label={t("aria.restrictedSpace")} />
                </span>
              ) : null}
              {editMode && space.id === activeSpaceId && canEditSpace(space.id) ? (
                <span
                  className="ml-1 flex items-center gap-[0.35rem]"
                  data-space-action=""
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {canCreateSpaces ? (
                    <span
                      role="button"
                      className="card-tool"
                      aria-label={t("aria.duplicateSpace")}
                      title={t("aria.duplicateSpace")}
                      onClick={() => handlers.duplicateSpace(space)}
                    >
                      <Copy className="size-3.5" />
                    </span>
                  ) : null}
                  <span
                    role="button"
                    className="card-tool"
                    aria-label={t("aria.editSpace")}
                    title={t("aria.editSpace")}
                    onClick={() => handlers.editSpace(space)}
                  >
                    <Pencil className="size-3.5" />
                  </span>
                  {canDeleteSpaces ? (
                    <span
                      role="button"
                      className="card-tool is-danger"
                      aria-label={t("aria.deleteSpace")}
                      title={t("aria.deleteSpace")}
                      onClick={() => handlers.deleteSpace(space)}
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="space-row-end">
        <div ref={spaceMoreRef} className="space-more-wrap" data-space-slot="more">
          <button
            type="button"
            className={`space-item space-more ${overflowIds.length ? "" : "is-off"}`}
            aria-label={t("nav.moreSpaces")}
            title={t("nav.moreSpaces")}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handlers.toggleMore();
            }}
          >
            <MoreHorizontal className="space-ico" />
            {overflowIds.length > 1 ? <span className="count-chip">{overflowIds.length}</span> : null}
          </button>
          {moreOpen && overflowIds.length && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={morePanelRef}
                  className="account-panel space-more-panel"
                  role="menu"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <p className="menu-kicker">{t("nav.moreSpaces")}</p>
                  {moreMenuSpaces.map((space, i) => (
                    <Fragment key={space.id}>
                      {moreGapAt === i ? (
                        <div className="drop-slot space-more-gap">
                          <span className="drop-slot-label">{t("nav.dropHere")}</span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        data-space-id={space.id}
                        role="menuitem"
                        className={`${canReorder ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${carryDestSpaceId === space.id ? "is-drop" : ""}`}
                        onClick={() => {
                          if (handlers.didDrag()) return;
                          handlers.goSpace(space.id);
                          handlers.closeMore();
                        }}
                        onPointerDown={(e) => handlers.onMoreSpacePointerDown(e, space)}
                      >
                        {canReorder ? <GripVertical className="space-ico text-subtle" aria-hidden /> : null}
                        <PortalIcon name={space.icon} className="space-ico" />
                        <span className="min-w-0 truncate">{space.name}</span>
                        {space.restricted ? <Lock className="space-ico ml-auto text-muted" aria-hidden /> : null}
                      </button>
                    </Fragment>
                  ))}
                  {moreGapAt === moreMenuSpaces.length ? (
                    <div className="drop-slot space-more-gap">
                      <span className="drop-slot-label">{t("nav.dropHere")}</span>
                    </div>
                  ) : null}
                </div>,
                document.body,
              )
            : null}
        </div>
        {editMode && canCreateSpaces ? (
          <button
            type="button"
            data-space-slot="plus"
            className="card-tool self-center"
            aria-label={t("actions.addSpace")}
            title={t("actions.addSpace")}
            onClick={handlers.addSpace}
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
