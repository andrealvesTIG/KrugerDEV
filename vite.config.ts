import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    // Injects our `unhandledrejection` / `error` filter BEFORE the
    // runtime-error-overlay plugin's own listener. Vite's plugin uses
    // `transformIndexHtml` to head-prepend its <script>; by placing this
    // plugin *after* runtime-error-overlay in the array and also using
    // head-prepend, our tag ends up above theirs in the served HTML, so
    // our listener registers (and runs) first. We then call
    // stopImmediatePropagation for empty / non-Error throws (Google
    // Analytics, Meta Pixel, Microsoft Clarity, LinkedIn Insight have
    // all been seen throwing these), preventing Vite's listener from
    // popping a useless "(unknown runtime error)" overlay. Real Errors
    // fall through normally.
    {
      name: "suppress-empty-error-overlay",
      apply: "serve",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: {},
            injectTo: "head-prepend",
            children: `(function () {
  function isMeaningful(value) {
    if (value instanceof Error) return true;
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") {
      try { return Object.keys(value).length > 0; } catch (_) { return true; }
    }
    return true;
  }
  window.addEventListener("unhandledrejection", function (event) {
    if (!isMeaningful(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener("error", function (event) {
    if (!event.error && !isMeaningful(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();`,
          },
        ];
      },
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react/jsx-runtime"],
          "vendor-router": ["wouter"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-popover",
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-label",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-toggle",
          ],
          "vendor-charts": ["recharts"],
          "vendor-motion": ["framer-motion"],
          "vendor-dates": ["date-fns"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-pdf": ["@react-pdf/renderer"],
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
