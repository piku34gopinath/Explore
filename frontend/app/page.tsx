"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2, Mic, Smartphone, Play, ArrowRight, Upload as UploadIcon, Link as LinkIcon } from "lucide-react";
import { compressVideo, COMPRESSION_THRESHOLD_BYTES } from "@/lib/video-compressor";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"url" | "file">("url");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressProgress, setCompressProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "compressing" | "uploading" | "processing">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  
  // Use env var or default to localhost:8000
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Configure axios to send cookies
  axios.defaults.withCredentials = true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadProgress(0);
    setCompressProgress(0);
    try {
      let response;
      if (mode === "file") {
        if (!file) {
          alert("Please select a video file to upload.");
          setLoading(false);
          return;
        }

        // HD/4K files upload directly (raw) so quality is preserved end-to-end.
        // Only files above the threshold fall back to in-browser compression,
        // which keeps resolution up to 4K and just shrinks the bitrate.
        let toUpload = file;
        if (file.size > COMPRESSION_THRESHOLD_BYTES) {
          setPhase("compressing");
          const limitMb = Math.round(COMPRESSION_THRESHOLD_BYTES / (1024 * 1024));
          try {
            toUpload = await compressVideo(file, {
              onProgress: (frac) => setCompressProgress(Math.round(frac * 100)),
            });
          } catch (err: any) {
            console.error("Compression failed:", err);
            alert(
              `Couldn't compress the file in-browser: ${err?.message || err}. ` +
              `Try a shorter clip or a file under ${limitMb} MB.`,
            );
            setLoading(false);
            setPhase("idle");
            return;
          }
        }

        setPhase("uploading");
        const form = new FormData();
        form.append("file", toUpload);
        response = await axios.post(`${API_URL}/videos/upload`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 0, // large HD/4K uploads must not time out
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          onUploadProgress: (evt) => {
            if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
      } else {
        setPhase("processing");
        response = await axios.post(`${API_URL}/videos/submit`, {
          original_url: url,
          user_id: 1,
        });
      }
      router.push(`/video/${response.data.id}`);
    } catch (error) {
      console.error("Error submitting video:", error);
      alert("Failed to submit video. Please make sure the backend is running.");
      setLoading(false);
      setPhase("idle");
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center text-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* Hero Section */}
        <div className="space-y-6 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-900/30 border border-violet-500/30 text-violet-300 text-sm font-medium mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
            AI Video Clipper 2.0
          </div>
          
          <h1 className="text-5xl font-extrabold tracking-tight lg:text-7xl leading-tight">
             Viral Shorts from <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
              Long Videos
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Turn your YouTube content into engaging vertical clips automatically. 
            AI-powered transcription, virality detection, and smart cropping.
          </p>
        </div>

        {/* Input Section */}
        <Card className="w-full max-w-2xl bg-card/50 backdrop-blur-xl border-white/10 shadow-2xl shadow-violet-500/10">
          <CardContent className="p-4 space-y-3">
            {/* Mode Toggle */}
            <div className="flex gap-2 p-1 bg-background/40 rounded-lg w-fit mx-auto">
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                  mode === "url" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-white"
                }`}
              >
                <LinkIcon className="w-4 h-4" /> YouTube URL
              </button>
              <button
                type="button"
                onClick={() => setMode("file")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                  mode === "file" ? "bg-violet-600 text-white" : "text-muted-foreground hover:text-white"
                }`}
              >
                <UploadIcon className="w-4 h-4" /> Upload Video
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
              {mode === "url" ? (
                <div className="relative flex-1">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Play className="w-4 h-4" />
                  </div>
                  <Input
                    type="url"
                    placeholder="Paste YouTube URL here..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="pl-10 h-12 bg-background/50 border-white/5 focus:border-violet-500/50 transition-all text-base"
                  />
                </div>
              ) : (
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12 px-4 rounded-md bg-background/50 border border-dashed border-white/10 hover:border-violet-500/50 text-left text-sm text-muted-foreground flex items-center gap-3 transition-all"
                  >
                    <UploadIcon className="w-4 h-4 text-violet-400" />
                    <span className="truncate">
                      {file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB` : "Choose a video file (mp4, mov, mkv, webm)"}
                    </span>
                  </button>
                </div>
              )}
              <Button
                type="submit"
                disabled={loading || (mode === "file" && !file)}
                size="lg"
                className="h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-105"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    {phase === "compressing"
                      ? `Compressing ${compressProgress}%`
                      : phase === "uploading" && uploadProgress > 0 && uploadProgress < 100
                        ? `Uploading ${uploadProgress}%`
                        : "Processing..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">Generate <Wand2 className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
            {mode === "file" && file && file.size > COMPRESSION_THRESHOLD_BYTES && phase === "idle" && (
              <p className="text-xs text-amber-400/80 text-center">
                Very large file ({(file.size / (1024 * 1024)).toFixed(0)} MB) — we&apos;ll compress it in your browser first (resolution preserved up to 4K; may take a few minutes). Keep this tab open.
              </p>
            )}
            {mode === "file" && file && file.size <= COMPRESSION_THRESHOLD_BYTES && file.size > 50 * 1024 * 1024 && phase === "idle" && (
              <p className="text-xs text-emerald-400/80 text-center">
                Uploading at full quality ({(file.size / (1024 * 1024)).toFixed(0)} MB) — no re-encoding. A large upload may take a little while.
              </p>
            )}
            {phase === "compressing" && (
              <p className="text-xs text-violet-300/80 text-center">
                Compressing in your browser — this can take several minutes for large files. Do not close the tab.
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mt-12">
          <FeatureCard 
            icon={<Mic className="w-6 h-6 text-violet-400" />}
            title="AI Transcription" 
            description="Whisper-powered speech-to-text ensures 99% accuracy for your captions." 
          />
           <FeatureCard 
            icon={<Wand2 className="w-6 h-6 text-fuchsia-400" />}
            title="Smart Virality" 
            description="GPT-4o analyzes content to find the most engaging hooks and stories." 
          />
           <FeatureCard 
            icon={<Smartphone className="w-6 h-6 text-indigo-400" />}
            title="Auto-Reframing" 
            description="Intelligently crops landscape video to perfect 9:16 vertical format." 
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="group p-6 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all hover:-translate-y-1 duration-300">
      <div className="mb-4 p-3 bg-white/5 w-fit rounded-xl group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="font-semibold text-lg mb-2 text-white group-hover:text-violet-300 transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
