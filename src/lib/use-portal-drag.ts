import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  placeCard,
  placeCarriedCard,
  placeCategory,
  placeSpaces,
} from "@/lib/layout-place";
import {
  applyLiveBox,
  gridColCount,
  itemColWidths,
  itemTrackHeights,
  liveResizeBox,
  nearestSpan,
  resizeCursor,
  setResizeUi,
  spanSize,
} from "@/lib/card-resize";
import { sessionGone } from "@/lib/session-gone";
import { t, te } from "@/lib/i18n";
import {
  hoverInsertAt,
  itemSpanClass,
  lockSelection,
  nudgeScroll,
  pointerAfter,
  setDragUi,
  swallowGhostClick,
  writeEditMode,
  type CarryState,
  type DragFoldState,
  type DragState,
  type MoreHoverState,
  type OverState,
  type ResizeLiveState,
  type CatHoverState,
  type SpaceHoverState,
} from "@/lib/portal-dnd";
import {
  moveCard,
  previewMoveCategory,
  reorderCards,
  reorderCategories,
  reorderSpaces,
  updateCard,
  type PortalCard,
  type PortalCategory,
  type SessionInfo,
} from "@/lib/portal";
import type { CategoryMoveImpact } from "@/lib/acl";
import type { MenuSpace, PortalData } from "@/lib/portal-ui";

export type { DragState, OverState, DragFoldState, CarryState };

export type PortalDragModal =
  | { kind: "move-cat"; impact: CategoryMoveImpact & { insertAt?: number } }
  | { kind: string; [key: string]: unknown };

function sessionCanEditSpace(session: SessionInfo | null | undefined, spaceId: string | undefined): boolean {
  if (!session || !spaceId) return false;
  if (session.isOwner) return true;
  return session.spacePerms?.[spaceId] === "edit";
}

