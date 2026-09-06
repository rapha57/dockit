import { useCallback, useRef, type HTMLAttributes } from "react";

const EPS = 2;

function attachEdgeFade(el: HTMLElement) {
  const host = el.parentElement;
  const sync = () => {
    const top = el.scrollTop > EPS;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - EPS;
    host?.classList.toggle("is-fade-top", top);
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
    host?.classList.remove("is-fade-top");
    el.classList.remove("is-fade-bottom");
  };
}

function useEdgeFade() {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((node: HTMLElement | null) => {
    stop.current?.();
    stop.current = node ? attachEdgeFade(node) : null;
  }, []);
}

export function EdgeFade({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useEdgeFade();
  return (
    <div className="edge-fade">
      <div ref={ref} className={className} data-edge-scroll {...props}>
        {children}
      </div>
    </div>
  );
}
