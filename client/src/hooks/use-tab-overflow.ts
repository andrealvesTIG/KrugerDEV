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

      // Snapshot current inline display (value + priority) so we can restore
      // exactly. We force every item visible with !important so that any
      // class-based hiding (e.g. Tailwind's `!hidden` => display:none!important)
      // is overridden during measurement. Without this the hook would see
      // hidden items with offsetTop=0, decide nothing overflows, un-hide them,
      // re-detect overflow, hide them again, looping forever.
      const restore: Array<[HTMLElement, string, string]> = [];
      items.forEach((el) => {
        restore.push([
          el,
          el.style.getPropertyValue("display"),
          el.style.getPropertyPriority("display"),
        ]);
        el.style.setProperty("display", "flex", "important");
      });

      void container.offsetHeight;
      const firstTop = items[0].offsetTop;
      const next = new Set<string>();
      for (const el of items) {
        const id = el.dataset.tabItem ?? "?";
        if (el.offsetTop > firstTop) {
          if (id) next.add(id);
        }
      }

      restore.forEach(([el, value, priority]) => {
        if (value) {
          el.style.setProperty("display", value, priority);
        } else {
          el.style.removeProperty("display");
        }
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
