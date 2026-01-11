import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 md:px-8 mt-auto">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <p className="text-xs text-muted-foreground">Copyright Friday Report LLC</p>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-terms">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-privacy">
            Privacy Statement
          </Link>
        </div>
      </div>
    </footer>
  );
}
