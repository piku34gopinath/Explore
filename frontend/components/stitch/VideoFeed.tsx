import { Play } from "lucide-react";
import { type VideoClip } from "@/lib/mockData";

interface VideoFeedProps {
  videos: VideoClip[];
}

export function VideoFeed({ videos }: VideoFeedProps) {
  return (
    <div className="lg:w-1/3 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Play className="size-5 text-stitch-primary fill-stitch-primary" />
          Trending Videos
        </h2>
      </div>
      
      <div className="bg-white dark:bg-stitch-card border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-5 overflow-y-auto max-h-[800px] custom-scrollbar">
        {videos.map((video) => (
          <div key={video.id} className="group cursor-pointer">
            <div className="aspect-video rounded-lg overflow-hidden relative mb-3">
              <img 
                src={video.thumbnail} 
                alt={video.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="text-white size-10 fill-white" />
              </div>
              <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                {video.duration}
              </div>
            </div>
            <div>
              <h5 className="font-bold text-sm leading-snug group-hover:text-stitch-primary transition-colors">
                {video.title}
              </h5>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-slate-500 font-bold uppercase">{video.views}</span>
                <span className="px-2 py-0.5 bg-stitch-primary/20 text-stitch-primary text-[10px] font-bold rounded border border-stitch-primary/30">
                  {video.engagement} Engagement
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
