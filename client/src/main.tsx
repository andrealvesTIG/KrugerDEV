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

  window.addEventListener("unhandledrejection", (event) => {
    if (!isMeaningfulError(event.reason)) {
      event.preventDefault();
      // eslint-disable-next-line no-console
      console.debug("[app] suppressed empty unhandled rejection", event.reason);
    }
  });

  window.addEventListener("error", (event) => {
    if (!event.error && !isMeaningfulError(event.message)) {
      event.preventDefault();
      // eslint-disable-next-line no-console
      console.debug("[app] suppressed empty error event", event);
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
