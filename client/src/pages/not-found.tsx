import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPinOff, PartyPopper, Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

const funnyMessages = [
  "Looks like this page took an early Friday!",
  "This page is already on vacation...",
  "404: Page not found. It must be Friday somewhere!",
  "Oops! This page clocked out early for the weekend.",
  "This page is out celebrating Friday. Try again Monday?",
  "Even pages need a break sometimes!",
  "This page pulled a disappearing act worthy of a Friday afternoon.",
  "Gone fishing... back next week!",
];

const fridayGifs = [
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif",
  "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif",
  "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/giphy.gif",
  "https://media.giphy.com/media/l3q2Z6S6n38zjPswo/giphy.gif",
  "https://media.giphy.com/media/3o7TKSxdQJIoiRXHl6/giphy.gif",
  "https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif",
  "https://media.giphy.com/media/l0HlKrB02QY0f1mbm/giphy.gif",
];

export default function NotFound() {
  const [, navigate] = useLocation();
  const [message] = useState(() => funnyMessages[Math.floor(Math.random() * funnyMessages.length)]);
  const [gif] = useState(() => fridayGifs[Math.floor(Math.random() * fridayGifs.length)]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md border-none shadow-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl overflow-visible">
        <CardContent className="pt-8 pb-8">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="absolute -inset-4 bg-orange-400/20 rounded-full blur-xl animate-pulse" />
              <img
                src={gif}
                alt="Friday fun"
                className={`relative h-40 w-40 object-cover rounded-xl shadow-lg transition-all duration-500 ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
                data-testid="img-404-gif"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <MapPinOff className="h-6 w-6 text-orange-500" />
                <h1
                  className="text-3xl font-bold bg-gradient-to-r from-amber-600 via-orange-500 to-pink-500 bg-clip-text text-transparent"
                  data-testid="text-404-title"
                >
                  404
                </h1>
                <PartyPopper className="h-6 w-6 text-orange-500" />
              </div>
              <p
                className="text-lg font-medium text-slate-700 dark:text-slate-200"
                data-testid="text-404-message"
              >
                {message}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <div className="flex gap-3 pt-2 w-full">
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="flex-1"
                data-testid="button-go-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
              <Button
                onClick={() => navigate("/")}
                className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg"
                data-testid="button-go-home"
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
