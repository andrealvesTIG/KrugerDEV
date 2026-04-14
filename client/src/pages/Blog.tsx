import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { BlogPost } from "@shared/schema";
import { Loader2, ArrowRight, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";

export default function Blog() {
  const [, setLocation] = useLocation();

  const { data: posts, isLoading, error } = useQuery<BlogPost[]>({
    queryKey: ["/api/blog"],
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); setLocation("/"); }}>
            <img src={logoIcon} alt="FridayReport.AI" className="h-8 w-8" />
            <span className="font-display font-bold text-lg text-gray-900">FridayReport.AI</span>
          </a>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>Home</Button>
            <Button size="sm" onClick={() => setLocation("/auth?source=blog")}>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 mb-3">Blog</h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Insights on project management, PMO best practices, and product updates from the FridayReport.AI team.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-xl font-medium mb-2">Failed to load posts</p>
            <p className="text-sm">Please try again later.</p>
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-xl font-medium mb-2">No posts yet</p>
            <p className="text-sm">Check back soon for new content.</p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group cursor-pointer rounded-xl border border-gray-100 bg-white overflow-hidden hover:shadow-lg transition-shadow"
                onClick={() => setLocation(`/blog/${post.slug}`)}
              >
                {post.coverImageUrl && (
                  <div className="aspect-video overflow-hidden bg-gray-50">
                    <img
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <div className="p-5">
                  <h2 className="font-display font-semibold text-lg text-gray-900 mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-gray-500 mb-4 line-clamp-3">{post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {post.author}
                    </span>
                    {post.publishedAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(post.publishedAt), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} FridayReport.AI &mdash; Built by Trusted IT Group, Inc.
        </div>
      </footer>
    </div>
  );
}
