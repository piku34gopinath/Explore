import { LayoutDashboard, Globe, Video, Activity, Settings, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeTab?: string;
}

export function Sidebar({ activeTab = "Dashboard" }: SidebarProps) {
  const menuItems = [
    { name: "Dashboard", icon: LayoutDashboard },
    { name: "Global News", icon: Globe },
    { name: "Video Clips", icon: Video },
    { name: "Sentiments", icon: Activity },
  ];

  return (
    <aside className="w-64 flex-shrink-0 border-r border-white/5 dark:border-stitch-primary/20 flex flex-col bg-white dark:bg-stitch-bg/50 backdrop-blur-xl h-screen">
      <div className="p-6 flex items-center gap-3">
        <div className="size-10 bg-stitch-primary rounded-lg flex items-center justify-center text-white shadow-[0_0_15px_-3px_rgba(100,103,242,0.4)]">
          <Activity className="size-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-stitch-primary">AI Explorer</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Command Center</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {menuItems.map((item) => (
          <a
            key={item.name}
            href="#"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
              item.name === activeTab
                ? "bg-stitch-primary text-white shadow-[0_0_15px_-3px_rgba(100,103,242,0.4)]"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-stitch-primary/10 hover:text-stitch-primary"
            )}
          >
            <item.icon className="size-5" />
            <span className="font-medium text-sm">{item.name}</span>
          </a>
        ))}

        <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-stitch-primary/10 hover:text-stitch-primary transition-all"
          >
            <Settings className="size-5" />
            <span className="font-medium text-sm">Settings</span>
          </a>
        </div>
      </nav>

      <div className="p-4">
        <button className="w-full flex items-center justify-center gap-2 bg-stitch-primary/20 hover:bg-stitch-primary/30 text-stitch-primary border border-stitch-primary/50 py-3 rounded-lg font-bold text-sm transition-all">
          <PlusCircle className="size-4" />
          New Analysis
        </button>
      </div>
    </aside>
  );
}
