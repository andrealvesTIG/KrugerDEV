import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { getBadgeOgData, injectBadgeOgTags } from "./badge-og";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve videos from client/public/videos (large files not bundled by Vite)
  const videosPath = path.resolve(process.cwd(), "client", "public", "videos");
  if (fs.existsSync(videosPath)) {
    app.use("/videos", express.static(videosPath));
  }

  app.use(express.static(distPath));

  app.use("*", async (req, res) => {
    const url = req.originalUrl;
    const badgeMatch = url.match(/^\/badges\/([^/?#]+)/);
    if (badgeMatch) {
      try {
        const ogData = await getBadgeOgData(badgeMatch[1]);
        if (ogData) {
          let html = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
          html = injectBadgeOgTags(html, ogData, badgeMatch[1]);
          return res.status(200).set({ "Content-Type": "text/html" }).end(html);
        }
      } catch {}
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