export function usePortalDrag(opts: {
  dataRef: MutableRefObject<PortalData>;
  setData: Dispatch<SetStateAction<PortalData>>;
  tokenRef: MutableRefObject<string>;
  sessionRef: MutableRefObject<SessionInfo | null>;
  spaceListRef: MutableRefObject<HTMLDivElement | null>;
  spaceMoreRef: MutableRefObject<HTMLDivElement | null>;
  morePanelRef: MutableRefObject<HTMLDivElement | null>;
  moreOpenRef: MutableRefObject<boolean>;
  spaceOverflow: string[];
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  goSpace: (id: string) => void;
  stayEditing: () => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<PortalDragModal>>;
  activeSpaceRef: MutableRefObject<string>;
}) {
  const {
    dataRef,
    setData,
    tokenRef,
    sessionRef,
    spaceListRef,
    spaceMoreRef,
    morePanelRef,
    moreOpenRef,
    spaceOverflow,
    setMoreOpen,
    goSpace,
    stayEditing,
    setBusy,
    setModal,
    activeSpaceRef,
  } = opts;
  const token = tokenRef.current;
  const [drag, setDrag] = useState<DragState>(null);
  const [over, setOver] = useState<OverState>(null);
  const [dragFold, setDragFold] = useState<DragFoldState>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [spaceOverMore, setSpaceOverMore] = useState(false);
  const dragRef = useRef(drag);
  const overRef = useRef(over);
  const didDragRef = useRef(false);
  const spaceOverMoreRef = useRef(false);
  const moreHoverRef = useRef<MoreHoverState>(null);
  const spaceInsertRef = useRef(0);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const markerRef = useRef<HTMLElement | null>(null);
  const carryRef = useRef<CarryState>(null);
  const spaceHoverRef = useRef<SpaceHoverState>(null);
  const catHoverRef = useRef<CatHoverState>(null);
  const dragFoldRef = useRef<DragFoldState>(null);
  const dragPtrRef = useRef({ x: 0, y: 0 });
  const dragScrollRafRef = useRef(0);
  const ghostOff = useRef({ x: 0, y: 0 });
  const unbindDragRef = useRef<(() => void) | null>(null);
  const resizeLiveRef = useRef<ResizeLiveState>(null);
  dragRef.current = drag;
  overRef.current = over;
  spaceOverMoreRef.current = spaceOverMore;

  function unbindDrag() {
    unbindDragRef.current?.();
    unbindDragRef.current = null;
  }
  function endLiveResize() {
    const live = resizeLiveRef.current;
    if (!live) return;
    resizeLiveRef.current = null;
    live.placeholder?.remove();
    const el = live.origin;
    if (!el) return;
    el.classList.remove("is-live-resize");
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.height = "";
  }
  function stopDragScroll() {
    if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
    dragScrollRafRef.current = 0;
  }
  function startDragScroll() {
    if (dragScrollRafRef.current) return;
    const loop = () => {
      dragScrollRafRef.current = 0;
      if (!dragRef.current) return;
      nudgeScroll(dragPtrRef.current.x, dragPtrRef.current.y, spaceListRef.current);
      dragScrollRafRef.current = requestAnimationFrame(loop);
    };
    dragScrollRafRef.current = requestAnimationFrame(loop);
  }
  function applyFold(next: DragFoldState) {
    dragFoldRef.current = next;
    setDragFold(next);
  }
  function clearFold() {
    dragFoldRef.current = null;
    setDragFold(null);
    setLiveId(null);
  }
  function clearCarry() {
    carryRef.current = null;
    spaceHoverRef.current = null;
    catHoverRef.current = null;
    stopDragScroll();
    clearFold();
  }
  function canEditSpaceId(spaceId: string) {
    return sessionCanEditSpace(sessionRef.current, spaceId);
  }
  function hitMoreSlot(clientX: number, clientY: number) {
    const pad = 12;
    const panel = morePanelRef.current;
    const wrap = spaceMoreRef.current;
    if (panel) {
      const r = panel.getBoundingClientRect();
      const w = wrap?.getBoundingClientRect();
      const left = Math.min(r.left, w?.left ?? r.left) - pad;
      const right = Math.max(r.right, w?.right ?? r.right) + pad;
      const top = Math.min(r.top, w?.top ?? r.top) - pad;
      if (
        clientX >= left &&
        clientX <= right &&
        clientY >= top &&
        clientY <= r.bottom + pad
      )
        return true;
    }
    if (wrap) {
      const r = wrap.getBoundingClientRect();
      if (
        clientX >= r.left - pad &&
        clientX <= r.right + 28 &&
        clientY >= r.top - pad &&
        clientY <= r.bottom + (moreOpenRef.current ? 8 : 56)
      )
        return true;
    }
    return false;
  }
  function hitSpaceCarry(clientX: number, clientY: number): { spaceId: string; blocked: boolean } | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === ghostRef.current) continue;
      const el = node.closest("[data-space-id]");
      const spaceId = (el as HTMLElement | null)?.dataset?.spaceId;
      if (!spaceId) continue;
      if (!canEditSpaceId(spaceId))
        return {
          spaceId,
          blocked: true,
        };
      return {
        spaceId,
        blocked: false,
      };
    }
    return null;
  }
  function overForCarry(spaceId: string): OverState {
    const cur = dataRef.current;
    const cats =
      (cur.catalog ?? []).find((t) => t.id === spaceId)?.categories ||
      (spaceId === cur.activeSpaceId ? cur.categories : []);
    const cat = cats[0];
    const appId = carryRef.current?.app?.id;
    if (!cat)
      return {
        kind: "space-carry",
        spaceId,
      };
    return {
      kind: "card",
      catId: cat.id,
      insertAt: cat.cards.filter((a) => a.id !== appId).length,
    };
  }
  function overForCarryCat(spaceId: string): OverState {
    const cur = dataRef.current;
    const cats =
      (cur.catalog ?? []).find((t) => t.id === spaceId)?.categories ||
      (spaceId === cur.activeSpaceId ? cur.categories : []);
    return {
      kind: "cat",
      insertAt: cats.filter((c) => c.id !== dragRef.current?.id).length,
    };
  }
  function killGhost() {
    ghostRef.current?.remove();
    ghostRef.current = null;
    markerRef.current?.remove();
    markerRef.current = null;
  }
  function spawnGhost(from: HTMLElement, e: { clientX: number; clientY: number }, rect?: DOMRect) {
    ghostRef.current?.remove();
    const r = rect || from.getBoundingClientRect();
    const node = from.cloneNode(true) as HTMLElement;
    node.removeAttribute("data-card-id");
    node.removeAttribute("data-cat-id");
    node.removeAttribute("data-space-id");
    node.classList.add("drag-ghost");
    node.style.position = "fixed";
    node.style.left = `${r.left}px`;
    node.style.top = `${r.top}px`;
    node.style.width = `${r.width}px`;
    node.style.height = `${r.height}px`;
    node.style.maxHeight = `${r.height}px`;
    node.style.margin = "0";
    node.style.zIndex = "80";
    node.style.pointerEvents = "none";
    document.body.appendChild(node);
    ghostRef.current = node;
    ghostOff.current = {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
    };
  }
  function moveGhost(x: number, y: number) {
    const node = ghostRef.current;
    if (!node) return;
    node.style.left = `${x - ghostOff.current.x}px`;
    node.style.top = `${y - ghostOff.current.y}px`;
  }
  function finishAppDrag(ev?: { clientX: number; clientY: number }) {
    const x = ev?.clientX ?? dragPtrRef.current.x;
    const y = ev?.clientY ?? dragPtrRef.current.y;
    const tabHit = hitSpaceCarry(x, y);
    if (tabHit?.blocked) {
      unbindDrag();
      if (didDragRef.current) swallowGhostClick();
      killGhost();
      const from = carryRef.current?.fromSpaceId;
      clearCarry();
      setDrag(null);
      setOver(null);
      setDragUi(false);
      if (from && from !== dataRef.current.activeSpaceId) goSpace(from);
      toast.error(t("toast.noEditSpace"));
      return;
    }
    if (tabHit?.spaceId) {
      unbindDrag();
      if (didDragRef.current) swallowGhostClick();
      killGhost();
      const from = carryRef.current?.fromSpaceId;
      clearCarry();
      setDrag(null);
      setOver(null);
      setDragUi(false);
      if (from && from !== dataRef.current.activeSpaceId) goSpace(from);
      return;
    }
    unbindDrag();
    if (didDragRef.current) swallowGhostClick();
    commitDrag();
  }
  function bindSpaceDrag(spaceId: string, origin: HTMLElement | null) {
    unbindDrag();
    dragRef.current = { kind: "space", id: spaceId };
    const move = (ev: PointerEvent | MouseEvent) => {
      if (dragRef.current?.kind !== "space" || dragRef.current.id !== spaceId) return;
      const o = dragOriginRef.current;
      if (!o) dragOriginRef.current = { x: ev.clientX, y: ev.clientY };
      const dist = o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 11;
      if (dist > 10 && !didDragRef.current) {
        didDragRef.current = true;
        setDragUi(true);
        if (origin) {
          spawnGhost(origin, ev);
          if (ghostRef.current) ghostRef.current.style.zIndex = "95";
        }
        if (spaceOverflow.length) setMoreOpen(true);
      }
      if (!didDragRef.current) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      moveGhost(ev.clientX, ev.clientY);
      const row = spaceListRef.current?.getBoundingClientRect();
      const more = spaceMoreRef.current?.getBoundingClientRect();
      const overBar =
        row &&
        ev.clientY >= row.top - 8 &&
        ev.clientY <= row.bottom + 8 &&
        ev.clientX >= row.left &&
        ev.clientX < (more ? more.left - 8 : row.right);
      if (overBar) {
        const dragSpace = dragRef.current;
        const stripItems = spaceListRef.current
          ? [...spaceListRef.current.querySelectorAll<HTMLElement>(".space-item[data-space-id]")].filter(
              (el) => !el.classList.contains("is-overflow") && el.offsetWidth,
            )
          : [];
        const last = stripItems[stripItems.length - 1];
        const atEnd =
          dragSpace?.kind === "space" && last
            ? ev.clientX >= last.getBoundingClientRect().right + 8
            : false;
        if (atEnd && dragSpace && spaceOverflow.includes(dragSpace.id)) {
          spaceOverMoreRef.current = true;
          setSpaceOverMore(true);
        } else {
          spaceOverMoreRef.current = false;
          setSpaceOverMore(false);
        }
      } else {
        const inMore = hitMoreSlot(ev.clientX, ev.clientY);
        if (inMore) {
          setMoreOpen(true);
          spaceOverMoreRef.current = true;
          setSpaceOverMore(true);
        }
      }
      const insertAt = spaceInsertAt(
        ev.clientX,
        ev.clientY,
        spaceId,
        spaceOverMoreRef.current,
      );
      spaceInsertRef.current = insertAt;
      setOver((cur) =>
        cur?.kind === "space" && cur.insertAt === insertAt
          ? cur
          : {
              kind: "space",
              insertAt,
            },
      );
    };
    const up = (ev: Event) => {
      if (ev.type === "pointercancel" && !didDragRef.current) return;
      unbindDrag();
      endSpacePointer(spaceId, didDragRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("mousemove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("mouseup", up);
    window.addEventListener("pointercancel", up);
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function openMoveCat(
    category: PortalCategory,
    fromSpaceId: string | undefined,
    destSpaceId: string,
    insertAt: number | undefined,
  ) {
    setBusy(true);
    previewMoveCategory({
      data: {
        token: tokenRef.current,
        categoryId: category.id,
        destSpaceId,
      },
    })
      .then((impact: CategoryMoveImpact & { insertAt?: number }) =>
        setModal({
          kind: "move-cat",
          impact: {
            ...impact,
            insertAt: typeof insertAt === "number" ? insertAt : impact.insertAt,
          },
        }),
      )
      .catch((err) => {
        if (!sessionGone(err)) toast.error(te(err));
      })
      .finally(() => setBusy(false));
  }
  function bindCatDrag(catId: string, origin: HTMLElement) {
    unbindDrag();
    dragRef.current = { kind: "cat", id: catId };
    const ghostRect = origin.getBoundingClientRect();
    const ghostNode = origin.cloneNode(true) as HTMLElement;
    const move = (ev: PointerEvent | MouseEvent) => {
      if (dragRef.current?.kind !== "cat" || dragRef.current.id !== catId) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      const o = dragOriginRef.current;
      if (!o) dragOriginRef.current = { x: ev.clientX, y: ev.clientY };
      const dist = o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 11;
      if (dist > 10 && !didDragRef.current) {
        didDragRef.current = true;
        setLiveId(catId);
        setDragUi(true);
        spawnGhost(ghostNode, ev, ghostRect);
        startDragScroll();
        if (dataRef.current.settings.cardDragCollapse !== false) {
          applyFold({
            sourceId: catId,
            left: true,
            openId: catId,
          });
        }
      }
      if (!didDragRef.current) return;
      nudgeScroll(ev.clientX, ev.clientY, spaceListRef.current);
      moveGhost(ev.clientX, ev.clientY);
      const tabHit = hitSpaceCarry(ev.clientX, ev.clientY);
      const moreHit = hitMoreSlot(ev.clientX, ev.clientY);
      if (moreHit && !tabHit) {
        const hover = moreHoverRef.current;
        if (!hover) moreHoverRef.current = { at: Date.now() };
        else if (Date.now() - hover.at > 320) setMoreOpen(true);
        return;
      }
      if (tabHit && !tabHit.blocked) {
        setOver({
          kind: "space-carry",
          spaceId: tabHit.spaceId,
        });
        if (tabHit.spaceId !== dataRef.current.activeSpaceId) {
          const hover = spaceHoverRef.current;
          if (!hover || hover.spaceId !== tabHit.spaceId)
            spaceHoverRef.current = {
              spaceId: tabHit.spaceId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320) {
            goSpace(tabHit.spaceId);
            setMoreOpen(false);
            setOver(overForCarryCat(tabHit.spaceId));
            spaceHoverRef.current = {
              spaceId: tabHit.spaceId,
              at: Number.POSITIVE_INFINITY,
            };
          }
        }
        return;
      }
      spaceHoverRef.current = null;
      moreHoverRef.current = null;
      if (moreOpenRef.current && !moreHit) setMoreOpen(false);
      const insertAt = hitCatInsert(ev.clientY, catId);
      setOver((cur) =>
        cur?.kind === "cat" && cur.insertAt === insertAt
          ? cur
          : {
              kind: "cat",
              insertAt,
            },
      );
    };
    const up = (ev: Event) => {
      if (ev.type === "pointercancel" && !didDragRef.current) return;
      unbindDrag();
      killGhost();
      if (!didDragRef.current) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        clearCarry();
        return;
      }
      swallowGhostClick();
      const from = carryRef.current?.fromSpaceId;
      const cat =
        carryRef.current?.cat || dataRef.current.categories.find((c) => c.id === catId);
      const clientX = ev instanceof PointerEvent || ev instanceof MouseEvent ? ev.clientX : dragPtrRef.current.x;
      const clientY = ev instanceof PointerEvent || ev instanceof MouseEvent ? ev.clientY : dragPtrRef.current.y;
      const tabHit = hitSpaceCarry(clientX, clientY);
      if (tabHit?.blocked) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        if (from && from !== dataRef.current.activeSpaceId) goSpace(from);
        clearCarry();
        toast.error(t("toast.noEditSpace"));
        return;
      }
      const destSpaceId =
        tabHit?.spaceId && tabHit.spaceId !== from
          ? tabHit.spaceId
          : from && dataRef.current.activeSpaceId !== from
            ? dataRef.current.activeSpaceId
            : null;
      const insertAt = overRef.current?.kind === "cat" ? overRef.current.insertAt : undefined;
      if (destSpaceId && cat) {
        setDrag(null);
        setOver(null);
        setDragUi(false);
        clearCarry();
        openMoveCat(cat, from, destSpaceId, insertAt);
        return;
      }
      clearCarry();
      commitDrag();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("mousemove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("mouseup", up);
    window.addEventListener("pointercancel", up);
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function hitFoldCatId(clientX: number, clientY: number): string | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    let fromHead: string | null = null;
    let fromAny: string | null = null;
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (ghostRef.current?.contains(node) || markerRef.current?.contains(node)) continue;
      if (!fromHead) {
        const head = node.closest<HTMLElement>(".cat-head");
        if (head) {
          const section = head.closest<HTMLElement>("[data-cat-id]");
          if (section?.dataset.catId) fromHead = section.dataset.catId;
        }
      }
      if (!fromAny) {
        const section = node.closest<HTMLElement>("[data-cat-id]");
        if (section?.dataset.catId) fromAny = section.dataset.catId;
      }
      if (fromHead && fromAny) break;
    }
    return fromHead || fromAny;
  }
  function bindCardDrag(appId: string, origin: HTMLElement, fromCatId?: string) {
    unbindDrag();
    dragRef.current = { kind: "card", id: appId };
    const sourceCatId =
      fromCatId ||
      origin.closest<HTMLElement>("[data-cat-id]")?.dataset?.catId ||
      dataRef.current.categories.find((c) => c.cards.some((a) => a.id === appId))?.id;
    const move = (ev: PointerEvent | MouseEvent) => {
      if (dragRef.current?.kind !== "card" || dragRef.current.id !== appId) return;
      dragPtrRef.current = {
        x: ev.clientX,
        y: ev.clientY,
      };
      const o = dragOriginRef.current;
      if (!o) dragOriginRef.current = { x: ev.clientX, y: ev.clientY };
      const dist = o ? Math.hypot(ev.clientX - o.x, ev.clientY - o.y) : 9;
      if (dist > 8 && !didDragRef.current) {
        didDragRef.current = true;
        setLiveId(appId);
        setDragUi(true);
        spawnGhost(origin, ev);
        startDragScroll();
        if (dataRef.current.settings.cardDragCollapse !== false) {
          applyFold({
            sourceId: sourceCatId,
            left: true,
            openId: sourceCatId ?? null,
          });
        }
      }
      if (!didDragRef.current) return;
      nudgeScroll(ev.clientX, ev.clientY, spaceListRef.current);
      moveGhost(ev.clientX, ev.clientY);
      const tabHit = hitSpaceCarry(ev.clientX, ev.clientY);
      const moreHit = hitMoreSlot(ev.clientX, ev.clientY);
      if (moreHit && !tabHit) {
        const hover = moreHoverRef.current;
        if (!hover) moreHoverRef.current = { at: Date.now() };
        else if (Date.now() - hover.at > 320) setMoreOpen(true);
        return;
      }
      if (tabHit && !tabHit.blocked) {
        setOver({
          kind: "space-carry",
          spaceId: tabHit.spaceId,
        });
        if (tabHit.spaceId !== dataRef.current.activeSpaceId) {
          const hover = spaceHoverRef.current;
          if (!hover || hover.spaceId !== tabHit.spaceId)
            spaceHoverRef.current = {
              spaceId: tabHit.spaceId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320) {
            const dest = (dataRef.current.catalog ?? []).find((t) => t.id === tabHit.spaceId);
            if (!dest?.categories?.length) {
              toast.error(t("toast.needCategory"));
              spaceHoverRef.current = {
                spaceId: tabHit.spaceId,
                at: Number.POSITIVE_INFINITY,
              };
              return;
            }
            goSpace(tabHit.spaceId);
            setMoreOpen(false);
            setOver(overForCarry(tabHit.spaceId));
            spaceHoverRef.current = {
              spaceId: tabHit.spaceId,
              at: Number.POSITIVE_INFINITY,
            };
            if (dataRef.current.settings.cardDragCollapse !== false) {
              applyFold({
                sourceId: sourceCatId,
                left: true,
                openId: null,
              });
              catHoverRef.current = null;
            }
          }
        }
        return;
      }
      spaceHoverRef.current = null;
      moreHoverRef.current = null;
      if (moreOpenRef.current && !moreHit) setMoreOpen(false);
      if (dataRef.current.settings.cardDragCollapse !== false) {
        if (!dragFoldRef.current)
          applyFold({
            sourceId: sourceCatId,
            left: true,
            openId: null,
          });
        const overCatId = hitFoldCatId(ev.clientX, ev.clientY);
        const fold = dragFoldRef.current!;
        if (overCatId) {
          const hover = catHoverRef.current;
          if (!hover || hover.catId !== overCatId)
            catHoverRef.current = {
              catId: overCatId,
              at: Date.now(),
            };
          else if (Date.now() - hover.at > 320 && fold.openId !== overCatId) {
            applyFold({
              ...fold,
              openId: overCatId,
            });
            catHoverRef.current = {
              catId: overCatId,
              at: Number.POSITIVE_INFINITY,
            };
          }
        } else catHoverRef.current = null;
      }
      const hit = hitAppInsert(ev.clientX, ev.clientY, appId);
      if (!hit) return;
      const cur = overRef.current;
      if (cur?.kind === "card" && cur.catId === hit.catId && cur.insertAt === hit.insertAt) return;
      setOver(hit);
    };
    const up = (ev: Event) => {
      if (ev.type === "pointercancel" && !didDragRef.current) return;
      finishAppDrag(ev instanceof PointerEvent ? ev : undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("mousemove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("mouseup", up);
    window.addEventListener("pointercancel", up);
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("pointercancel", up);
    };
  }
  function bindAppResize(app: PortalCard, origin: HTMLElement, edge: { x: number; y: number }, ev: { clientX: number; clientY: number; pointerId: number }) {
    unbindDrag();
    endLiveResize();
    const grid = origin.closest<HTMLElement>("[data-app-grid]");
    const maxCols = gridColCount();
    const startPtr = {
      x: ev.clientX,
      y: ev.clientY,
    };
    const startRect = origin.getBoundingClientRect();
    const start = {
      left: startRect.left,
      top: startRect.top,
      width: startRect.width,
      height: startRect.height,
    };
    const startCol = spanSize(app.colSpan);
    const startRow = spanSize(app.rowSpan);
    const widths = grid
      ? itemColWidths(grid, maxCols)
      : [start.width, start.width, start.width];
    const heights = itemTrackHeights(grid);
    let box = {
      ...start,
    };
    let liveCol: number = startCol;
    let liveRow: number = startRow;
    const slot = document.createElement("div");
    slot.className = `resize-slot drop-slot ${itemSpanClass(app)}`;
    slot.setAttribute("data-resize-slot", "");
    const slotLab = document.createElement("span");
    slotLab.className = "drop-slot-label";
    slotLab.textContent = t("nav.dropHere");
    slot.appendChild(slotLab);
    origin.after(slot);
    origin.classList.add("is-live-resize");
    applyLiveBox(origin, start);
    resizeLiveRef.current = {
      origin,
      placeholder: slot,
    };
    const cursor = resizeCursor(edge);
    writeEditMode(true);
    setResizeUi(true, cursor);
    try {
      origin.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
    const paintSlot = (col: number, row: number) => {
      slot.className = `resize-slot drop-slot ${itemSpanClass({
        colSpan: col,
        rowSpan: row,
      })}`;
    };
    const move = (e: PointerEvent) => {
      e.preventDefault();
      box = liveResizeBox(
        start,
        edge,
        e.clientX - startPtr.x,
        e.clientY - startPtr.y,
        widths,
        heights,
        maxCols,
      );
      applyLiveBox(origin, box);
      const col = edge.x ? nearestSpan(widths, box.width, maxCols) : startCol;
      const row = edge.y ? nearestSpan(heights, box.height, 3) : startRow;
      if (col === liveCol && row === liveRow) return;
      liveCol = col;
      liveRow = row;
      paintSlot(col, row);
    };
    const up = () => {
      unbindDrag();
      const col = edge.x ? nearestSpan(widths, box.width, maxCols) : startCol;
      const row = edge.y ? nearestSpan(heights, box.height, 3) : startRow;
      endLiveResize();
      setResizeUi(false);
      if (col === startCol && row === startRow) return;
      persistAppSpan(app, col as 1 | 2 | 3, row as 1 | 2 | 3);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {
      once: true,
    });
    window.addEventListener("pointercancel", up, {
      once: true,
    });
    unbindDragRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      try {
        origin.releasePointerCapture?.(ev.pointerId);
      } catch {
        // ignore
      }
    };
  }
  function persistAppSpan(app: PortalCard, colSpan: 1 | 2 | 3, rowSpan: 1 | 2 | 3) {
    const current = dataRef.current;
    const categoryId =
      app.categoryId || current.categories.find((c) => c.cards.some((a) => a.id === app.id))?.id;
    if (!categoryId) return;
    if (spanSize(app.colSpan) === colSpan && spanSize(app.rowSpan) === rowSpan) return;
    const snapshot = current.categories;
    const nextCats = current.categories.map((c) => ({
      ...c,
      cards: c.cards.map((a) =>
        a.id === app.id
          ? {
              ...a,
              colSpan,
              rowSpan,
            }
          : a,
      ),
    }));
    setData({
      ...current,
      categories: nextCats,
    });
    updateCard({
      data: {
        token: tokenRef.current,
        id: app.id,
        categoryId,
        kind: app.kind || "app",
        title: app.title || "",
        description: app.description || "",
        url: app.url || "",
        icon: app.icon || "Link",
        tags: app.tags || [],
        colSpan,
        rowSpan,
        check: app.check || "off",
        checkHost: app.checkHost || "",
        links: app.links || [],
      },
    })
      .then((next) => {
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        if (!sessionGone(err)) toast.error(te(err));
        setData({
          ...current,
          categories: snapshot,
        });
        stayEditing();
      });
  }

  function sameLayout(a: PortalCategory[], b: PortalCategory[]) {
    return (
      JSON.stringify(
        a.map((c) => ({
          id: c.id,
          ids: c.cards.map((x) => x.id),
        })),
      ) ===
      JSON.stringify(
        b.map((c) => ({
          id: c.id,
          ids: c.cards.map((x) => x.id),
        })),
      )
    );
  }
  function persistMove(app: PortalCard, fromSpaceId: string, destSpaceId: string, nextCats: PortalCategory[]) {
    const current = dataRef.current;
    const snapshot = {
      categories: current.categories,
      catalog: current.catalog,
      activeSpaceId: current.activeSpaceId,
    };
    const dest = nextCats.find((c) => c.cards.some((a) => a.id === app.id));
    const placed = dest?.cards.find((a) => a.id === app.id);
    if (!dest || !placed) return;
    const catalog = (current.catalog ?? []).map((t) => {
      if (t.id === fromSpaceId)
        return {
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            cards: c.cards.filter((a) => a.id !== app.id),
          })),
        };
      if (t.id === destSpaceId)
        return {
          ...t,
          categories: nextCats,
        };
      return t;
    });
    setData({
      ...current,
      categories: nextCats,
      catalog,
      activeSpaceId: destSpaceId,
    });
    moveCard({
      data: {
        token: tokenRef.current,
        id: app.id,
        destSpaceId,
        destCategoryId: dest.id,
        sortOrder: placed.sortOrder || 1,
      },
    })
      .then((next) => {
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        toast.error(te(err));
        setData({
          ...current,
          ...snapshot,
        });
        stayEditing();
      });
  }
  function persistTabs(nextTabs: MenuSpace[]) {
    const current = dataRef.current;
    if (nextTabs.map((t) => t.id).join() === current.spaces.map((t) => t.id).join()) return;
    const snapshot = current.spaces;
    setData({
      ...current,
      spaces: nextTabs,
    });
    reorderSpaces({
      data: {
        token,
        spaceId: current.activeSpaceId,
        order: nextTabs.map((t) => t.id),
      },
    })
      .then((next) => {
        const latest = dataRef.current;
        setData({
          ...next,
          activeSpaceId: latest.activeSpaceId,
          categories: next.activeSpaceId === latest.activeSpaceId ? next.categories : latest.categories,
        });
        stayEditing();
      })
      .catch((err) => {
        if (sessionGone(err)) return;
        toast.error(te(err));
        setData({
          ...current,
          spaces: snapshot,
        });
        stayEditing();
      });
  }
  function persistLayout(nextCats: PortalCategory[]) {
    const current = dataRef.current;
    if (sameLayout(current.categories, nextCats)) return;
    const snapshot = current.categories;
    setData({
      ...current,
      categories: nextCats,
    });
    const placements = nextCats.flatMap((c) =>
      c.cards.map((a, i) => ({
        id: a.id,
        categoryId: c.id,
        sortOrder: i + 1,
      })),
    );
    const catChanged =
      nextCats.map((c) => c.id).join() !== current.categories.map((c) => c.id).join();
    const spaceId = activeSpaceRef.current || current.activeSpaceId;
    (catChanged
      ? reorderCategories({
          data: {
            token,
            spaceId,
            order: nextCats.map((c) => c.id),
          },
        }).then(() =>
          reorderCards({
            data: {
              token,
              spaceId,
              placements,
            },
          }),
        )
      : reorderCards({
          data: {
            token,
            spaceId,
            placements,
          },
        })
    )
      .then((next) => {
        const latest = dataRef.current;
        if (next.activeSpaceId !== latest.activeSpaceId && next.activeSpaceId !== current.activeSpaceId) {
          stayEditing();
          return;
        }
        setData(next);
        stayEditing();
      })
      .catch((err) => {
        toast.error(te(err));
        setData({
          ...current,
          categories: snapshot,
        });
        stayEditing();
      });
  }
  function commitDrag() {
    const d = dragRef.current;
    const o = overRef.current;
    const current = dataRef.current;
    unbindDrag();
    setDrag(null);
    setOver(null);
    killGhost();
    setDragUi(false);
    stopDragScroll();
    catHoverRef.current = null;
    clearFold();
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 50);
    if (!d || !o) return;
    if (d.kind === "space" && o.kind === "space") {
      const next = placeSpaces(current.spaces, d.id, o.insertAt);
      if (next) persistTabs(next);
      return;
    }
    if (d.kind === "card" && o.kind === "card") {
      const carry = carryRef.current;
      const destSpaceId = current.activeSpaceId;
      if (carry && carry.fromSpaceId !== destSpaceId && carry.app) {
        const nextCats = placeCarriedCard(current.categories, carry.app, o.catId, o.insertAt);
        if (nextCats) persistMove(carry.app, carry.fromSpaceId, destSpaceId, nextCats);
        clearCarry();
        return;
      }
      const next =
        placeCard(current.categories, d.id, o.catId, o.insertAt) ||
        (carry && placeCarriedCard(current.categories, carry.app, o.catId, o.insertAt));
      clearCarry();
      if (next) persistLayout(next);
      return;
    }
    if (d.kind === "cat" && o.kind === "cat") {
      const next = placeCategory(current.categories, d.id, o.insertAt);
      if (next) persistLayout(next);
    }
  }
  function spaceInsertAt(clientX: number, clientY: number, dragId: string, forceMore: boolean) {
    const ids = dataRef.current.spaces.map((t) => t.id).filter((id) => id !== dragId);
    const panel = morePanelRef.current;
    const useMore = forceMore || Boolean(panel);
    if (useMore && panel) {
      const box = panel.getBoundingClientRect();
      const inPanel =
        forceMore ||
        (clientX >= box.left &&
          clientX <= box.right &&
          clientY >= box.top &&
          clientY <= box.bottom);
      if (inPanel) {
        const nodes = [...panel.querySelectorAll<HTMLElement>("[data-space-id]")];
        let last = -1;
        for (const el of nodes) {
          const id = el.dataset.spaceId;
          if (!id || id === dragId) continue;
          const at = ids.indexOf(id);
          if (at >= 0) last = at;
          const r = el.getBoundingClientRect();
          if (clientY < r.top + r.height / 2) return at < 0 ? ids.length : at;
        }
        if (nodes.length) return last < 0 ? ids.length : last + 1;
      }
    }
    if (forceMore) {
      const ov = spaceOverflow.filter((id) => id !== dragId);
      if (!ov.length) return ids.length;
      const at = ids.indexOf(ov[0]);
      return at < 0 ? ids.length : at;
    }
    const root = spaceListRef.current;
    if (!root) return ids.length;
    const nodes = [...root.querySelectorAll<HTMLElement>(".space-item[data-space-id]")].filter(
      (el) => !el.classList.contains("is-overflow") && el.offsetWidth,
    );
    let last = -1;
    for (const el of nodes) {
      const id = el.dataset.spaceId;
      if (!id || id === dragId) continue;
      const at = ids.indexOf(id);
      if (at >= 0) last = at;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return at < 0 ? ids.length : at;
    }
    return last < 0 ? ids.length : last + 1;
  }
  function endSpacePointer(spaceId: string, moved: boolean) {
    spaceOverMoreRef.current = false;
    setSpaceOverMore(false);
    if (!moved) {
      setDrag(null);
      setOver(null);
      killGhost();
      setDragUi(false);
      goSpace(spaceId);
      return;
    }
    swallowGhostClick();
    const next = placeSpaces(dataRef.current.spaces, spaceId, spaceInsertRef.current);
    setDrag(null);
    setOver(null);
    killGhost();
    setDragUi(false);
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 50);
    if (next) persistTabs(next);
  }
  function hitAppInsert(
    clientX: number,
    clientY: number,
    dragId: string,
  ): { kind: "card"; catId: string; insertAt: number } | null {
    const stack = document.elementsFromPoint(clientX, clientY);
    let card: HTMLElement | undefined;
    let section: HTMLElement | undefined;
    let overSelf = false;
    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (ghostRef.current?.contains(node) || markerRef.current?.contains(node)) continue;
      const c = node.closest<HTMLElement>("[data-card-id]");
      if (c?.dataset.cardId === dragId) overSelf = true;
      else if (c?.dataset.cardId && !card) card = c;
      const s = node.closest<HTMLElement>("[data-cat-id]");
      if (s && !section) section = s;
    }
    if (overSelf) {
      const cur = overRef.current;
      if (cur?.kind === "card") return cur;
    }
    if (!section?.dataset.catId) return null;
    const catId = section.dataset.catId;
    const cat = dataRef.current.categories.find((c) => c.id === catId);
    if (!cat) return null;
    const destId = card?.dataset.cardId;
    if (destId && destId !== dragId && card) {
      const after = pointerAfter(
        {
          clientX,
          clientY,
        },
        card,
      );
      return {
        kind: "card",
        catId,
        insertAt: hoverInsertAt(
          cat.cards.map((a) => a.id),
          dragId,
          destId,
          after,
        ),
      };
    }
    return {
      kind: "card",
      catId,
      insertAt: cat.cards.filter((a) => a.id !== dragId).length,
    };
  }
  function hitCatInsert(clientY: number, dragId: string) {
    const others = [...document.querySelectorAll<HTMLElement>("[data-cat-id]")].filter(
      (el) => el.dataset.catId && el.dataset.catId !== dragId,
    );
    for (let i = 0; i < others.length; i++) {
      const r = (
        others[i].querySelector("[data-cat-handle]") ??
        others[i].querySelector("h2") ??
        others[i]
      ).getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return others.length;
  }

  useEffect(() => {
    const forceIdle = () => {
      unbindDragRef.current?.();
      unbindDragRef.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      didDragRef.current = false;
      dragRef.current = null;
      overRef.current = null;
      carryRef.current = null;
      spaceHoverRef.current = null;
      catHoverRef.current = null;
      clearFold();
      if (dragScrollRafRef.current) cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = 0;
      setDrag(null);
      setOver(null);
      setDragUi(false);
      document.documentElement.classList.remove("is-dragging");
      const live = resizeLiveRef.current;
      resizeLiveRef.current = null;
      live?.placeholder?.remove();
      if (live?.origin) {
        live.origin.classList.remove("is-live-resize");
        live.origin.style.left = "";
        live.origin.style.top = "";
        live.origin.style.width = "";
        live.origin.style.height = "";
      }
      setResizeUi(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (dragRef.current ||
          document.documentElement.classList.contains("is-dragging") ||
          document.documentElement.classList.contains("is-card-resizing"))
      )
        forceIdle();
    };
    const onHide = () => {
      if (document.hidden) forceIdle();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", forceIdle);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", forceIdle);
      document.removeEventListener("visibilitychange", onHide);
      forceIdle();
    };
  }, []);
  useEffect(() => {
    const block = (e: Event) => {
      if (dragRef.current || document.documentElement.classList.contains("is-card-resizing"))
        e.preventDefault();
    };
    document.addEventListener("selectstart", block);
    return () => document.removeEventListener("selectstart", block);
  }, []);

  const carryFromSpaceId = carryRef.current?.fromSpaceId;
  const carryDestSpaceId =
    over?.kind === "space-carry"
      ? over.spaceId
      : carryFromSpaceId && carryFromSpaceId !== dataRef.current.activeSpaceId
        ? dataRef.current.activeSpaceId
        : null;

  return {
    drag,
    over,
    dragFold,
    liveId,
    setDrag,
    setOver,
    spaceOverMore,
    setSpaceOverMore,
    didDragRef,
    dragOriginRef,
    carryRef,
    dragRef,
    overRef,
    bindSpaceDrag,
    bindCatDrag,
    bindCardDrag,
    bindAppResize,
    openMoveCat,
    spaceInsertRef,
    spaceOverMoreRef,
    carryDestSpaceId,
    lockSelection,
    writeEditMode,
  };
}
