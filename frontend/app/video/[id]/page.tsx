"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertCircle, Sparkles, TrendingUp, CheckCircle, XCircle, RefreshCw, Youtube, Twitter, Instagram, Facebook, CheckCircle2, Loader2, Share2, Globe, Lock } from "lucide-react";
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

  // Upload Dialog State
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  const [youtubeAccounts, setYoutubeAccounts] = useState<any[]>([]);
  const [xAccounts, setXAccounts] = useState<any[]>([]);
  const [facebookAccounts, setFacebookAccounts] = useState<any[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<any[]>([]);
  const [successResults, setSuccessResults] = useState<{platform: string, name: string}[]>([]);
  
  // Selection State
  const [selectedAccounts, setSelectedAccounts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"youtube" | "x" | "facebook" | "instagram">("youtube");

  const toggleAccount = (account: any, platform: string) => {
    const accountKey = `${platform}-${account.id}`;
    setSelectedAccounts(prev => {
      const exists = prev.find(a => `${a.platform}-${a.id}` === accountKey);
      if (exists) {
        return prev.filter(a => `${a.platform}-${a.id}` !== accountKey);
      } else {
        const name = platform === "youtube" ? account.channel_name : 
                     platform === "x" ? `@${account.username}` : 
                     platform === "facebook" ? account.page_name : 
                     `@${account.username}`;
        return [...prev, { ...account, platform, name }];
      }
    });
  };

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
    fetchAllAccounts();
    const interval = setInterval(fetchVideo, 3000);
    return () => clearInterval(interval);
  }, [videoId]);

  const fetchAllAccounts = async () => {
    await Promise.all([
      fetchYoutubeAccounts(),
      fetchXAccounts(),
      fetchFacebookAccounts(),
      fetchInstagramAccounts()
    ]);
  };

  const fetchYoutubeAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/youtube/status`);
      setYoutubeAccounts(response.data.accounts || []);
      
      // Auto-select primary YouTube account if none selected yet
      if (selectedAccounts.length === 0 && response.data.accounts?.length > 0) {
        const primary = response.data.accounts.find((acc: any) => acc.is_primary) || response.data.accounts[0];
        toggleAccount(primary, "youtube");
      }
    } catch (error) {
      console.error("Error fetching YouTube accounts:", error);
    }
  };

  const fetchXAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/x/status`);
      setXAccounts(response.data.accounts || []);
    } catch (error) {
      console.error("Error fetching X accounts:", error);
    }
  };

  const fetchFacebookAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/facebook/status`);
      setFacebookAccounts(response.data.accounts || []);
    } catch (error) {
      console.error("Error fetching Facebook accounts:", error);
    }
  };

  const fetchInstagramAccounts = async () => {
    try {
      const response = await axios.get(`${API_URL}/auth/instagram/status`);
      setInstagramAccounts(response.data.accounts || []);
    } catch (error) {
      console.error("Error fetching Instagram accounts:", error);
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
    setUploadError("");
    
    // Clear previous selections and initialize with primary YouTube if available
    setSelectedAccounts([]);
    setActiveTab("youtube");
    
    fetchAllAccounts(); 
  };

  const handleUpload = async () => {
    if (!selectedClip || selectedAccounts.length === 0) return;
    
    setUploadStatus("uploading");
    setUploadError("");

    try {
      const results = [];
      
      // Batch upload - Sequential for reliability
      for (const account of selectedAccounts) {
        const endpoint = `${API_URL}/upload/${account.platform}`;
        
        let payload: any = {
          video_id: selectedClip.id,
        };

        if (account.platform === "youtube") {
          payload = {
            ...payload,
            title: uploadTitle,
            description: uploadDesc,
            tags: uploadTags,
            privacy_status: "public" // Explicitly public
          };
        } else if (account.platform === "instagram") {
          payload.caption = `${uploadTitle}\n\n${uploadDesc}\n\n${uploadTags}`;
        } else if (account.platform === "facebook") {
          payload.description = uploadDesc;
        } else if (account.platform === "x") {
          payload.text = `${uploadTitle}\n${uploadTags}`;
        }

        const urlWithParams = `${endpoint}?account_id=${account.id}`;
        
        try {
          await axios.post(urlWithParams, payload);
          results.push({ platform: account.platform, name: account.name, status: "success" });
        } catch (err: any) {
          console.error(`Upload error for ${account.platform}:`, err);
          results.push({ platform: account.platform, name: account.name, status: "error", message: err.response?.data?.detail || "Upload failed" });
        }
      }

      const hasError = results.some(r => r.status === "error");
      const successfulOnes = results.filter(r => r.status === "success").map(r => ({ platform: r.platform, name: r.name }));
      setSuccessResults(successfulOnes);

      if (hasError) {
        const errorMessages = results.filter(r => r.status === "error").map(r => `${r.name}: ${r.message}`).join(", ");
        setUploadStatus("error");
        setUploadError(`Some uploads failed: ${errorMessages}`);
      } else {
        setUploadStatus("success");
        // Refresh video to show updated upload status
        await fetchVideo();
      }
    } catch (err: any) {
      console.error("Batch upload logical error:", err);
      setUploadStatus("error");
      setUploadError("A critical error occurred during the batch upload process.");
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
        <DialogContent className="sm:max-w-[950px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Share2 className="h-6 w-6 text-primary" />
              Post to Social Media
            </DialogTitle>
            <DialogDescription>
              Select accounts and customize your post. All posts will be set to <strong>Public</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row border-t mt-2">
            {/* Left Column: Account Selection */}
            <div className="flex-1 flex flex-col border-r bg-muted/30">
              <div className="flex border-b bg-background overflow-x-auto scrollbar-hide">
                {(["youtube", "instagram", "facebook", "x"] as const).map((platform) => (
                  <button
                    key={platform}
                    onClick={() => setActiveTab(platform)}
                    className={`flex-1 min-w-[100px] py-4 px-4 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
                      activeTab === platform 
                        ? "border-primary text-primary bg-primary/5 active:scale-95" 
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {platform === "youtube" && <Youtube className="h-4 w-4" />}
                    {platform === "x" && <Twitter className="h-4 w-4" />}
                    {platform === "instagram" && <Instagram className="h-4 w-4" />}
                    {platform === "facebook" && <Facebook className="h-4 w-4" />}
                    <span className="capitalize">{platform}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {activeTab === "youtube" && youtubeAccounts.map((account) => (
                  <div 
                    key={`yt-${account.id}`}
                    onClick={() => toggleAccount(account, "youtube")}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${selectedAccounts.find(a => a.platform === "youtube" && a.id === account.id) ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background border-transparent hover:border-muted-foreground/20"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 shadow-inner">
                        <Youtube className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold truncate">{account.channel_name}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold opacity-70">YouTube</p>
                      </div>
                    </div>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedAccounts.find(a => a.platform === "youtube" && a.id === account.id) ? "bg-primary border-primary" : "border-muted"}`}>
                      {selectedAccounts.find(a => a.platform === "youtube" && a.id === account.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                ))}

                {activeTab === "x" && xAccounts.map((account) => (
                  <div 
                    key={`x-${account.id}`}
                    onClick={() => toggleAccount(account, "x")}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${selectedAccounts.find(a => a.platform === "x" && a.id === account.id) ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background border-transparent hover:border-muted-foreground/20"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-black/5 rounded-full flex items-center justify-center text-black shadow-inner">
                        <Twitter className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold truncate">@{account.username}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold opacity-70">X (Twitter)</p>
                      </div>
                    </div>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedAccounts.find(a => a.platform === "x" && a.id === account.id) ? "bg-primary border-primary" : "border-muted"}`}>
                      {selectedAccounts.find(a => a.platform === "x" && a.id === account.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                ))}

                {activeTab === "facebook" && facebookAccounts.map((account) => (
                  <div 
                    key={`fb-${account.id}`}
                    onClick={() => toggleAccount(account, "facebook")}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${selectedAccounts.find(a => a.platform === "facebook" && a.id === account.id) ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background border-transparent hover:border-muted-foreground/20"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-inner">
                        <Facebook className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold truncate">{account.page_name}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold opacity-70">Facebook</p>
                      </div>
                    </div>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedAccounts.find(a => a.platform === "facebook" && a.id === account.id) ? "bg-primary border-primary" : "border-muted"}`}>
                      {selectedAccounts.find(a => a.platform === "facebook" && a.id === account.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                ))}

                {activeTab === "instagram" && instagramAccounts.map((account) => (
                  <div 
                    key={`ig-${account.id}`}
                    onClick={() => toggleAccount(account, "instagram")}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${selectedAccounts.find(a => a.platform === "instagram" && a.id === account.id) ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-background border-transparent hover:border-muted-foreground/20"}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 shadow-inner">
                        <Instagram className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-base font-bold truncate">@{account.username}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold opacity-70">Instagram</p>
                      </div>
                    </div>
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedAccounts.find(a => a.platform === "instagram" && a.id === account.id) ? "bg-primary border-primary" : "border-muted"}`}>
                      {selectedAccounts.find(a => a.platform === "instagram" && a.id === account.id) && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                ))}

                {((activeTab === "youtube" && youtubeAccounts.length === 0) ||
                  (activeTab === "x" && xAccounts.length === 0) ||
                  (activeTab === "facebook" && facebookAccounts.length === 0) ||
                  (activeTab === "instagram" && instagramAccounts.length === 0)) && (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-70">
                      <div className="h-20 w-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <h4 className="text-lg font-bold mb-2">No accounts connected</h4>
                      <p className="text-sm text-muted-foreground mb-6 max-w-[200px]">You haven't linked any {activeTab} accounts to your profile yet.</p>
                      <Button variant="outline" size="sm" onClick={() => window.location.href='/settings'} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Go to Settings
                      </Button>
                    </div>
                )}
              </div>
            </div>

            {/* Right Column: Post Details & Summary */}
            <div className="flex-[0.85] flex flex-col bg-background">
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {uploadStatus === "uploading" ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-6 py-20 animate-in fade-in zoom-in duration-300">
                    <div className="relative">
                      <div className="h-20 w-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <Globe className="h-8 w-8 text-primary absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold">Publishing Viral Content</p>
                      <p className="text-muted-foreground text-sm">Uploading to {selectedAccounts.length} selected platforms...</p>
                    </div>
                  </div>
                ) : uploadStatus === "success" ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-6 py-20 animate-in fade-in zoom-in duration-300">
                    <div className="h-20 w-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 shadow-inner">
                      <CheckCircle2 className="h-10 w-10 animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-2xl font-black italic text-emerald-500">BOOM! GOING VIRAL 🚀</p>
                      <p className="text-muted-foreground font-medium">Successfully published to:</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {successResults.map((res, i) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                            {res.platform === "youtube" && <Youtube className="h-3.5 w-3.5 text-red-600" />}
                            {res.platform === "x" && <Twitter className="h-3.5 w-3.5 text-black" />}
                            {res.platform === "instagram" && <Instagram className="h-3.5 w-3.5 text-pink-600" />}
                            {res.platform === "facebook" && <Facebook className="h-3.5 w-3.5 text-blue-600" />}
                            <span className="text-xs font-bold">{res.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setSelectedClip(null)}
                      className="mt-6 rounded-xl border-emerald-500/50 hover:bg-emerald-500/5 font-bold"
                    >
                      Close and Continue
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-6">
                      <div className="grid gap-2 outline-none group">
                        <label className="text-sm font-black uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors italic">Post Title</label>
                        <Input
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="Short and catchy..."
                          className="text-xl font-bold py-7 px-4 rounded-xl border-2 focus-visible:ring-primary/20"
                        />
                      </div>
                      
                      <div className="grid gap-2 group">
                        <label className="text-sm font-black uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors italic">Description / Caption</label>
                        <Textarea
                          value={uploadDesc}
                          onChange={(e) => setUploadDesc(e.target.value)}
                          placeholder="Tell your audience about this clip..."
                          rows={4}
                          className="rounded-xl border-2 focus-visible:ring-primary/20 resize-none p-4"
                        />
                      </div>

                      <div className="grid gap-2 group">
                        <label className="text-sm font-black uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors italic">Viral Hashtags</label>
                        <Input
                          value={uploadTags}
                          onChange={(e) => setUploadTags(e.target.value)}
                          placeholder="#viral, #shorts, #trending"
                          className="rounded-xl border-2 focus-visible:ring-primary/20 px-4"
                        />
                      </div>
                    </div>

                    {/* Selection Summary Sidebar-within-column */}
                    <div className="space-y-4 pt-8 border-t">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black uppercase tracking-widest text-muted-foreground italic">
                          Selected Targets ({selectedAccounts.length})
                        </label>
                        {selectedAccounts.length > 0 && (
                          <button onClick={() => setSelectedAccounts([])} className="text-xs text-primary font-bold hover:underline underline-offset-4 decoration-2">
                            REMOVE ALL
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        {selectedAccounts.length === 0 ? (
                          <div className="p-6 border-2 border-dashed rounded-2xl text-center text-sm text-muted-foreground bg-muted/20">
                            Select at least one account on the left
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {selectedAccounts.map((account) => (
                              <div 
                                key={`${account.platform}-${account.id}`}
                                className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border-2 border-transparent hover:border-destructive/20 hover:bg-destructive/5 transition-all group"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center shadow-sm">
                                    {account.platform === "youtube" && <Youtube className="h-4 w-4 text-red-600" />}
                                    {account.platform === "x" && <Twitter className="h-4 w-4 text-black" />}
                                    {account.platform === "instagram" && <Instagram className="h-4 w-4 text-pink-600" />}
                                    {account.platform === "facebook" && <Facebook className="h-4 w-4 text-blue-600" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold truncate tracking-tight">{account.name}</p>
                                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter opacity-70">{account.platform}</p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => toggleAccount(account, account.platform)}
                                  className="text-muted-foreground hover:text-destructive p-2 rounded-lg hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <XCircle className="h-5 w-5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {uploadStatus === "error" && (
                  <Alert variant="destructive" className="rounded-2xl border-2 shadow-lg animate-in shake duration-500">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle className="font-bold">Publishing Errors</AlertTitle>
                    <AlertDescription className="text-xs leading-relaxed font-medium opacity-90">
                      {uploadError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              
              <div className="p-8 border-t bg-muted/10 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between gap-6">
                  <Button 
                    variant="ghost" 
                    onClick={() => setSelectedClip(null)} 
                    disabled={uploadStatus === "uploading"}
                    className="font-bold uppercase tracking-widest text-xs hover:bg-destructive/10 hover:text-destructive"
                  >
                    Discard
                  </Button>
                  <Button 
                    onClick={handleUpload} 
                    disabled={selectedAccounts.length === 0 || uploadStatus === "uploading"}
                    size="lg"
                    className="flex-1 py-7 rounded-2xl gap-3 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95"
                  >
                    {uploadStatus === "uploading" ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Globe className="h-6 w-6" />
                    )}
                    {uploadStatus === "uploading" ? "Publishing Now..." : `Go Live on ${selectedAccounts.length} Target${selectedAccounts.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
