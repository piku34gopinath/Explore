"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Youtube, Play, Pause, CheckCircle2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Clip {
  id: number;
  title: string;
  description: string;
  tags: string;
  file_path: string;
  duration: number;
  created_at: string;
  youtube_id?: string | null;
  uploaded_to_channel?: string | null;
  uploaded_at?: string | null;
}

interface Video {
  id: number;
  title: string;
  clips: Clip[];
}

export default function UploadPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [playingClip, setPlayingClip] = useState<number | null>(null);
  
  // Upload Dialog State
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  
  // Delete Confirmation State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clipToDelete, setClipToDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

  // Configure axios to send cookies
  axios.defaults.withCredentials = true;

  useEffect(() => {
    fetchClips();
  }, []);

  const fetchClips = async () => {
    try {
      // Fetch clips for user 1 (hardcoded for now)
      const response = await axios.get(`${API_URL}/users/1/videos`);
      setVideos(response.data);
    } catch (err) {
      console.error("Error fetching clips:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (e: React.MouseEvent, clipId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setClipToDelete(clipId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!clipToDelete) {
      console.warn("confirmDelete called but clipToDelete is null");
      return;
    }
    
    setDeleting(true);
    console.log(`[FRONTEND] Deleting clip ${clipToDelete}...`);
    
    try {
      const resp = await axios.delete(`${API_URL}/clips/${clipToDelete}`);
      console.log("[FRONTEND] Delete response:", resp.data);
      
      // Refresh the clips list
      console.log("[FRONTEND] Refreshing clips list...");
      await fetchClips();
      
      setDeleteConfirmOpen(false);
      setClipToDelete(null);
      console.log("[FRONTEND] Delete successful and state reset.");
    } catch (err: any) {
      console.error("Error deleting clip:", err);
      const msg = err.response?.data?.detail || err.message || "Failed to delete clip.";
      alert(`Delete failed: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  const handlePlayPause = (clipId: number) => {
    const videoElement = document.getElementById(`video-${clipId}`) as HTMLVideoElement;
    if (videoElement) {
      if (videoElement.paused) {
        // Pause all other videos
        document.querySelectorAll('video').forEach(v => {
          if (v.id !== `video-${clipId}`) {
            v.pause();
            // Reset state for others (optional, but good for UI consistency)
          }
        });
        
        videoElement.play();
        setPlayingClip(clipId);
      } else {
        videoElement.pause();
        setPlayingClip(null);
      }
    }
  };

  const openUploadDialog = (clip: Clip) => {
    setSelectedClip(clip);
    setUploadTitle(clip.title || "New Short");
    setUploadDesc(clip.description || "");
    setUploadTags(clip.tags || "#shorts");
    setUploadStatus("idle");
  };

  const handleUpload = async () => {
    if (!selectedClip) return;
    
    setUploading(true);
    setUploadError("");
    setUploadStatus("idle");

    try {
      await axios.post(`${API_URL}/upload/youtube`, {
        video_id: selectedClip.id,
        title: uploadTitle,
        description: uploadDesc,
        tags: uploadTags,
        privacy_status: "private" // Defaulting to private for safety
      });
      setUploadStatus("success");
      // Refresh clips to show updated upload status
      await fetchClips();
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadStatus("error");
      
      const errorMessage = err.response?.data?.detail || "Failed to upload video.";
      if (err.response?.status === 400 && errorMessage.toLowerCase().includes("not connected")) {
        setUploadError("Your YouTube account is not connected or your session has expired. Please sign out and sign in again to refresh your connection.");
      } else {
        setUploadError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  const forceLogout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`);
      window.location.href = "/login";
    } catch (err) {
      window.location.href = "/login";
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Clip Gallery</h1>
        <p className="text-muted-foreground">Browse your generated clips and upload them to YouTube Shorts.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {videos.map((video) => (
            video.clips && video.clips.length > 0 && (
              <div key={video.id} className="space-y-4">
                <h2 className="text-xl font-semibold border-l-4 border-violet-500 pl-3">{video.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {video.clips.map((clip) => (
                    <Card key={clip.id} className="overflow-hidden bg-card/50 backdrop-blur border-white/5 hover:border-violet-500/50 transition-all group">
                      <div className="relative aspect-[9/16] bg-black">
                        <video 
                          id={`video-${clip.id}`}
                          src={`${API_URL}/static/${clip.file_path.split('/').pop()}`}
                          className="w-full h-full object-contain"
                          onEnded={() => setPlayingClip(null)}
                          onClick={() => handlePlayPause(clip.id)}
                        />
                        
                        {/* Overlay Controls */}
                        <div 
                          className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200 ${playingClip === clip.id ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
                          onClick={() => handlePlayPause(clip.id)}
                        >
                          <button className="p-4 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition-all transform hover:scale-110">
                            {playingClip === clip.id ? (
                              <Pause className="h-8 w-8 text-white fill-current" />
                            ) : (
                              <Play className="h-8 w-8 text-white fill-current" />
                            )}
                          </button>
                        </div>
                      </div>

                      <CardContent className="p-4 space-y-4">
                        <div className="space-y-1">
                          <h3 className="font-medium line-clamp-1" title={clip.title}>{clip.title || "Untitled Clip"}</h3>
                          <div className="flex flex-wrap gap-1">
                            {clip.tags && clip.tags.split(',').slice(0, 3).map((tag, i) => (
                              <span key={i} className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Upload Status Badge */}
                        {clip.youtube_id && (
                          <div className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="font-medium">Uploaded</span>
                            {clip.uploaded_to_channel && (
                              <span className="text-[10px] text-muted-foreground ml-1">
                                to {clip.uploaded_to_channel}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button 
                            className="flex-1 bg-[#FF0000] hover:bg-[#CC0000] text-white gap-2 transition-all hover:shadow-[0_0_15px_rgba(255,0,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => openUploadDialog(clip)}
                            disabled={!!clip.youtube_id}
                          >
                            <Youtube className="h-4 w-4" />
                            {clip.youtube_id ? "Already Uploaded" : "Upload to Shorts"}
                          </Button>
                          <Button 
                            variant="destructive"
                            size="icon"
                            type="button"
                            onClick={(e) => handleDelete(e, clip.id)}
                            title="Delete clip"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          ))}
          
          {videos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No clips found. Create some clips from the dashboard first!
            </div>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={!!selectedClip} onOpenChange={(open) => !open && setSelectedClip(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload to YouTube Shorts</DialogTitle>
            <DialogDescription>
              Confirm metadata before uploading. Video will be uploaded as <strong>Private</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">Title</label>
              <Input
                id="title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">{uploadTitle.length}/100</p>
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="desc" className="text-sm font-medium">Description</label>
              <Textarea
                id="desc"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                className="h-24"
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="tags" className="text-sm font-medium">Tags (comma separated)</label>
              <Input
                id="tags"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
              />
            </div>
          </div>

          {uploadStatus === "error" && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {uploadStatus === "error" ? (
            <DialogFooter className="flex-col sm:flex-row gap-2">
               <Button variant="destructive" onClick={forceLogout} className="w-full sm:w-auto">
                Sign Out to Fix
              </Button>
              <Button variant="outline" onClick={() => setSelectedClip(null)} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogFooter>
          ) : uploadStatus === "success" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-center font-medium">Upload Successful!</p>
              <Button onClick={() => setSelectedClip(null)} className="w-full">
                Close
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedClip(null)} disabled={uploading}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading} className="bg-[#FF0000] hover:bg-[#CC0000] text-white">
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload Video"
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Clip</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this clip? This action cannot be undone and the file will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmOpen(false)} 
              disabled={deleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete} 
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
