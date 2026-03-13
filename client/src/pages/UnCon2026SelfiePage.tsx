import { useState, useRef, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import { Camera, Share2, Linkedin, Twitter, Copy, CheckCircle, Loader2, RotateCcw, ArrowRight, FileText, ImagePlus, SwitchCamera, VideoOff, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import logoWhite from "@assets/new_logo/frai_logo_white/FridayReportAI_logo_white.png";
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

const CONFETTI_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 4.3 + 2) % 100}%`,
  duration: `${3.5 + (i % 5) * 0.8}s`,
  delay: `${(i * 0.4) % 5}s`,
  color: ['#FF751F', '#075DD1', '#FFD700', '#DC2626', '#10B981', '#8B5CF6'][i % 6],
  size: `${5 + (i % 4) * 2}px`,
  shape: i % 4 === 0 ? '50%' : i % 4 === 1 ? '0' : i % 4 === 2 ? '2px' : '1px',
}));

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
    window.location.href = url;
  };

  const handleTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterShareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.location.href = url;
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

  const handleDownloadCard = async () => {
    if (!shareToken) return;
    try {
      const ogUrl = `${window.location.origin}/api/uncon2026/selfie/${shareToken}/og.png`;
      const response = await fetch(ogUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PMO-unCON-2026-${name.trim().replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const stepIdx = ["form", "camera", "result"].indexOf(step);

  const handleReset = () => {
    safeRemove("uncon_step");
    safeRemove("uncon_name");
    safeRemove("uncon_email");
    setStep("form");
    setName("");
    setEmail("");
    setPhotoDataUrl(null);
    setPhotoFile(null);
    setShareToken(null);
  };

  return (
    <div className="min-h-screen relative overflow-hidden" data-theme="light" style={{ colorScheme: "light", background: "#0F172A" }}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(105vh) rotate(540deg); opacity: 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(255,117,31,0.3); }
          50% { box-shadow: 0 0 40px rgba(255,117,31,0.6); }
        }
        @keyframes sun-rotate {
          0% { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes sun-pulse {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05) rotate(180deg); }
        }
        .sun-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sun-rays {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 180%;
          height: 180%;
          transform: translate(-50%, -50%);
          animation: sun-rotate 20s linear infinite;
          pointer-events: none;
        }
        .sun-rays-inner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 160%;
          height: 160%;
          animation: sun-pulse 4s ease-in-out infinite;
          pointer-events: none;
        }
        .sun-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 140%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,117,31,0.3) 0%, rgba(255,117,31,0.1) 40%, transparent 70%);
          pointer-events: none;
          animation: glow-pulse 3s ease-in-out infinite;
        }
        .confetti-piece {
          position: fixed;
          top: -20px;
          z-index: 2;
          animation: confetti-fall linear infinite;
          pointer-events: none;
        }
        .card {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
        }
        .card-light {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,117,31,0.15);
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
        }
        .gold-line {
          height: 2px;
          background: linear-gradient(90deg, transparent, #FF751F, #FFD700, #FF751F, transparent);
        }
        .glow-btn {
          background: linear-gradient(135deg, #FF751F, #FF8F3F);
          box-shadow: 0 4px 20px rgba(255,117,31,0.4);
          transition: all 0.2s;
        }
        .glow-btn:hover {
          box-shadow: 0 6px 28px rgba(255,117,31,0.6);
          transform: translateY(-1px);
        }
        .selfie-card {
          background: linear-gradient(160deg, #17255A 0%, #0F1B3D 50%, #0A1128 100%);
          border: 1px solid rgba(255,117,31,0.3);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>

      <div className="fixed inset-0 z-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,117,31,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(7,93,209,0.06) 0%, transparent 50%)" }} />

      {CONFETTI_ITEMS.map((c, i) => (
        <div key={i} className="confetti-piece" style={{
          left: c.left, animationDuration: c.duration, animationDelay: c.delay,
          backgroundColor: c.color, width: c.size, height: c.size, borderRadius: c.shape,
          opacity: 0.7,
        }} />
      ))}

      <header className="sticky top-0 z-50" style={{ background: "rgba(15,23,42,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center justify-center px-4 py-3">
          <a href="https://fridayreport.ai" target="_blank" rel="noopener noreferrer">
            <img src={logoWhite} alt="FridayReport.AI" className="h-7 object-contain" />
          </a>
        </div>
      </header>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <main className="px-4 py-5 max-w-md mx-auto relative z-10">
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: "rgba(255,117,31,0.15)", color: "#FF9F4F", border: "1px solid rgba(255,117,31,0.2)" }}>
            📸 Selfie Experience
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">PMO unCON 2026</h1>
          <p className="text-xs text-gray-400 mt-0.5">Snap a selfie & share your experience</p>
        </div>

        <div className="flex items-center justify-center gap-0 mb-5">
          {(["form", "camera", "result"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                stepIdx === i ? "bg-[#FF751F] text-white scale-110 shadow-lg shadow-orange-500/30" :
                stepIdx > i ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-500"
              }`}>
                {stepIdx > i ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < 2 && <div className={`w-10 h-0.5 transition-colors duration-300 ${stepIdx > i ? "bg-emerald-500" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        <div className="gold-line mb-5" />

        {step === "form" && (
          <div className="card-light p-5">
            <h2 className="text-base font-bold text-gray-900 mb-0.5">Tell us about yourself</h2>
            <p className="text-xs text-gray-500 mb-4">We'll personalize your selfie card.</p>
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div>
                <Label htmlFor="name" className="text-xs font-semibold text-gray-700">Your Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required className="mt-1 h-10 text-sm rounded-xl border-gray-200 focus:border-[#FF751F] focus:ring-[#FF751F]/20" />
              </div>
              <div>
                <Label htmlFor="email" className="text-xs font-semibold text-gray-700">Email Address</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" required className="mt-1 h-10 text-sm rounded-xl border-gray-200 focus:border-[#FF751F] focus:ring-[#FF751F]/20" />
              </div>
              {interviewer && (
                <div className="rounded-xl p-2.5 text-xs font-medium" style={{ background: "rgba(255,117,31,0.08)", color: "#92400E" }}>
                  Interviewed by <strong>{interviewer}</strong>
                </div>
              )}
              <button type="submit" className="glow-btn w-full h-11 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 cursor-pointer">
                Next: Take Selfie <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}

        {step === "camera" && (
          <div className="card-light p-5">
            <h2 className="text-base font-bold text-gray-900 mb-0.5">Take your selfie</h2>
            <p className="text-xs text-gray-500 mb-4">Smile! This appears on your branded card.</p>

            {!photoDataUrl ? (
              <div className="space-y-3">
                {cameraError ? (
                  <div className="flex flex-col items-center justify-center w-full h-48 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 p-4">
                    <VideoOff className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 text-center mb-2">{cameraError}</p>
                    <Button variant="outline" size="sm" onClick={() => startCamera()} className="text-xs h-8 rounded-lg">Try Again</Button>
                  </div>
                ) : (
                  <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={facingMode === "user" ? { transform: "scaleX(-1)" } : undefined} />
                    {!cameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                {!cameraError && (
                  <div className="flex gap-3">
                    <button onClick={handleFlipCamera} disabled={!cameraActive} className="h-12 w-14 flex items-center justify-center rounded-xl border-2 border-white/30 bg-white/10 backdrop-blur-sm text-white disabled:opacity-40" style={{ WebkitTapHighlightColor: 'transparent' }}>
                      <SwitchCamera className="h-6 w-6" />
                    </button>
                    <button onClick={handleSnapPhoto} disabled={!cameraActive} className="glow-btn flex-1 h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 cursor-pointer disabled:opacity-50">
                      <Camera className="h-5 w-5" /> Take Photo
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <label className="flex items-center justify-center gap-2 w-full h-10 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors text-sm text-gray-600 font-medium">
                  <ImagePlus className="h-3.5 w-3.5" /> Choose from gallery
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileCapture} style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }} />
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="sun-container" style={{ width: 200, height: 200 }}>
                    <div className="sun-glow" />
                    <svg className="sun-rays" viewBox="0 0 200 200">
                      {Array.from({ length: 20 }, (_, i) => {
                        const angle = (i * 360) / 20;
                        const rad = (angle * Math.PI) / 180;
                        const x1 = 100 + Math.cos(rad) * 48;
                        const y1 = 100 + Math.sin(rad) * 48;
                        const x2 = 100 + Math.cos(rad) * 90;
                        const y2 = 100 + Math.sin(rad) * 90;
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 === 0 ? "#FF751F" : "#FFD700"} strokeWidth={i % 2 === 0 ? "3" : "1.5"} strokeLinecap="round" opacity={i % 2 === 0 ? 0.6 : 0.3} />;
                      })}
                    </svg>
                    <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-[#FF751F] shadow-lg shadow-orange-500/30 relative z-10">
                      <img src={photoDataUrl} alt="Your selfie" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleRetake} className="flex-1 h-12 text-sm rounded-xl border-2 border-white/30 bg-white/10 backdrop-blur-sm text-white font-semibold flex items-center justify-center gap-2" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <RotateCcw className="h-4 w-4" /> Retake
                  </button>
                  <button onClick={handleSubmitSelfie} disabled={isSubmitting} className="glow-btn flex-1 h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 cursor-pointer disabled:opacity-50">
                    {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><CheckCircle className="h-4 w-4" /> Looks good!</>}
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => { stopCamera(); setStep("form"); }} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors bg-transparent border-0 cursor-pointer py-1">
              ← Back to info
            </button>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-3">
            <div className="selfie-card p-5 w-full">
              <div className="flex items-center justify-center mb-2 pb-2 border-b border-white/10">
                <img src={pmiPmogaLogo} alt="PMI" className="h-5 object-contain" style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }} />
              </div>
              <p className="text-center text-[10px] font-black uppercase tracking-[0.25em] text-amber-400/80 mb-4">PMO unCON 2026</p>

              {photoDataUrl && (
                <div className="flex justify-center mb-4">
                  <div className="sun-container" style={{ width: 220, height: 220 }}>
                    <div className="sun-glow" />
                    <svg className="sun-rays" viewBox="0 0 200 200">
                      {Array.from({ length: 20 }, (_, i) => {
                        const angle = (i * 360) / 20;
                        const rad = (angle * Math.PI) / 180;
                        const x1 = 100 + Math.cos(rad) * 48;
                        const y1 = 100 + Math.sin(rad) * 48;
                        const x2 = 100 + Math.cos(rad) * 90;
                        const y2 = 100 + Math.sin(rad) * 90;
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 === 0 ? "#FF751F" : "#FFD700"} strokeWidth={i % 2 === 0 ? "3" : "1.5"} strokeLinecap="round" opacity={i % 2 === 0 ? 0.6 : 0.3} />;
                      })}
                    </svg>
                    <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#FF751F] shadow-lg shadow-orange-500/30 relative z-10">
                      <img src={photoDataUrl} alt="Your selfie" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              )}

              <div className="text-center mb-3">
                <p className="text-white font-bold text-lg">{name}</p>
                {interviewer && <p className="text-amber-300/70 text-xs mt-0.5">Interviewed by {interviewer}</p>}
              </div>

              <div className="text-center mb-3">
                <p className="text-[#FF751F] text-xs font-semibold">Great meeting you at PMO unCON 2026!</p>
              </div>

              <div className="flex items-center justify-center pt-3 border-t border-white/10">
                <img src={logoWhite} alt="FridayReport.AI" className="h-5 object-contain opacity-90" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleLinkedIn} className="h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 cursor-pointer transition-all active:scale-95" style={{ background: "#0077B5" }}>
                <Linkedin className="h-4 w-4" /> LinkedIn
              </button>
              <button onClick={handleDownloadCard} className="h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 border-0 cursor-pointer transition-all active:scale-95" style={{ background: "linear-gradient(135deg, #FF751F, #FF8F3F)", boxShadow: "0 4px 16px rgba(255,117,31,0.3)" }}>
                <Download className="h-4 w-4" /> Download
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={handleTwitter} className="h-11 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 border-0 cursor-pointer transition-all active:scale-95" style={{ background: "#1A1A1A" }}>
                <Twitter className="h-4 w-4" /> X / Twitter
              </button>
              <button onClick={handleCopyPostText} className="h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 border cursor-pointer transition-all active:scale-95" style={{ background: "transparent", color: "#FF9F4F", borderColor: "rgba(255,117,31,0.3)" }}>
                {copiedText ? <><CheckCircle className="h-4 w-4 text-emerald-400" /> Copied!</> : <><FileText className="h-4 w-4" /> Post Text</>}
              </button>
            </div>

            <button onClick={handleCopyLink} className="w-full h-10 rounded-xl font-medium text-xs flex items-center justify-center gap-2 border cursor-pointer transition-all active:scale-95" style={{ background: "transparent", color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.08)" }}>
              {copied ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Share Link</>}
            </button>

            <div className="flex items-center justify-center gap-4 pt-1">
              <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-transparent border-0 cursor-pointer active:scale-95">
                <RotateCcw className="h-3 w-3" /> New Selfie
              </button>
              <a href="/uncon2026" className="flex items-center gap-1 text-xs text-[#FF751F] hover:text-[#FF9F4F] transition-colors font-medium">
                About FridayReport.AI <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
