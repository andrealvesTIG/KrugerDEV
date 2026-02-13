import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { PartyPopper, Sparkles, Share2, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { SiLinkedin } from "react-icons/si";

const partyGifs = [
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif",
  "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif",
  "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/giphy.gif",
  "https://media.giphy.com/media/l3q2Z6S6n38zjPswo/giphy.gif",
  "https://media.giphy.com/media/3o7TKSxdQJIoiRXHl6/giphy.gif",
  "https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif",
  "https://media.giphy.com/media/l0HlKrB02QY0f1mbm/giphy.gif",
];

const celebrationMessages = [
  "You made it through the week!",
  "Time to celebrate your wins!",
  "Another week conquered!",
  "Weekend mode: activated!",
  "You crushed it this week!",
];

export default function FridayPage() {
  const [partyGif, setPartyGif] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}${window.location.search}` : 'https://fridayreport.ai/friday';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gifParam = params.get('gif');
    let gifIdx = Math.floor(Math.random() * partyGifs.length);
    if (gifParam !== null) {
      const parsed = parseInt(gifParam, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed < partyGifs.length) {
        gifIdx = parsed;
      }
    }
    const randomMessageIndex = Math.floor(Math.random() * celebrationMessages.length);
    setPartyGif(partyGifs[gifIdx]);
    setMessage(celebrationMessages[randomMessageIndex]);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with your team" });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleShareLinkedIn = () => {
    const text = encodeURIComponent(`It's Friday! Time to celebrate another productive week! 🎉\n\n${partyGif}\n\nManage your project portfolio with FridayReport.AI - the enterprise PMO solution for modern teams.\n${shareUrl}\n\n#Friday #ProjectManagement #PMO #FridayFeeling`);
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${text}`, '_blank');
  };

  const handleLogin = () => {
    window.location.href = '/';
  };

  const today = new Date();
  const isFriday = today.getDay() === 5;
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col">
      <Helmet>
        <title>It's Friday! - FridayReport.AI | Celebrate Your Week</title>
        <meta name="description" content="Celebrate another productive week with FridayReport.AI! Share the Friday feeling with your team and manage your project portfolio with our enterprise PMO solution." />
        <meta property="og:title" content="It's Friday! - FridayReport.AI" />
        <meta property="og:description" content="Celebrate another productive week! Manage your project portfolio with FridayReport.AI - the enterprise PMO solution for modern teams." />
        <link rel="canonical" href="https://fridayreport.ai/friday" />
      </Helmet>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <Card className="overflow-hidden border-none shadow-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-400/20 via-orange-400/10 to-transparent" />
              
              <div className="relative p-8 text-center">
                <div className="flex items-center justify-center gap-3 mb-6">
                  <PartyPopper className="h-8 w-8 text-orange-500 animate-bounce" />
                  <h1 
                    className="text-4xl font-bold bg-gradient-to-r from-amber-600 via-orange-500 to-pink-500 bg-clip-text text-transparent"
                    data-testid="text-friday-headline"
                  >
                    {isFriday ? "It's Friday!" : `Happy ${dayName}!`}
                  </h1>
                  <Sparkles className="h-7 w-7 text-yellow-500 animate-pulse" />
                </div>

                <div className="relative mb-6">
                  <div className="absolute -inset-6 bg-gradient-to-r from-amber-400/30 via-orange-400/30 to-pink-400/30 rounded-full blur-2xl animate-pulse" />
                  {partyGif && (
                    <img 
                      src={partyGif} 
                      alt="Party celebration" 
                      className="relative mx-auto h-48 w-48 object-cover rounded-2xl shadow-xl ring-4 ring-white/50 dark:ring-slate-700/50"
                    />
                  )}
                </div>

                <p className="text-xl font-medium text-slate-700 dark:text-slate-200 mb-2" data-testid="text-celebration-message">
                  {message}
                </p>
                <p className="text-slate-500 dark:text-slate-400 mb-6" data-testid="text-friday-description">
                  {isFriday 
                    ? "Celebrate your wins and wrap up your projects with FridayReport.AI" 
                    : "Keep pushing towards Friday with FridayReport.AI"}
                </p>

                <div className="flex gap-3 mb-6">
                  <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-medium">
                    <PartyPopper className="h-4 w-4" />
                    <span>Party time</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-sm font-medium">
                    <Sparkles className="h-4 w-4" />
                    <span>Weekend vibes</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-6 space-y-4">
                  <Button 
                    onClick={handleLogin}
                    size="lg"
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg"
                    data-testid="button-login-friday"
                  >
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Login to FridayReport.AI
                  </Button>

                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={handleShareLinkedIn}
                      className="flex-1 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                      data-testid="button-share-linkedin"
                    >
                      <SiLinkedin className="h-4 w-4 mr-2" />
                      Share on LinkedIn
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleCopyLink}
                      className="flex-1"
                      data-testid="button-copy-link"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2 text-green-500" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-orange-600 dark:text-orange-400">FridayReport.AI</span>
              {" "}— Enterprise Project Portfolio Management
            </p>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-slate-400">
        <p>&copy; {new Date().getFullYear()} Friday Report LLC. All rights reserved.</p>
      </footer>
    </div>
  );
}
