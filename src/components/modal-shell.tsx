import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const layers: Array<() => void> = [];
let lockPrev: Record<string, string> | null = null;
let lockScrollY = 0;

function canScroll(el: Element) {
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
}

function insideScrollable(target: EventTarget | null, deltaY: number) {
  let n = target instanceof Element ? target : null;
  while (n && n !== document.body && n !== document.documentElement) {
    if (canScroll(n)) {
      const top = n.scrollTop;
      const max = n.scrollHeight - n.clientHeight;
      if ((deltaY < 0 && top > 0) || (deltaY > 0 && top < max)) return true;
      if (deltaY === 0) return true;
    }
    n = n.parentElement;
  }
  return false;
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopImmediatePropagation();
  layers[layers.length - 1]?.();
}

function onWheel(e: WheelEvent) {
  if (!insideScrollable(e.target, e.deltaY)) e.preventDefault();
}

function onTouchMove(e: TouchEvent) {
  if (!insideScrollable(e.target, 0)) e.preventDefault();
}

function applyLock() {
  const html = document.documentElement;
  const body = document.body;
  lockScrollY = window.scrollY;
  lockPrev = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPad: body.style.paddingRight,
  };
  const sb = window.innerWidth - html.clientWidth;
  html.classList.add("modal-open");
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${lockScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (sb > 0) body.style.paddingRight = `${sb}px`;
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
}

function releaseLock() {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("wheel", onWheel);
  window.removeEventListener("touchmove", onTouchMove);
  const html = document.documentElement;
  const body = document.body;
  const prev = lockPrev;
  lockPrev = null;
  html.classList.remove("modal-open");
  if (!prev) return;
  html.style.overflow = prev.htmlOverflow;
  body.style.overflow = prev.bodyOverflow;
  body.style.position = prev.bodyPosition;
  body.style.top = prev.bodyTop;
  body.style.left = prev.bodyLeft;
  body.style.right = prev.bodyRight;
  body.style.width = prev.bodyWidth;
  body.style.paddingRight = prev.bodyPad;
  window.scrollTo(0, lockScrollY);
}

function pushLayer(close: () => void) {
  const first = layers.length === 0;
  layers.push(close);
  if (first) applyLock();
  return () => {
    const i = layers.lastIndexOf(close);
    if (i >= 0) layers.splice(i, 1);
    if (!layers.length) releaseLock();
  };
}

export function ModalShell({
  children,
  onClose,
  wide = false,
  size,
  padded,
  label,
  labelledBy,
  role = "dialog",
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  size?: "wide" | "lg";
  padded?: boolean;
  label?: string;
  labelledBy?: string;
  role?: string;
}) {
  const resolved = size || (wide ? "wide" : "lg");
  const paddedBox = padded ?? resolved !== "wide";
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const close = () => onCloseRef.current?.();
    return pushLayer(close);
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-bg/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      onWheel={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      role="presentation"
    >
      <div
        className={cn(
          "w-full rounded-t-xl bg-surface shadow-card-hover sm:rounded-xl",
          resolved === "wide" && "max-h-[92dvh] overflow-hidden sm:w-auto sm:max-h-none",
          resolved !== "wide" && "max-h-[90dvh] max-w-lg",
          resolved !== "wide" && paddedBox && "overflow-y-auto overscroll-contain p-6",
          resolved !== "wide" && !paddedBox && "flex flex-col overflow-hidden",
        )}
        onClick={(e) => e.stopPropagation()}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
