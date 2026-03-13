import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import { Camera, Share2, Linkedin, Twitter, Copy, CheckCircle, Loader2, RotateCcw, ArrowRight, FileText, ImagePlus, SwitchCamera, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import pmiPmogaLogo from "@assets/pmi-logo-DQ-6QQ___1773339567528.png";

type Step = "form" | "camera" | "result";

const safeGet = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeSet = (key: string, val: string) => {
  try { localStorage.setItem(key, val); } catch {}
};
const safeRemove = (key: string) => {
  try { localStorage.removeItem(key); } catch {}
};

export default function UnCon2026SelfiePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const interviewer = params.get("interviewer") || "";

  const { toast } = useToast();

  const [step, setStep] = useState<Step>(() => {
    const saved = safeGet("uncon_step");
    return (saved === "camera" || saved === "result") ? saved : "form";
  });
  const [name, setName] = useState(() => safeGet("uncon_name") || "");
  const [email, setEmail] = useState(() => safeGet("uncon_email") || "");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Selfie Experience | PMO unCON 2026 | FridayReport.AI";
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => { safeSet("uncon_step", step); }, [step]);
  useEffect(() => { safeSet("uncon_name", name); }, [name]);
  useEffect(() => { safeSet("uncon_email", email); }, [email]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (facing: "user" | "environment" = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setFacingMode(facing);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError("Could not access camera. Please use the gallery option below or check your browser permissions.");
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (step === "camera" && !photoDataUrl) {
      startCamera();
    }
    return () => {
      if (step !== "camera") {
        stopCamera();
      }
    };
  }, [step]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep("camera");
  };

  const handleSnapPhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    stopCamera();

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      setPhotoFile(file);
      setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.9));
    }, "image/jpeg", 0.9);
  }, [facingMode, stopCamera]);

  const handleFileCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === "string") {
        setPhotoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, [stopCamera]);

  const handleRetake = useCallback(() => {
    setPhotoDataUrl(null);
    setPhotoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    startCamera();
  }, [startCamera]);

  const handleFlipCamera = useCallback(() => {
    const newFacing = facingMode === "user" ? "environment" : "user";
    startCamera(newFacing);
  }, [facingMode, startCamera]);

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
        safeRemove("uncon_step");
        safeRemove("uncon_name");
        safeRemove("uncon_email");
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-yellow-50/80 to-white" data-theme="light" style={{ colorScheme: "light" }}>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <div className="flex items-center justify-center px-4 py-3">
          <a href="https://fridayreport.ai" target="_blank" rel="noopener noreferrer">
            <img src={logoBlack} alt="FridayReport.AI" className="h-7 object-contain" />
          </a>
        </div>
      </header>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <main className="px-4 py-6 max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-200/60">
            <Camera className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800 uppercase tracking-wide">Selfie Experience</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">PMO unCON 2026</h1>
          <p className="text-sm text-gray-500 mt-1">Snap a selfie and share your experience!</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-6">
          {(["form", "camera", "result"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step === s ? "bg-[#FF751F] text-white" :
                (["form", "camera", "result"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500")
              }`}>
                {["form", "camera", "result"].indexOf(step) > i ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${["form", "camera", "result"].indexOf(step) > i ? "bg-green-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {step === "form" && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Tell us about yourself</h2>
            <p className="text-sm text-gray-500 mb-5">We'll use this to personalize your selfie card.</p>
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
                <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
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
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Take your selfie</h2>
            <p className="text-sm text-gray-500 mb-5">Smile! This will appear on your branded card.</p>

            {!photoDataUrl ? (
              <div className="space-y-4">
                {cameraError ? (
                  <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 p-4">
                    <VideoOff className="h-10 w-10 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-500 text-center mb-3">{cameraError}</p>
                    <Button variant="outline" size="sm" onClick={() => startCamera()}>
                      Try Again
                    </Button>
                  </div>
                ) : (
                  <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined}
                    />
                    {!cameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <Loader2 className="h-8 w-8 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  {!cameraError && (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleFlipCamera}
                        disabled={!cameraActive}
                        className="min-h-11"
                      >
                        <SwitchCamera className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={handleSnapPhoto}
                        disabled={!cameraActive}
                        className="flex-1 bg-[#FF751F] hover:bg-[#e86a15] text-white min-h-11 text-base"
                      >
                        <Camera className="mr-2 h-5 w-5" />
                        Take Photo
                      </Button>
                    </>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">or</span>
                  </div>
                </div>

                <label className="flex items-center justify-center gap-2 w-full min-h-11 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors px-4 py-2.5">
                  <ImagePlus className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Choose from gallery</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileCapture}
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
                  />
                </label>
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

            <Button variant="ghost" onClick={() => { stopCamera(); setStep("form"); }} className="w-full mt-3 text-gray-500">
              Back to info
            </Button>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Great meeting you, {name}!
              </h2>
              {interviewer && (
                <p className="text-gray-600 mb-4">
                  Interviewed by <strong className="text-[#FF751F]">{interviewer}</strong> at PMO unCON 2026
                </p>
              )}
              {!interviewer && (
                <p className="text-gray-600 mb-4">
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
                      <img src={pmiPmogaLogo} alt="PMI · PMO Global Alliance" className="h-7 object-contain invert" />
                      <img src={logoBlack} alt="FridayReport.AI" className="h-5 object-contain invert opacity-90" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <Share2 className="h-5 w-5 text-[#FF751F]" />
                <h3 className="font-bold text-gray-900">Share your experience</h3>
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
