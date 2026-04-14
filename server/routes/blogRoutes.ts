import type { Express, Request, Response } from "express";
import { getBlogPosts, getPublishedBlogPosts, getBlogPostBySlug, getBlogPostById, createBlogPost, updateBlogPost, deleteBlogPost } from "../storage/blogStorage";
import { insertBlogPostSchema } from "@shared/schema";
import { getUser } from "../storage/userStorage";

interface AuthenticatedUser {
  role: string;
}

async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  const userId = (req as Record<string, unknown>).user
    ? ((req as Record<string, unknown>).user as { claims?: { sub?: string } })?.claims?.sub
    : (req.session as Record<string, unknown>)?.userId as string | undefined;
  if (!userId) return null;
  const user = await getUser(userId);
  return user || null;
}

function hasAdminAccess(user: AuthenticatedUser): boolean {
  return user.role === "super_admin" || user.role === "marketing";
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const user = await getAuthenticatedUser(req);
  if (!user) { res.status(401).json({ message: "Not authenticated" }); return false; }
  if (!hasAdminAccess(user)) { res.status(403).json({ message: "Access denied" }); return false; }
  return true;
}

export function registerBlogRoutes(app: Express) {
  app.get("/api/media", async (_req, res) => {
    try {
      const posts = await getPublishedBlogPosts();
      res.json(posts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });

  app.get("/api/media/:slug", async (req, res) => {
    try {
      const post = await getBlogPostBySlug(req.params.slug);
      if (!post || post.status !== "published") {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });

  app.get("/api/admin/media", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const posts = await getBlogPosts();
      res.json(posts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });

  app.post("/api/admin/media", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const parsed = insertBlogPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid blog post data", errors: parsed.error.flatten().fieldErrors });
    }
    try {
      const post = await createBlogPost(parsed.data);
      res.status(201).json(post);
    } catch (err: unknown) {
      const dbErr = err as { message?: string; code?: string };
      if (dbErr.message?.includes("unique") || dbErr.code === "23505") {
        return res.status(409).json({ message: "A blog post with this slug already exists" });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });

  app.put("/api/admin/media/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await getBlogPostById(id);
      if (!existing) return res.status(404).json({ message: "Blog post not found" });
      const parsed = insertBlogPostSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid blog post data", errors: parsed.error.flatten().fieldErrors });
      }
      const post = await updateBlogPost(id, parsed.data);
      res.json(post);
    } catch (err: unknown) {
      const dbErr = err as { message?: string; code?: string };
      if (dbErr.message?.includes("unique") || dbErr.code === "23505") {
        return res.status(409).json({ message: "A blog post with this slug already exists" });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });

  app.delete("/api/admin/media/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const existing = await getBlogPostById(id);
      if (!existing) return res.status(404).json({ message: "Blog post not found" });
      await deleteBlogPost(id);
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ message });
    }
  });
}
