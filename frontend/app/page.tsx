"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Wand2, Mic, Smartphone, Play, ArrowRight, Upload, Scissors, Film, X, Monitor, Smartphone as PhoneIcon, ChevronLeft } from "lucide-react";

type ModalStep = "clip_type" | "aspect_ratio";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("clip_type");
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    axios.defaults.withCredentials = true;
  }, []);

  // ── URL submit (now opens processing options modal) ────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setUploadedFile(null); // Ensure no file is pending
    setModalStep("clip_type");
    setSelectedAspectRatio("16:9");
    setShowModal(true);
  };

  // ── File drag-and-drop handlers ─────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      openModal(file);
    } else {
      alert("Please drop a valid video file.");
    }
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openModal(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openModal = (file: File) => {
    setUploadedFile(file);
    setModalStep("clip_type");
    setSelectedAspectRatio("16:9");
    setShowModal(true);
  };

  const cancelModal = () => {
    setShowModal(false);
    setUploadedFile(null);
  };

  // ── Short Clip Select ──────────────────────────────────────────────────────
  const handleShortClipSelect = () => doUpload("short", "9:16");

  // ── Direct Short Clip Select ────────────────────────────────────────────────
  const handleDirectShortSelect = () => doUpload("direct_short", "9:16");

  // ── Long Clip: advance to aspect ratio picker ───────────────────────────────
  const handleLongClipSelect = () => setModalStep("aspect_ratio");

  // ── Long Clip: confirm with chosen ratio ────────────────────────────────────
  const handleAspectRatioConfirm = () => doUpload("long", selectedAspectRatio);

  // ── Upload / Submit ────────────────────────────────────────────────────────
  const doUpload = async (clipType: "short" | "long" | "direct_short", aspectRatio: string) => {
    if (!uploadedFile && !url) return;
    setShowModal(false);
    setUploading(true);
    setUploadProgress(0);

    try {
      let response;
      if (uploadedFile) {
        // File Upload Flow
        const formData = new FormData();
        formData.append("file", uploadedFile);
        formData.append("clip_type", clipType);
        formData.append("aspect_ratio", aspectRatio);
        formData.append("user_id", "1");

        response = await axios.post(`${API_URL}/videos/upload-file`, formData, {
          onUploadProgress: (progressEvent) => {
            const pct = progressEvent.total
              ? Math.round((progressEvent.loaded / progressEvent.total) * 100)
              : 0;
            setUploadProgress(pct);
          },
        });
      } else {
        // URL Submission Flow
        response = await axios.post(`${API_URL}/videos/submit`, {
          original_url: url,
          user_id: 1,
          clip_type: clipType,
          aspect_ratio: aspectRatio
        });
      }

      router.push(`/video/${response.data.id}`);
    } catch (error: any) {
      console.error("Processing error:", error);
      alert("Failed to process video: " + (error.response?.data?.detail || error.message));
    } finally {
      setUploading(false);
      setUploadedFile(null);
      setUrl(""); // Clear URL after submission
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-[#f6f6f8] dark:bg-[#0a0a0a] text-slate-900 dark:text-slate-100 antialiased selection:bg-[#6366f2]/30 min-h-[100dvh] flex flex-col">
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,242,0.15)_0%,rgba(10,10,10,0)_70%)] pointer-events-none" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#6366f2]/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="fixed top-[20%] right-[-5%] w-72 h-72 bg-indigo-600/10 rounded-full blur-[100px] -z-10" />
        <div className="fixed bottom-[-10%] left-[-5%] w-96 h-96 bg-[#6366f2]/10 rounded-full blur-[120px] -z-10" />

        <div className="relative z-10 w-full max-w-2xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6366f2]/10 border border-[#6366f2]/20 text-[#6366f2] text-xs font-bold uppercase tracking-wider mx-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6366f2] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6366f2]"></span>
            </span>
            AI Powered Conversion
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1] text-white">
            Turn Long Videos into <br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#6366f2] to-indigo-400">Viral Gold.</span>
          </h1>

          {/* Subheading */}
          <p className="text-lg text-slate-400 max-w-lg mx-auto leading-relaxed">
            AI-powered transcription, virality detection, and auto-reframing built for professional creators.
          </p>

          {/* ── Input Methods ── */}
          <div className="w-full max-w-xl mx-auto space-y-4 pt-4">

            {/* YouTube URL Form */}
            <form onSubmit={handleSubmit} className="bg-[#1a1a1a]/60 backdrop-blur-xl border border-white/10 rounded-xl p-2 flex flex-col md:flex-row items-stretch gap-2 shadow-2xl drop-shadow-2xl hover:border-white/20 transition-all duration-300">
              <div className="flex-1 flex items-center px-4 py-3 gap-3">
                <Play className="text-slate-500 w-5 h-5 flex-shrink-0" />
                <Input
                  type="url"
                  placeholder="Paste YouTube URL here..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-slate-500 w-full font-medium text-white p-0 h-auto text-base shadow-none"
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[#6366f2] hover:bg-[#6366f2]/90 text-white font-bold py-6 px-8 rounded-lg transition-all shadow-[0_0_20px_rgba(99,102,242,0.4)] active:scale-[0.98] flex items-center justify-center gap-2 h-auto"
              >
                {loading ? <span>Processing...</span> : <><span>Generate</span><Wand2 className="w-5 h-5" /></>}
              </Button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">or upload a file</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* File Upload Drop Zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`group relative w-full rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden
                ${isDragging ? "border-[#6366f2] bg-[#6366f2]/10 scale-[1.01]" : "border-white/15 hover:border-[#6366f2]/50 bg-[#1a1a1a]/40 hover:bg-[#1a1a1a]/60"}
                ${uploading ? "pointer-events-none" : ""}
              `}
            >
              {uploading && (
                <div className="absolute inset-0 bg-[#6366f2]/10 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              )}

              <div className="relative z-10 flex flex-col items-center justify-center gap-3 py-10 px-6">
                {uploading ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-[#6366f2]/20 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-[#6366f2] animate-bounce" />
                    </div>
                    <p className="text-white font-medium">Uploading… {uploadProgress}%</p>
                    <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[#6366f2] rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${isDragging ? "bg-[#6366f2]/30 scale-110" : "bg-white/5 group-hover:bg-[#6366f2]/20"}`}>
                      <Upload className={`w-6 h-6 transition-colors ${isDragging ? "text-[#6366f2]" : "text-slate-400 group-hover:text-[#6366f2]"}`} />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-sm font-medium text-white">{isDragging ? "Drop it here!" : "Drag & drop a video file"}</p>
                      <p className="text-xs text-slate-500">MP4, MOV, AVI, MKV supported · Click to browse</p>
                    </div>
                  </>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
            </div>

            <p className="text-[10px] text-slate-500 font-medium tracking-wide">NO CREDIT CARD REQUIRED • 3 FREE CREDITS REMAINING</p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
            {[
              { icon: Mic, label: "AI Transcription", desc: "99% accuracy in 50+ languages" },
              { icon: ArrowRight, label: "Virality Score", desc: "Predict engagement before posting" },
              { icon: Smartphone, label: "Auto-Reframing", desc: "9:16 vertical crop instantly" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col items-center gap-3 group">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-[#6366f2]/20 transition-colors border border-white/10 group-hover:border-[#6366f2]/30">
                  <Icon className="text-[#6366f2] w-6 h-6" />
                </div>
                <div className="text-center">
                  <h3 className="text-white font-semibold text-sm">{label}</h3>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ══════════════════════════════════════════════════════════════
          MODAL  –  Step 1: Clip Type  |  Step 2: Aspect Ratio
         ══════════════════════════════════════════════════════════════ */}
      <Dialog open={showModal} onOpenChange={(open) => { if (!open) cancelModal(); }}>
        <DialogContent className="sm:max-w-[480px] bg-[#111]/95 backdrop-blur-xl border border-white/10 text-white">

          {/* ── Step 1: Choose clip type ── */}
          {modalStep === "clip_type" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Choose Output Type</DialogTitle>
                <DialogDescription className="text-slate-400">
                  How would you like to process{" "}
                  <span className="text-white font-medium">{uploadedFile?.name || url}</span>
                  {uploadedFile && <span className="text-slate-500 text-xs ml-1">({formatFileSize(uploadedFile.size)})</span>}?
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                {/* Short Clip (AI) */}
                <button
                  onClick={handleShortClipSelect}
                  className="group flex flex-col items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#6366f2]/60 hover:bg-[#6366f2]/10 transition-all duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#6366f2]/20 flex items-center justify-center group-hover:bg-[#6366f2]/30">
                    <Wand2 className="w-5 h-5 text-[#6366f2]" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">AI Short Clip</p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      AI finds the most viral moments and exports them as 9:16 vertical clips.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    <span className="text-[9px] bg-[#6366f2]/15 border border-[#6366f2]/25 text-[#6366f2] px-1.5 py-0.5 rounded-full font-medium">AI Analysis</span>
                  </div>
                </button>

                {/* Short Clip (Direct) */}
                <button
                  onClick={handleDirectShortSelect}
                  className="group flex flex-col items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-blue-500/60 hover:bg-blue-500/10 transition-all duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30">
                    <Scissors className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">Direct Short Clip</p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Convert the entire video into a single 9:16 vertical clip. No AI cutting.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    <span className="text-[9px] bg-blue-500/15 border border-blue-500/25 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">9:16 Vertical</span>
                  </div>
                </button>

                {/* Long Clip */}
                <button
                  onClick={handleLongClipSelect}
                  className="group flex flex-col items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all duration-200 text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30">
                    <Film className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">Long Clip</p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      Process your full video in your chosen aspect ratio. No AI clipping.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Full Length</span>
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={cancelModal} className="text-slate-400 hover:text-white gap-2">
                  <X className="w-4 h-4" />Cancel
                </Button>
              </div>
            </>
          )}

          {/* ── Step 2: Choose aspect ratio (Long Clip only) ── */}
          {modalStep === "aspect_ratio" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Choose Aspect Ratio</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Select the output format for your long clip.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {/* 16:9 Horizontal */}
                <button
                  onClick={() => setSelectedAspectRatio("16:9")}
                  className={`group flex flex-col items-start gap-3 p-5 rounded-xl border transition-all duration-200 text-left ${
                    selectedAspectRatio === "16:9"
                      ? "border-[#6366f2] bg-[#6366f2]/15 ring-1 ring-[#6366f2]/30"
                      : "border-white/10 bg-white/5 hover:border-[#6366f2]/40 hover:bg-[#6366f2]/5"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${selectedAspectRatio === "16:9" ? "bg-[#6366f2]/30" : "bg-white/5 group-hover:bg-[#6366f2]/20"}`}>
                    <Monitor className="w-5 h-5 text-[#6366f2]" />
                  </div>
                  {/* 16:9 visual preview */}
                  <div className="w-full flex justify-center">
                    <div className="w-20 h-[45px] rounded border-2 border-[#6366f2]/60 bg-[#6366f2]/10 flex items-center justify-center">
                      <span className="text-[9px] text-[#6366f2] font-bold">16:9</span>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">16:9 Horizontal</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Landscape format (1920×1080). Best for YouTube & desktop viewing.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <span className="text-[10px] bg-[#6366f2]/15 border border-[#6366f2]/25 text-[#6366f2] px-2 py-0.5 rounded-full font-medium">YouTube</span>
                    <span className="text-[10px] bg-[#6366f2]/15 border border-[#6366f2]/25 text-[#6366f2] px-2 py-0.5 rounded-full font-medium">1920×1080</span>
                  </div>
                </button>

                {/* 9:16 Vertical */}
                <button
                  onClick={() => setSelectedAspectRatio("9:16")}
                  className={`group flex flex-col items-start gap-3 p-5 rounded-xl border transition-all duration-200 text-left ${
                    selectedAspectRatio === "9:16"
                      ? "border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500/30"
                      : "border-white/10 bg-white/5 hover:border-emerald-500/40 hover:bg-emerald-500/5"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${selectedAspectRatio === "9:16" ? "bg-emerald-500/30" : "bg-white/5 group-hover:bg-emerald-500/20"}`}>
                    <PhoneIcon className="w-5 h-5 text-emerald-400" />
                  </div>
                  {/* 9:16 visual preview */}
                  <div className="w-full flex justify-center">
                    <div className="w-[28px] h-[50px] rounded border-2 border-emerald-500/60 bg-emerald-500/10 flex items-center justify-center">
                      <span className="text-[8px] text-emerald-400 font-bold leading-tight text-center">9:16</span>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">9:16 Vertical</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Portrait format (1080×1920). Perfect for TikTok, Reels & Shorts.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2 py-0.5 rounded-full font-medium">TikTok</span>
                    <span className="text-[10px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Reels / Shorts</span>
                  </div>
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setModalStep("clip_type")} className="text-slate-400 hover:text-white gap-2">
                  <ChevronLeft className="w-4 h-4" />Back
                </Button>
                <Button
                  onClick={handleAspectRatioConfirm}
                  className="bg-[#6366f2] hover:bg-[#6366f2]/90 text-white font-bold gap-2 px-6"
                >
                  Process Video
                  <Film className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
