import type { Express } from "express";
import { getBlogPosts, getPublishedBlogPosts, getBlogPostBySlug, getBlogPostById, createBlogPost, updateBlogPost, deleteBlogPost } from "../storage/blogStorage";
import { insertBlogPostSchema } from "@shared/schema";

function hasAdminAccess(user: any): boolean {
  return user?.role === "super_admin" || user?.role === "marketing";
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = req.user?.claims?.sub || req.session?.userId;
  if (!userId) { res.status(401).json({ message: "Not authenticated" }); return false; }
  const user = await (await import("../storage/userStorage")).getUser(userId);
  if (!user || !hasAdminAccess(user)) { res.status(403).json({ message: "Access denied" }); return false; }
  return true;
}

export function registerBlogRoutes(app: Express) {
  app.get("/api/media", async (_req, res) => {
    try {
      const posts = await getPublishedBlogPosts();
      res.json(posts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/media/:slug", async (req, res) => {
    try {
      const post = await getBlogPostBySlug(req.params.slug);
      if (!post || post.status !== "published") {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/media", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const posts = await getBlogPosts();
      res.json(posts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/media", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    const parsed = insertBlogPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid blog post data", errors: parsed.error.flatten().fieldErrors });
    }
    try {
      const post = await createBlogPost(parsed.data);
      res.status(201).json(post);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.code === "23505") {
        return res.status(409).json({ message: "A blog post with this slug already exists" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/media/:id", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const id = parseInt(req.params.id);
      const existing = await getBlogPostById(id);
      if (!existing) return res.status(404).json({ message: "Blog post not found" });
      const post = await updateBlogPost(id, req.body);
      res.json(post);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.code === "23505") {
        return res.status(409).json({ message: "A blog post with this slug already exists" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/media/:id", async (req: any, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const id = parseInt(req.params.id);
      const existing = await getBlogPostById(id);
      if (!existing) return res.status(404).json({ message: "Blog post not found" });
      await deleteBlogPost(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
