import * as React from "react";
import { Textarea } from "@/components/ui/textarea";

export interface AutoResizeTextareaProps
  extends React.ComponentProps<"textarea"> {
  minRows?: number;
  maxRows?: number;
}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(({ minRows = 2, maxRows, value, onChange, className, style, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    },
    [ref],
  );

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = window.getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight || "20") || 20;
    const paddingY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const minHeight = lineHeight * minRows + paddingY + borderY;
    const maxHeight = maxRows ? lineHeight * maxRows + paddingY + borderY : Infinity;
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = maxRows && el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minRows, maxRows]);

  React.useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  React.useEffect(() => {
    const handler = () => resize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [resize]);

  return (
    <Textarea
      {...props}
      ref={setRefs}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      className={className}
      style={{ resize: "none", overflow: "hidden", ...style }}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";
