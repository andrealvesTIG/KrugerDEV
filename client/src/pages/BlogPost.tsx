import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import type { BlogPost as BlogPostType } from "@shared/schema";
import { Loader2, ArrowLeft, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";

export default function BlogPost() {
  const [, setLocation] = useLocation();
  const params = useParams<{ slug: string }>();

  const { data: post, isLoading, error } = useQuery<BlogPostType>({
    queryKey: [`/api/media/${params.slug}`],
    enabled: !!params.slug,
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); setLocation("/"); }}>
            <img src={logoIcon} alt="FridayReport.AI" className="h-8 w-8" />
            <span className="font-display font-bold text-lg text-gray-900">FridayReport.AI</span>
          </a>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/media")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              All Posts
            </Button>
            <Button size="sm" onClick={() => setLocation("/auth?source=media")}>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !post ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Post not found</h2>
            <p className="text-gray-500 mb-6">The post you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => setLocation("/media")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Media
            </Button>
          </div>
        ) : (
          <article>
            {post.coverImageUrl && (
              <div className="aspect-video rounded-xl overflow-hidden mb-8 bg-gray-50">
                <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover" />
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl font-display font-bold text-gray-900 mb-4">
              {post.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-8 border-b border-gray-100">
              <span className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {post.author}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(post.publishedAt), "MMMM d, yyyy")}
                </span>
              )}
            </div>

            <div className="prose prose-gray max-w-none">
              {post.content.split("\n").map((paragraph, i) => {
                if (!paragraph.trim()) return <br key={i} />;
                if (paragraph.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-8 mb-4">{paragraph.slice(2)}</h1>;
                if (paragraph.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-6 mb-3">{paragraph.slice(3)}</h2>;
                if (paragraph.startsWith("### ")) return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{paragraph.slice(4)}</h3>;
                if (paragraph.startsWith("- ")) return <li key={i} className="ml-4 text-gray-700 mb-1">{paragraph.slice(2)}</li>;
                return <p key={i} className="text-gray-700 leading-relaxed mb-4">{paragraph}</p>;
              })}
            </div>
          </article>
        )}
      </main>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} FridayReport.AI &mdash; Built by Trusted IT Group, Inc.
        </div>
      </footer>
    </div>
  );
}
