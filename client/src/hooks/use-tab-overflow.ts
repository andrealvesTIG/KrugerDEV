import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Detects which children of a flex-wrap container would render on the second row
 * (i.e. don't fit on the first line) and returns their `data-tab-item` ids so the
 * caller can hide them and surface them in an overflow menu instead.
 *
 * The container should have `flex-wrap` enabled. Each overflow-able child should
 * carry `data-tab-item="<id>"`. Items the caller does not want to be considered
 * for overflow (e.g. the trigger button for the overflow menu itself) should not
 * carry that attribute.
 */
export function useTabOverflow(
  containerRef: RefObject<HTMLElement>,
  resetKey: unknown,
): Set<string> {
  const [overflow, setOverflow] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const items = Array.from(
        container.querySelectorAll<HTMLElement>("[data-tab-item]"),
      );
      if (items.length === 0) {
        setOverflow((prev) => (prev.size === 0 ? prev : new Set()));
        return;
      }

      const restore: Array<[HTMLElement, string]> = [];
      items.forEach((el) => {
        if (el.style.display === "none") {
          restore.push([el, el.style.display]);
          el.style.display = "";
        }
      });

      void container.offsetHeight;
      const firstTop = items[0].offsetTop;
      const next = new Set<string>();
      for (const el of items) {
        if (el.offsetTop > firstTop) {
          const id = el.dataset.tabItem;
          if (id) next.add(id);
        }
      }

      restore.forEach(([el, display]) => {
        el.style.display = display;
      });

      setOverflow((prev) => {
        if (
          prev.size === next.size &&
          Array.from(prev).every((id) => next.has(id))
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, resetKey]);

  return overflow;
}
