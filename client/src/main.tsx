import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

if (typeof window !== "undefined") {
  const isMeaningfulError = (value: unknown): boolean => {
    if (value instanceof Error) return true;
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return true;
  };

  // Capture phase + stopImmediatePropagation so we beat Vite's
  // runtime-error-modal listener, which would otherwise pop a useless
  // "(unknown runtime error)" overlay for non-Error throws coming from
  // third-party scripts (Google Analytics, Microsoft Clarity, etc.).
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      if (!isMeaningfulError(event.reason)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        // eslint-disable-next-line no-console
        console.debug("[app] suppressed empty unhandled rejection", event.reason);
      }
    },
    true,
  );

  window.addEventListener(
    "error",
    (event) => {
      if (!event.error && !isMeaningfulError(event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        // eslint-disable-next-line no-console
        console.debug("[app] suppressed empty error event", event);
      }
    },
    true,
  );
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
