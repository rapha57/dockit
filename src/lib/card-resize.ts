const RESIZE_EDGE = 8;

export function finePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

export function gridColCount() {
  if (typeof window === "undefined") return 1;
  if (window.matchMedia("(min-width: 64rem)").matches) return 3;
  if (window.matchMedia("(min-width: 40rem)").matches) return 2;
  return 1;
}

export function spanSize(n: number): 1 | 2 | 3 {
  return n === 2 || n === 3 ? n : 1;
}

export function nearestSpan(sizes: number[], value: number, max: number) {
  let best = 1;
  let dist = Infinity;
  for (let n = 1; n <= max; n++) {
    const d = Math.abs(sizes[n - 1] - value);
    if (d < dist) {
      dist = d;
      best = n;
    }
  }
  return best;
}

export type ResizeBox = { left: number; top: number; width: number; height: number };

export function liveResizeBox(
  start: ResizeBox,
  edge: { x: number; y: number },
  dx: number,
  dy: number,
  widths: number[],
  heights: number[],
  maxCols: number,
) {
  const minW = widths[0];
  const maxW = widths[Math.max(0, Math.min(maxCols, 3) - 1)];
  const minH = heights[0];
  const maxH = heights[2];
  const right = start.left + start.width;
  const bottom = start.top + start.height;
  let width = start.width;
  let height = start.height;
  let left = start.left;
  let top = start.top;
  if (edge.x === 1) width = Math.min(maxW, Math.max(minW, start.width + dx));
  else if (edge.x === -1) {
    width = Math.min(maxW, Math.max(minW, start.width - dx));
    left = right - width;
  }
  if (edge.y === 1) height = Math.min(maxH, Math.max(minH, start.height + dy));
  else if (edge.y === -1) {
    height = Math.min(maxH, Math.max(minH, start.height - dy));
    top = bottom - height;
  }
  return { left, top, width, height };
}

export function applyLiveBox(el: HTMLElement, box: ResizeBox) {
  el.style.left = `${Math.round(box.left)}px`;
  el.style.top = `${Math.round(box.top)}px`;
  el.style.width = `${Math.round(box.width)}px`;
  el.style.height = `${Math.round(box.height)}px`;
}

export function itemTrackHeights(grid: HTMLElement | null) {
  const gap = grid ? parseFloat(getComputedStyle(grid).rowGap) || 16 : 16;
  return [1, 2, 3].map((n) => n * 48 + (n * 6 - 1) * gap);
}

export function itemColWidths(grid: HTMLElement, cols: number) {
  const w = grid.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
  const colW = cols <= 1 ? w : (w - gap * (cols - 1)) / cols;
  return [1, 2, 3].map((n) => {
    const s = Math.min(n, cols);
    return s * colW + Math.max(0, s - 1) * gap;
  });
}

type ResizeEdge = { x: number; y: number } | null;

export function resizeCursor(edge: ResizeEdge) {
  if (!edge) return "";
  if (edge.x && edge.y) return edge.x === edge.y ? "nwse-resize" : "nesw-resize";
  return edge.x ? "ew-resize" : "ns-resize";
}

function resizeEdgeAt(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  maxCols: number,
): ResizeEdge {
  const left = x - rect.left;
  const top = y - rect.top;
  const onW = maxCols > 1 && left <= RESIZE_EDGE;
  const onE = maxCols > 1 && left >= rect.width - RESIZE_EDGE;
  const onN = top <= RESIZE_EDGE;
  const onS = top >= rect.height - RESIZE_EDGE;
  if (!onW && !onE && !onN && !onS) return null;
  return {
    x: onE ? 1 : onW ? -1 : 0,
    y: onS ? 1 : onN ? -1 : 0,
  };
}

export function cardResizeEdge(card: HTMLElement | null, clientX: number, clientY: number): ResizeEdge {
  if (!card) return null;
  const tools = card.querySelector(".card-corner");
  if (tools) {
    const r = tools.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return null;
  }
  const grip = card.querySelector(".card-grip");
  if (grip) {
    const r = grip.getBoundingClientRect();
    const pad = 8;
    if (
      clientX >= r.left - pad &&
      clientX <= r.right + pad &&
      clientY >= r.top - pad &&
      clientY <= r.bottom + pad
    )
      return null;
  }
  return resizeEdgeAt(card.getBoundingClientRect(), clientX, clientY, gridColCount());
}

export function hoverResizeCursor(card: HTMLElement, clientX: number, clientY: number) {
  const edge = cardResizeEdge(card, clientX, clientY);
  const cur = resizeCursor(edge);
  if ((card.dataset.resize || "") === cur) return;
  if (cur) {
    card.dataset.resize = cur;
    card.style.cursor = cur;
  } else {
    delete card.dataset.resize;
    card.style.cursor = "";
  }
}

export function clearResizeCursor(card: HTMLElement | null) {
  if (!card) return;
  delete card.dataset.resize;
  card.style.cursor = "";
}

export function setResizeUi(on: boolean, cursor?: string) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("is-card-resizing", on);
  document.documentElement.style.cursor = on ? cursor || "nwse-resize" : "";
}
