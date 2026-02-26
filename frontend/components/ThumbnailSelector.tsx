"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";

interface ThumbnailSelectorProps {
  clip: {
    id: number;
    file_path: string;
    thumbnail_path?: string | null;
  };
  apiUrl: string;
  onCapture: (timestamp: number) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}

export const ThumbnailSelector: React.FC<ThumbnailSelectorProps> = ({
  clip,
  apiUrl,
  onCapture,
  onUpload,
}) => {
  const videoUrl = `${apiUrl}/static/${clip.file_path.split("/").pop()}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [timestamp, setTimestamp] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frames, setFrames] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);

  // Handle video metadata loaded
  const onLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Generate filmstrip frames
  useEffect(() => {
    const generateFrames = async () => {
      if (!duration || frames.length > 0) return;
      setIsGeneratingFrames(true);

      const frameCount = 7;
      const newFrames: string[] = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const tempVideo = document.createElement("video");
      tempVideo.src = videoUrl;
      tempVideo.crossOrigin = "anonymous";
      tempVideo.muted = true;

      await new Promise((resolve) => {
        tempVideo.onloadedmetadata = resolve;
      });

      canvas.width = 160;
      canvas.height = 284; // 9:16 aspect ratio roughly

      for (let i = 0; i < frameCount; i++) {
        const time = (duration / (frameCount - 1)) * i;
        tempVideo.currentTime = time;
        await new Promise((resolve) => {
          tempVideo.onseeked = resolve;
        });
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          newFrames.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }

      setFrames(newFrames);
      setIsGeneratingFrames(false);
    };

    generateFrames();
  }, [duration, videoUrl, frames.length]);

  // Handle scrubbing
  const handleScrub = (e: React.MouseEvent | React.TouchEvent) => {
    if (!scrubberRef.current || !duration) return;

    const rect = scrubberRef.current.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const position = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
    const newTime = position * duration;

    setTimestamp(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleCaptureClick = async () => {
    setIsCapturing(true);
    try {
      await onCapture(timestamp);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-1">
      <div className="flex flex-col items-center gap-4">
        {/* Large Preview */}
        <div className="relative aspect-[9/16] w-full max-w-[280px] bg-black rounded-3xl overflow-hidden border-4 border-muted shadow-2xl">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-cover"
            muted
            playsInline
            onLoadedMetadata={onLoadedMetadata}
          />
          {isCapturing && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <Loader2 className="h-10 w-10 text-white animate-spin" />
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/20">
            <span className="text-[10px] font-mono text-white">
              {timestamp.toFixed(1)}s / {duration.toFixed(1)}s
            </span>
          </div>
        </div>

        {/* Filmstrip Scrubber */}
        <div className="w-full space-y-3">
          <div className="flex justify-between items-end">
            <h4 className="text-xs font-black uppercase tracking-tighter text-muted-foreground italic">Select a cover frame</h4>
            <div className="text-[10px] font-bold text-primary/60">SCRUB TO EXPLORE</div>
          </div>
          
          <div 
            ref={scrubberRef}
            className="relative h-20 w-full bg-muted/20 rounded-xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary/20 transition-all group"
            onMouseDown={handleScrub}
            onMouseMove={(e) => e.buttons === 1 && handleScrub(e)}
            onTouchMove={handleScrub}
          >
            {isGeneratingFrames ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="flex h-full w-full">
                {frames.map((frame, i) => (
                  <img key={i} src={frame} className="flex-1 h-full object-cover opacity-50 grey" alt="" />
                ))}
              </div>
            )}
            
            {/* Playhead / Selected Indicator */}
            <div 
              className="absolute top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] z-10 rounded-full"
              style={{ left: `${(timestamp / (duration || 1)) * 100}%`, transform: 'translateX(-50%)' }}
            />
            
            {/* Visual focus frame around playhead */}
            <div 
              className="absolute top-0 bottom-0 aspect-[9/16] border-[3px] border-primary rounded-lg shadow-[0_0_40px_rgba(var(--primary),0.3)] pointer-events-none z-20 ring-4 ring-black/20"
              style={{ left: `${(timestamp / (duration || 1)) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute -top-1.5 -left-1.5 h-3 w-3 bg-primary rounded-full" />
              <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 bg-primary rounded-full" />
              <div className="absolute -top-1.5 -right-1.5 h-3 w-3 bg-primary rounded-full" />
              <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 bg-primary rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
         <Button 
           size="lg" 
           className="w-full py-7 rounded-2xl font-black uppercase tracking-widest gap-2 shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98]" 
           onClick={handleCaptureClick}
           disabled={isCapturing}
         >
           {isCapturing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Selected Frame"}
         </Button>
         
         <div className="relative">
           <div className="absolute inset-0 flex items-center">
             <span className="w-full border-t border-muted" />
           </div>
           <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
             <span className="bg-background px-4 text-muted-foreground">Or</span>
           </div>
         </div>

         <Button 
           variant="outline" 
           size="lg" 
           className="w-full py-7 rounded-2xl font-black uppercase tracking-widest gap-2 border-2 hover:bg-muted/50 transition-all"
           onClick={() => document.getElementById('advanced-thumb-upload')?.click()}
         >
           <Plus className="h-5 w-5" />
           Add from camera roll
         </Button>
         <input 
           type="file" 
           id="advanced-thumb-upload" 
           className="hidden" 
           accept="image/*" 
           onChange={handleFileUpload}
         />
      </div>
    </div>
  );
};
