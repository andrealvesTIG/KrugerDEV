import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import { Camera, Share2, Linkedin, Twitter, Copy, CheckCircle, Loader2, RotateCcw, ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";
import pmiPmogaLogo from "@assets/pmi-logo-DQ-6QQ___1773339567528.png";

type Step = "form" | "camera" | "result";

export default function UnCon2026SelfiePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const interviewer = params.get("interviewer") || "";

  const { toast } = useToast();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Selfie Experience | PMO unCON 2026 | FridayReport.AI";
    return () => { document.title = prevTitle; };
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep("camera");
  };

  const handleCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === 'string') {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.onerror = () => {
      console.error("Failed to read photo file");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRetake = () => {
    setPhotoDataUrl(null);
    setPhotoFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitSelfie = async () => {
    if (!photoFile) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("interviewer", interviewer);
      formData.append("photo", photoFile);

      const response = await fetch("/api/uncon2026/selfie", {
        method: "POST",
        body: formData,
      });

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("Server returned an unexpected response. Please try again.");
      }

      if (!response.ok) {
        throw new Error(data?.message || "Failed to save selfie");
      }

      if (data.shareToken) {
        setShareToken(data.shareToken);
        setStep("result");
      } else {
        throw new Error("Missing share token in response. Please try again.");
      }
    } catch (error: any) {
      console.error("Selfie submission error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareUrl = shareToken
    ? `${window.location.origin}/api/uncon2026/selfie/${shareToken}/share`
    : "";

  const ogImageUrl = shareToken
    ? `${window.location.origin}/api/uncon2026/selfie/${shareToken}/og.png`
    : "";

  const shareText = interviewer
    ? `Great meeting ${interviewer} at PMO unCON 2026! Interviewed by @Alex Rodov (https://www.linkedin.com/in/rodov/) at the @PMO Global Alliance @FridayReport.AI booth 📸 #PMOunCON #FridayReportAI #PMI`
    : `Had an amazing time at PMO unCON 2026! Great connecting with @PMO Global Alliance and @FridayReport.AI 📸 #PMOunCON #FridayReportAI #PMI`;

  const twitterShareText = interviewer
    ? `Great meeting ${interviewer} at PMO unCON 2026! 📸 #PMOunCON #FridayReportAI #PMI`
    : `Had an amazing time at PMO unCON 2026! 📸 #PMOunCON #FridayReportAI #PMI`;

  const handleLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=600,height=500");
  };

  const handleTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterShareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=600,height=500");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const handleCopyPostText = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      toast({ title: "Post text copied! Paste it into your LinkedIn post." });
    } catch {
      toast({ title: "Could not copy text", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50/80 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-center px-4 py-3">
          <a href="https://fridayreport.ai" target="_blank" rel="noopener noreferrer">
            <img src={logoBlack} alt="FridayReport.AI" className="h-7 object-contain dark:invert" />
          </a>
        </div>
      </header>

      <main className="px-4 py-6 max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/50 dark:to-yellow-900/50 border border-amber-200/60 dark:border-amber-700/40">
            <Camera className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Selfie Experience</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PMO unCON 2026</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Snap a selfie and share your experience!</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {(["form", "camera", "result"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step === s ? "bg-[#FF751F] text-white" :
                (["form", "camera", "result"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500")
              }`}>
                {["form", "camera", "result"].indexOf(step) > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${["form", "camera", "result"].indexOf(step) > i ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`} />}
            </div>
          ))}
        </div>

        {step === "form" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Tell us about yourself</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">We'll use this to personalize your selfie card.</p>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium">Your Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  required
                  className="mt-1"
                />
              </div>
              {interviewer && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                  You're being interviewed by <strong>{interviewer}</strong>
                </div>
              )}
              <Button type="submit" className="w-full bg-[#FF751F] hover:bg-[#e86a15] text-white min-h-12 text-base">
                Next: Take Selfie
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </div>
        )}

        {step === "camera" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Take your selfie</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Smile! This will appear on your branded card.</p>

            {!photoDataUrl ? (
              <div className="space-y-3">
                <label className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-2xl cursor-pointer bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/50 dark:hover:bg-amber-950/40 transition-colors">
                  <Camera className="h-12 w-12 text-amber-500 mb-3" />
                  <span className="text-base font-medium text-amber-700 dark:text-amber-400">Tap to take a selfie</span>
                  <span className="text-xs text-gray-500 mt-1">Opens your front camera</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleCapture}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const galleryInput = document.createElement("input");
                    galleryInput.type = "file";
                    galleryInput.accept = "image/*";
                    galleryInput.onchange = (e) => handleCapture(e as any);
                    galleryInput.click();
                  }}
                  className="w-full text-center text-sm text-amber-600 dark:text-amber-400 hover:underline py-2"
                >
                  or choose a photo from your gallery
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative flex justify-center">
                  <div className="w-48 h-60 rounded-[50%] overflow-hidden border-4 border-[#FF751F] shadow-lg">
                    <img src={photoDataUrl} alt="Your selfie" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleRetake} className="flex-1 min-h-11">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retake
                  </Button>
                  <Button
                    onClick={handleSubmitSelfie}
                    disabled={isSubmitting}
                    className="flex-1 bg-[#FF751F] hover:bg-[#e86a15] text-white min-h-11"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Looks good!
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <Button variant="ghost" onClick={() => setStep("form")} className="w-full mt-3 text-gray-500">
              Back to info
            </Button>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Great meeting you, {name}!
              </h2>
              {interviewer && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Interviewed by <strong className="text-[#FF751F]">{interviewer}</strong> at PMO unCON 2026
                </p>
              )}
              {!interviewer && (
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Thanks for stopping by the FridayReport.AI booth at PMO unCON 2026!
                </p>
              )}

              {photoDataUrl && (
                <div className="relative flex justify-center mb-5">
                  <div className="relative bg-gradient-to-br from-[#17255A] to-[#0d1a3f] rounded-2xl p-5 pb-6 shadow-xl">
                    <div className="text-center mb-3">
                      <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">PMO unCON 2026</span>
                    </div>
                    <div className="flex justify-center mb-3">
                      <div className="w-36 h-44 rounded-[50%] overflow-hidden border-4 border-[#FF751F] shadow-lg ring-4 ring-[#FF751F]/20">
                        <img src={photoDataUrl} alt="Your selfie" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <div className="text-center mb-3">
                      <p className="text-white font-bold text-sm">{name}</p>
                      {interviewer && (
                        <p className="text-amber-300 text-xs mt-0.5">Interviewed by {interviewer}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                      <img src={pmiPmogaLogo} alt="PMI · PMO Global Alliance" className="h-7 object-contain brightness-0 invert" />
                      <img src={logoWhite} alt="FridayReport.AI" className="h-5 object-contain" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-lg border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-4">
                <Share2 className="h-5 w-5 text-[#FF751F]" />
                <h3 className="font-bold text-gray-900 dark:text-white">Share your experience</h3>
              </div>
              <div className="space-y-3">
                <Button onClick={handleLinkedIn} className="w-full bg-[#0077b5] hover:bg-[#006399] text-white min-h-12 text-base justify-start">
                  <Linkedin className="mr-3 h-5 w-5" />
                  Share on LinkedIn
                </Button>
                <Button onClick={handleTwitter} className="w-full bg-black hover:bg-gray-800 text-white min-h-12 text-base justify-start">
                  <Twitter className="mr-3 h-5 w-5" />
                  Share on X (Twitter)
                </Button>
                <Button onClick={handleCopyPostText} variant="outline" className="w-full min-h-12 text-base justify-start border-[#FF751F]/30 text-[#FF751F] hover:bg-[#FF751F]/5">
                  {copiedText ? (
                    <>
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      Copied! Paste into your post
                    </>
                  ) : (
                    <>
                      <FileText className="mr-3 h-5 w-5" />
                      Copy Suggested Post Text
                    </>
                  )}
                </Button>
                <Button onClick={handleCopyLink} variant="outline" className="w-full min-h-12 text-base justify-start">
                  {copied ? (
                    <>
                      <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-3 h-5 w-5" />
                      Copy Share Link
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">Tip: Use "Copy Suggested Post Text" to get a ready-to-paste post that tags PMO Global Alliance and Alex Rodov on LinkedIn.</p>
            </div>

            <div className="text-center pt-2">
              <a
                href="/uncon2026"
                className="inline-flex items-center text-sm text-[#FF751F] hover:underline font-medium"
              >
                Learn more about FridayReport.AI
                <ArrowRight className="ml-1 h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
