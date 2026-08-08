"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, Sparkles, TrendingUp, CheckCircle, XCircle, RefreshCw, Youtube, CheckCircle2, Loader2, Instagram } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Configure axios to send cookies
axios.defaults.withCredentials = true;

interface Clip {
  id: number;
  title: string;
  description: string;
  file_path: string;
  tags?: string;
  youtube_id?: string | null;
  uploaded_to_channel?: string | null;
  uploaded_at?: string | null;
  instagram_id?: string | null;
  uploaded_to_instagram?: string | null;
}

interface ClipSuggestion {
  id: number;
  start_time: number;
  end_time: number;
  viral_score: number;
  viral_angle: string;
  hook_description: string;
  reasoning: string;
  status: string;
  platform_preset: string;
  title?: string;
  tags?: string;
}

interface Video {
  id: number;
  title: string;
  status: string;
  progress: number;
  error_message?: string;
  ai_model?: string;
  thumbnail_url?: string;
  clips: Clip[];
  suggestions: ClipSuggestion[];
}

const getViralAngleEmoji = (angle: string) => {
  const emojiMap: Record<string, string> = {
    funny: "😂",
    emotional: "❤️",
    surprising: "😱",
    inspirational: "✨",
    educational: "🧠",
    satisfying: "😌"
  };
  return emojiMap[angle] || "🎬";
};

