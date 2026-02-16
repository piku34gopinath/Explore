"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2, Mic, Smartphone, Play, ArrowRight } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  
  // Use env var or default to localhost:8000
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Configure axios to send cookies
  axios.defaults.withCredentials = true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Hardcoded user_id for MVP
      const response = await axios.post(`${API_URL}/videos/submit`, {
        original_url: url,
        user_id: 1 
      });
      router.push(`/video/${response.data.id}`);
    } catch (error) {
      console.error("Error submitting video:", error);
      alert("Failed to submit video. Please make sure the backend is running.");
      setLoading(false);
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
          <CardContent className="p-2">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 p-2">
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
              <Button 
                type="submit" 
                disabled={loading} 
                size="lg"
                className="h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/25 transition-all hover:scale-105"
              >
                {loading ? (
                  <span className="flex items-center gap-2">Processing...</span>
                ) : (
                  <span className="flex items-center gap-2">Generate <Wand2 className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
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
