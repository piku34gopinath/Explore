import { TrendingUp, TrendingDown } from "lucide-react";
import { type StatMetric } from "@/lib/mockData";
import { cn } from "@/lib/utils";

interface StatsGridProps {
  stats: StatMetric[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat) => (
        <div 
          key={stat.label}
          className="bg-white dark:bg-stitch-card p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2 hover:border-stitch-primary/30 transition-all group"
        >
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-bold text-stitch-cyan">
              {stat.value}
              {stat.unit && <span className="text-sm font-normal ml-1">{stat.unit}</span>}
            </h3>
            {stat.change && (
              <span className={cn(
                "text-sm font-semibold flex items-center gap-1",
                stat.isPositive ? "text-emerald-500" : "text-rose-500"
              )}>
                {stat.isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {stat.change}
              </span>
            )}
            {!stat.change && stat.unit === 'ms' && (
               <span className="text-slate-500 text-sm font-semibold">0% latency</span>
            )}
            {!stat.change && stat.label === 'Active Clusters' && (
               <span className="text-emerald-500 text-sm font-semibold">Live stream</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
