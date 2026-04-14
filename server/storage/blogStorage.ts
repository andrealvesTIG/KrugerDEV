import { db } from "../db";
import { blogPosts, type BlogPost, type InsertBlogPost } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export async function getBlogPosts(): Promise<BlogPost[]> {
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
}

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  return db.select().from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt));
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
  return post;
}

export async function getBlogPostById(id: number): Promise<BlogPost | undefined> {
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
  return post;
}

export async function createBlogPost(data: InsertBlogPost): Promise<BlogPost> {
  const [post] = await db.insert(blogPosts).values(data).returning();
  return post;
}

export async function updateBlogPost(id: number, data: Partial<InsertBlogPost>): Promise<BlogPost> {
  const [post] = await db.update(blogPosts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(blogPosts.id, id))
    .returning();
  return post;
}

export async function deleteBlogPost(id: number): Promise<void> {
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}
