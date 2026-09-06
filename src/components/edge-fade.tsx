import { useCallback, useRef } from "react";

const EPS = 2;

export function attachEdgeFade(el) {
  const sync = () => {
    const top = el.scrollTop > EPS;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - EPS;
    const gutter = Math.max(el.offsetWidth - el.clientWidth, 0);
    el.style.setProperty("--sb", `${gutter}px`);
    el.classList.toggle("is-fade-top", top);
    el.classList.toggle("is-fade-bottom", bottom);
  };
  sync();
  el.addEventListener("scroll", sync, { passive: true });
  const ro = new ResizeObserver(sync);
  ro.observe(el);
  const mo = new MutationObserver(sync);
  mo.observe(el, { childList: true, subtree: true });
  return () => {
    el.removeEventListener("scroll", sync);
    ro.disconnect();
    mo.disconnect();
    el.classList.remove("is-fade-top", "is-fade-bottom");
    el.style.removeProperty("--sb");
  };
}

export function useEdgeFade() {
  const stop = useRef(null);
  return useCallback((node) => {
    stop.current?.();
    stop.current = node ? attachEdgeFade(node) : null;
  }, []);
}
