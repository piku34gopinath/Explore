"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [videos, setVideos] = useState([]);
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        // Hardcoded user_id for MVP
        const response = await axios.get(`${API_URL}/users/1/videos`);
        setVideos(response.data);
      } catch (error) {
        console.error("Error fetching videos:", error);
      }
    };

    fetchVideos();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Your Videos</h1>
        <Link href="/">
          <Button>Process New Video</Button>
        </Link>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          No videos yet. Submit one to get started!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video: any) => (
             <Link href={`/video/${video.id}`} key={video.id}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <div className="aspect-video bg-muted relative">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">No Thumbnail</div>
                  )}
                  <div className="absolute top-2 right-2">
                     <span className={`px-2 py-1 rounded text-xs font-bold ${
                       video.status === 'completed' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                     }`}>
                       {video.status}
                     </span>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-bold line-clamp-1">{video.title || "Untitled Video"}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(video.created_at).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
