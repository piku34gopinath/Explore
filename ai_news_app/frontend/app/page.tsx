'use client';

import { useEffect, useState } from 'react';
import { getTrends, Trend } from '@/lib/api';
import { Loader2, TrendingUp, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [providerInfo, setProviderInfo] = useState<{name: string, model?: string, nickname?: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = async (force = false) => {
    // Only show loading if we don't have trends or it's a force refresh
    if (trends.length === 0 || force) {
        setLoading(true);
    }
    setError(null);
    try {
      const data = await getTrends(force);
      if (data && Array.isArray(data.trends)) {
        setTrends(data.trends);
        setProviderInfo({
            name: data.provider,
            model: data.model,
            nickname: data.nickname
        });
      } else {
        setError('Failed to load trends. Invalid response format.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching trends.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#000000] font-sans py-8 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-10 border-b border-slate-800 pb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl flex items-center">
              <TrendingUp className="w-8 h-8 mr-3 text-blue-500" />
              AI News Dashboard
            </h1>
            <div className="mt-2 flex items-center gap-3">
                <p className="text-lg text-slate-400">
                Top trending stories curated by AI.
                </p>
                {providerInfo && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-900/30 text-blue-400 border border-blue-800/50">
                        Powered by {providerInfo.nickname || providerInfo.name} 
                        {providerInfo.model && ` (${providerInfo.model})`}
                    </span>
                )}
            </div>
          </div>
          <div className="flex space-x-3">
             <Link href="/settings" className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
               Settings
             </Link>
            <button 
              onClick={() => fetchTrends(true)} 
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-blue-600/50 text-sm font-medium rounded-lg shadow-lg text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-8 bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-200">Error loading trends</h3>
              <div className="mt-1 text-sm text-red-300/80">{error}</div>
              <div className="mt-3 text-sm">
                  <Link href="/settings" className="font-semibold text-red-400 underline hover:text-red-300">Check Settings</Link>
              </div>
            </div>
          </div>
        )}

        {loading && trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 absolute inset-0" />
              <div className="h-12 w-12 rounded-full border-4 border-blue-900/20"></div>
            </div>
            <p className="text-slate-500 mt-6 font-medium">Analyzing global news trends...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {trends.map((trend, index) => (
              <div key={index} className="bg-[#0a0c10] overflow-hidden shadow-2xl rounded-2xl border border-slate-800 hover:border-blue-900/50 transition-all duration-300 flex flex-col group">
                <div className="p-7 flex-1">
                  <div className="flex justify-between items-start mb-5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                      trend.category === 'Tech' ? 'bg-purple-900/40 text-purple-400 border border-purple-800/30' :
                      trend.category === 'Politics' ? 'bg-red-900/40 text-red-400 border border-red-800/30' :
                      'bg-blue-900/40 text-blue-400 border border-blue-800/30'
                    }`}>
                      {trend.category}
                    </span>
                    <div className="flex items-center text-xs text-slate-500 font-mono bg-slate-900/50 px-2 py-1 rounded">
                       Score: <span className="text-blue-400 ml-1 font-bold">{trend.importance_score}</span>/10
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 line-clamp-2 group-hover:text-blue-400 transition-colors">
                    {trend.event_title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed line-clamp-4 mb-4">
                    {trend.summary}
                  </p>
                </div>
                <div className="bg-slate-900/30 px-7 py-5 border-t border-slate-800/50 flex justify-end items-center">
                    <Link 
                      href={`/topic/${index}?trend=${encodeURIComponent(JSON.stringify(trend))}`}
                      className="text-sm font-bold text-blue-400 hover:text-blue-300 flex items-center group/link"
                    >
                        View Details
                        <ArrowRight className="w-4 h-4 ml-1.5 transform group-hover/link:translate-x-0.5 transition-transform" />
                    </Link>
                </div>
              </div>
            ))}
            
            {trends.length === 0 && !loading && !error && (
                <div className="col-span-full text-center py-20 border-2 border-dashed border-slate-800 rounded-3xl">
                    <p className="text-slate-500 text-lg">No trends found.</p>
                    <p className="text-slate-600 text-sm mt-2">Try refreshing or checking your news source settings.</p>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
