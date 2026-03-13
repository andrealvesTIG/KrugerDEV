import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { getBadgeOgData, injectBadgeOgTags, getSingleBadgeOgData, injectSingleBadgeOgTags } from "./badge-og";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      const singleBadgeMatch = url.match(/^\/badges\/([^/?#]+)\/([^/?#]+)/);
      const badgeMatch = url.match(/^\/badges\/([^/?#]+)$/);
      if (singleBadgeMatch) {
        const singleData = await getSingleBadgeOgData(singleBadgeMatch[1], singleBadgeMatch[2]);
        if (singleData) {
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          template = injectSingleBadgeOgTags(template, singleData, singleBadgeMatch[1], baseUrl);
        }
      } else if (badgeMatch) {
        const ogData = await getBadgeOgData(badgeMatch[1]);
        if (ogData) {
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          template = injectBadgeOgTags(template, ogData, badgeMatch[1], baseUrl);
        }
      }

      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
