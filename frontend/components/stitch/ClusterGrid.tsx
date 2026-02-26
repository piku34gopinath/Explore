import { type NewsCluster } from "@/lib/mockData";
import { Share2 } from "lucide-react";

interface ClusterGridProps {
  clusters: NewsCluster[];
}

export function ClusterGrid({ clusters }: ClusterGridProps) {
  return (
    <div className="lg:w-2/3 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <div className="size-2 bg-stitch-primary rounded-full" />
          News Clusters
        </h2>
        <button className="text-stitch-primary text-sm font-semibold hover:underline">View All Clusters</button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {clusters.map((cluster) => (
          <div 
            key={cluster.id}
            className="bg-white dark:bg-stitch-card border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden group hover:shadow-[0_0_15px_-3px_rgba(100,103,242,0.4)] transition-all duration-300"
          >
            <div className="h-40 overflow-hidden relative">
              <img 
                src={cluster.image} 
                alt={cluster.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute top-3 left-3 px-2 py-1 bg-stitch-primary text-[10px] font-bold uppercase tracking-tighter rounded text-white">
                {cluster.tag}
              </div>
            </div>
            <div className="p-5">
              <h4 className="font-bold text-lg mb-1 leading-tight">{cluster.name}</h4>
              <p className="text-slate-500 text-xs mb-4">{cluster.articleCount} articles indexed today</p>
              
              <div className="mb-5 flex items-center gap-4">
                <div className="flex-1 h-8">
                  <svg className="w-full h-full text-stitch-cyan" viewBox="0 0 100 20">
                    <path 
                      d="M0 15 Q 10 5, 20 12 T 40 8 T 60 18 T 80 5 T 100 12" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                    />
                  </svg>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Sentiment</span>
                  <span className="text-stitch-cyan text-xs font-bold uppercase tracking-widest">{cluster.sentiment}</span>
                </div>
              </div>
              
              <button className="w-full bg-stitch-primary py-2.5 rounded-lg text-sm font-bold text-white hover:bg-stitch-primary/90 transition-colors">
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
