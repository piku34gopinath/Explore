import { Search, Bell } from "lucide-react";

export function Header() {
  return (
    <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200 dark:border-stitch-primary/20 bg-white/50 dark:bg-stitch-bg/50 backdrop-blur-md z-10">
      <div className="flex-1 max-w-xl">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 group-focus-within:text-stitch-primary transition-colors" />
          <input
            className="w-full bg-slate-100 dark:bg-stitch-card border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-stitch-primary text-slate-200 outline-none"
            placeholder="Search AI database for signals..."
            type="text"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button className="relative p-2 text-slate-500 hover:text-stitch-primary transition-colors">
          <Bell className="size-5" />
          <span className="absolute top-2 right-2 size-2 bg-stitch-cyan rounded-full border-2 border-stitch-bg"></span>
        </button>
        
        <div className="flex items-center gap-3 pl-6 border-l border-slate-200 dark:border-slate-800">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold leading-none">Alex Rivera</p>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Lead Analyst</p>
          </div>
          <div className="size-10 rounded-lg border border-stitch-primary/50 overflow-hidden">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdzJVpeAzB6ehyn-_XLnTxed1JL-h00WyuSeUI6cTpmeqsVtDqN4Q8GRfLjyg0sxSKBlcuHv3h70oncUhYx5kp7JSHMDTJDNBjLN8BP7w0GQlFxZthAjsfyEO-erd8E9ez4YFBFl2S5rc-VS8bnWNBzAuLbujOTEp25JXAOcX7X_cqdDBdQnNmukq928Swz0oxc1TbXnIfoIk5aKZ9q49bCrNgJZYBfvkVOUPYiemVc0J-JNCHtoHj0eP1jWmICNy9Y1vO-NJFAMk" 
              alt="User profile"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