const getViralScoreColor = (score: number) => {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 75) return "text-yellow-600 dark:text-yellow-400";
  return "text-orange-600 dark:text-orange-400";
};

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id;
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload Dialog State
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [youtubeAccounts, setYoutubeAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  // Instagram Reels state
  const [reelClip, setReelClip] = useState<Clip | null>(null);
  const [reelCaption, setReelCaption] = useState("");
  const [reelUploading, setReelUploading] = useState(false);
  const [reelStatus, setReelStatus] = useState<"idle" | "success" | "error">("idle");
  const [reelError, setReelError] = useState("");
  const [instagramAccounts, setInstagramAccounts] = useState<any[]>([]);
  const [selectedIgAccountId, setSelectedIgAccountId] = useState<number | null>(null);

  const fetchVideo = async () => {
    try {
      const response = await axios.get(`${API_URL}/videos/${videoId}`);
      setVideo(response.data);
    } catch (error) {
      console.error("Error fetching video:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideo();
    fetchYoutubeAccounts();
    const interval = setInterval(fetchVideo, 3000);
    return () => clearInterval(interval);
  }, [videoId]);

  const fetchYoutubeAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/youtube/status`);
      setYoutubeAccounts(response.data.accounts || []);
      // Set default to primary account
      const primaryAccount = response.data.accounts?.find((acc: any) => acc.is_primary);
      if (primaryAccount) {
        setSelectedAccountId(primaryAccount.id);
      } else if (response.data.accounts?.length > 0) {
        setSelectedAccountId(response.data.accounts[0].id);
      }
    } catch (error) {
      console.error("Error fetching YouTube accounts:", error);
    }
  };

  const approveSuggestion = async (suggestionId: number) => {
    try {
      await axios.post(`${API_URL}/videos/${videoId}/suggestions/${suggestionId}/approve`);
      fetchVideo(); // Refresh to show updated status
    } catch (error) {
      console.error("Error approving suggestion:", error);
    }
  };

  const rejectSuggestion = async (suggestionId: number) => {
    try {
      await axios.post(`${API_URL}/videos/${videoId}/suggestions/${suggestionId}/reject`);
      fetchVideo();
    } catch (error) {
      console.error("Error rejecting suggestion:", error);
    }
  };

  const regenerateSuggestions = async () => {
    try {
      await axios.post(`${API_URL}/videos/${videoId}/regenerate-suggestions`);
      fetchVideo();
    } catch (error) {
      console.error("Error regenerating suggestions:", error);
    }
  };

  const downloadClip = async (clipPath: string, title: string) => {
    try {
      const filename = clipPath.split("/").pop();
      const url = `${API_URL}/download/${filename}`;
      
      // Fetch as blob to ensure proper download
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Create object URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${title.replace(/\s+/g, "_")}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed. Please try again.");
    }
  };

  const downloadAllClips = () => {
    if (!video?.clips) return;
    video.clips.forEach((clip, index) => {
      setTimeout(() => downloadClip(clip.file_path, clip.title), index * 500);
    });
  };

  const copyMetadata = async (clip: Clip) => {
    const hashtags = clip.tags ? clip.tags.split(',').map(tag => `#${tag.trim()}`).join(' ') : "";
    const metadata = `${clip.title}\n\n${clip.description}\n\n${hashtags}`;
    
    try {
      await navigator.clipboard.writeText(metadata);
      alert("✅ Metadata copied! Ready to paste when uploading.");
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Failed to copy. Please try again.");
    }
  };

  const shareClip = async (clipPath: string, title: string) => {
    const filename = clipPath.split("/").pop();
    const url = `${window.location.origin}/static/${filename}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Check out this viral clip: ${title}`,
          url: url,
        });
      } catch (error) {
        console.log("Share cancelled or failed:", error);
      }
    } else {
      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  const openUploadDialog = (clip: Clip) => {
    setSelectedClip(clip);
    setUploadTitle(clip.title || "New Short");
    setUploadDesc(clip.description || "");
    setUploadTags(clip.tags || "#shorts");
    setUploadStatus("idle");
    fetchYoutubeAccounts(); // Refresh accounts when opening dialog
  };

  const handleUpload = async () => {
    if (!selectedClip) return;
    
    setUploading(true);
    setUploadError("");
    setUploadStatus("idle");

    try {
      const uploadData: any = {
        video_id: selectedClip.id,
        title: uploadTitle,
        description: uploadDesc,
        tags: uploadTags,
        privacy_status: "private"
      };
      
      // Add account_id if selected (null will default to primary on backend)
      const url = selectedAccountId 
        ? `${API_URL}/upload/youtube?account_id=${selectedAccountId}`
        : `${API_URL}/upload/youtube`;
      
      await axios.post(url, uploadData);
      setUploadStatus("success");
      // Refresh video to show updated upload status
      await fetchVideo();
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

  const fetchInstagramAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/instagram/status`);
      const accounts = response.data.accounts || [];
      setInstagramAccounts(accounts);
      const primary = accounts.find((a: any) => a.is_primary);
      if (primary) setSelectedIgAccountId(primary.id);
      else if (accounts.length > 0) setSelectedIgAccountId(accounts[0].id);
    } catch (error) {
      console.error("Error fetching Instagram accounts:", error);
    }
  };

  const openReelDialog = (clip: Clip) => {
    setReelClip(clip);
    const tags = clip.tags
      ? clip.tags.split(",").map((t) => `#${t.trim().replace(/^#/, "")}`).join(" ")
      : "";
    setReelCaption(`${clip.title || ""}\n\n${clip.description || ""}\n\n${tags}`.trim());
    setReelStatus("idle");
    setReelError("");
    fetchInstagramAccounts();
  };

  const handleUploadReel = async () => {
    if (!reelClip) return;
    setReelUploading(true);
    setReelError("");
    setReelStatus("idle");
    try {
      const url = selectedIgAccountId
        ? `${API_URL}/upload/instagram?account_id=${selectedIgAccountId}`
        : `${API_URL}/upload/instagram`;
      await axios.post(url, { video_id: reelClip.id, caption: reelCaption });
      setReelStatus("success");
      await fetchVideo();
    } catch (err: any) {
      console.error("Reel upload error:", err);
      setReelStatus("error");
      setReelError(err.response?.data?.detail || "Failed to upload Reel.");
    } finally {
      setReelUploading(false);
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

  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>;
  }

  if (!video) {
    return <div className="container mx-auto py-10">Video not found</div>;
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex items-start gap-6">
        {video.thumbnail_url && (
          <img src={video.thumbnail_url} alt={video.title || "Video"} className="w-48 h-28 object-cover rounded-lg shadow-md" />
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">{video.title || "Processing Video"}</h1>
          <p className="text-muted-foreground">Status: {video.status.replace(/_/g, " ").toUpperCase()}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {video.status !== 'completed' && video.status !== 'failed' && (
        <Card>
          <CardContent className="p-6">
             <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Processing Step: {video.status.toUpperCase().replace('_', ' ')}</span>
                <span className="text-sm font-medium">{video.progress}%</span>
             </div>
             <Progress value={video.progress} className="h-2 mb-4" />
             <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Info className="h-4 w-4" />
                <p>AI Model: <span className="font-semibold">{video.ai_model || "Selecting..."}</span></p>
             </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {video.status === 'failed' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Generation Failed</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="font-medium mb-1">Reason: {video.error_message || "Unknown error occurred"}</p>
            <p className="text-sm opacity-90">
              {video.error_message?.toLowerCase().includes("quota") ? 
                "Tip: Check your AI provider's billing dashboard or verify your API key in Settings." :
                "Tip: Try using a different AI model in Settings or check if the video has clear speech."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Clip Suggestions (Awaiting Confirmation) */}
      {video.status === 'awaiting_confirmation' && video.suggestions && video.suggestions.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">AI-Detected Viral Moments</h2>
            </div>
            <Button variant="outline" size="sm" onClick={regenerateSuggestions}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {video.suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="overflow-hidden border-2 hover:border-primary/50 transition-all">
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold flex items-center gap-2">
                      {getViralAngleEmoji(suggestion.viral_angle)}
                      <span className="capitalize text-lg">{suggestion.title || suggestion.viral_angle}</span>
                    </span>
                    <div className={`text-right ${getViralScoreColor(suggestion.viral_score)}`}>
                      <div className="text-3xl font-bold">{suggestion.viral_score}</div>
                      <div className="text-xs opacity-80 font-medium">Viral Score</div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {Math.floor(suggestion.start_time / 60)}:{String(Math.floor(suggestion.start_time % 60)).padStart(2, '0')} - {Math.floor(suggestion.end_time / 60)}:{String(Math.floor(suggestion.end_time % 60)).padStart(2, '0')} 
                    <span className="ml-2">({Math.floor(suggestion.end_time - suggestion.start_time)}s clip)</span>
                  </p>
                </div>

                <CardContent className="p-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-1">🎣 Hook (First 3 Seconds)</h4>
                    <p className="text-sm leading-relaxed">{suggestion.hook_description}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-1">💡 Why This Will Go Viral</h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">{suggestion.reasoning}</p>
                  </div>

                  <div className="pt-3 flex gap-2">
                    {suggestion.status === 'suggested' && (
                      <>
                        <Button 
                          className="flex-1" 
                          size="sm"
                          onClick={() => approveSuggestion(suggestion.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Generate
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => rejectSuggestion(suggestion.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {suggestion.status === 'approved' && (
                      <div className="flex items-center justify-center w-full text-sm text-green-600 dark:text-green-400 font-medium">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approved - Generating...
                      </div>
                    )}
                    {suggestion.status === 'rejected' && (
                      <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
                        <XCircle className="h-4 w-4 mr-2" />
                        Rejected
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Alert>
            <TrendingUp className="h-4 w-4" />
            <AlertTitle>How It Works</AlertTitle>
            <AlertDescription>
              Our AI analyzed the video content and identified these moments based on viral potential factors: strong hooks, emotional impact, surprise elements, and platform best practices. Click "Generate" to create the clips you want!
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Generated Clips (Completed) */}
      {video.status === 'completed' && (!video.clips || video.clips.length === 0) && (
        <Card>
          <CardContent className="p-10 text-center">
            <Info className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No clips generated</h3>
            <p className="text-muted-foreground">
              The AI processed your video but didn't find any segments suitable for viral clips. 
              Try a different video or adjust your AI settings.
            </p>
          </CardContent>
        </Card>
      )}

      {video.clips && video.clips.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Generated Clips ({video.clips.length})</h2>
            <Button variant="outline" size="sm" onClick={downloadAllClips}>Download All</Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {video.clips.map((clip) => (
              <Card key={clip.id} className="overflow-hidden border-none shadow-lg bg-card/50 backdrop-blur-sm group">
                <div className="aspect-[9/16] bg-black relative">
                  <video 
                    src={`${API_URL}/static/${clip.file_path.split('/').pop()}`} 
                    controls 
                    className="w-full h-full object-contain"
                    poster={video.thumbnail_url || undefined}
                  />
                </div>
                <CardContent className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">
                      {clip.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {clip.description}
                    </p>
                    {clip.tags && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {clip.tags.split(',').map((tag, idx) => (
                          <span key={idx} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            #{tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
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
                  
                  <div className="flex flex-col gap-2 pt-2">
                    <div className="flex gap-2">
                      <Button 
                        className="flex-[1.5] bg-[#FF0000] hover:bg-[#CC0000] text-white gap-2 transition-all hover:shadow-[0_0_15px_rgba(255,0,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => openUploadDialog(clip)}
                        disabled={!!clip.youtube_id}
                        size="sm"
                      >
                        <Youtube className="h-4 w-4" />
                        {clip.youtube_id ? "Uploaded" : "Upload"}
                      </Button>
                      <Button 
                        className="flex-1" 
                        variant="outline"
                        size="sm" 
                        onClick={() => downloadClip(clip.file_path, clip.title)}
                      >
                        Download
                      </Button>
                    </div>
                    <Button
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 text-white gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => openReelDialog(clip)}
                      disabled={!!clip.instagram_id}
                      size="sm"
                    >
                      <Instagram className="h-4 w-4" />
                      {clip.instagram_id ? "Posted to Reels" : "Upload to Reels"}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyMetadata(clip)}
                        className="flex-1"
                      >
                        Copy Metadata
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => shareClip(clip.file_path, clip.title)}
                        className="flex-1"
                      >
                        Share
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
            {youtubeAccounts.length > 1 && (
              <div className="grid gap-2">
                <label htmlFor="account" className="text-sm font-medium">Upload to Account</label>
                <Select 
                  value={selectedAccountId?.toString() || ""} 
                  onValueChange={(val) => setSelectedAccountId(parseInt(val))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {youtubeAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.channel_name} {account.is_primary && "(Primary)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
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

      {/* Instagram Reels Upload Dialog */}
      <Dialog open={!!reelClip} onOpenChange={(open) => !open && setReelClip(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upload to Instagram Reels</DialogTitle>
            <DialogDescription>
              The clip will be published as a Reel to your connected Instagram account.
            </DialogDescription>
          </DialogHeader>

          {reelStatus === "success" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-center font-medium">Reel published!</p>
              <Button onClick={() => setReelClip(null)} className="w-full">Close</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-4">
                {instagramAccounts.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      No Instagram account connected. Go to Settings → Instagram Integration to connect one.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {instagramAccounts.length > 1 && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Post to Account</label>
                        <Select
                          value={selectedIgAccountId?.toString() || ""}
                          onValueChange={(val) => setSelectedIgAccountId(parseInt(val))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {instagramAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                @{account.username} {account.is_primary && "(Primary)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid gap-2">
                      <label htmlFor="caption" className="text-sm font-medium">Caption</label>
                      <Textarea
                        id="caption"
                        value={reelCaption}
                        onChange={(e) => setReelCaption(e.target.value)}
                        className="h-32"
                        maxLength={2200}
                      />
                      <p className="text-xs text-muted-foreground text-right">{reelCaption.length}/2200</p>
                    </div>
                  </>
                )}
              </div>

              {reelStatus === "error" && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{reelError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setReelClip(null)} disabled={reelUploading}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUploadReel}
                  disabled={reelUploading || instagramAccounts.length === 0}
                  className="bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90 text-white"
                >
                  {reelUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    "Publish Reel"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
