'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, ExternalLink, TrendingUp, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Trend, API_PROXY_URL } from '@/lib/api';

export default function TopicPage() {
  const searchParams = useSearchParams();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  useEffect(() => {
    const trendParam = searchParams.get('trend');
    if (trendParam) {
      try {
        setTrend(JSON.parse(decodeURIComponent(trendParam)));
      } catch (e) {
        console.error('Failed to parse trend data', e);
      }
    }
  }, [searchParams]);

  if (!trend) {
    return (
      <div className="min-h-screen bg-[#000000] text-white flex items-center justify-center">
        <p className="text-slate-400">Loading story details...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] font-sans py-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-[#0a0c10] rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
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

            <h1 className="text-3xl font-extrabold text-white mb-6 leading-tight">
              {trend.event_title}
            </h1>

            <p className="text-lg text-slate-400 mb-10 leading-relaxed">
              {trend.summary}
            </p>

            <div className="border-t border-slate-800 pt-10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                <FileText className="w-5 h-5 mr-3 text-blue-500" />
                Resource Links
              </h3>
              <p className="text-sm text-slate-500 mb-6 font-medium">Click "View" to read the article in a modal or generate a script.</p>
              
              <div className="grid gap-4">
                {trend.source_urls && trend.source_urls.length > 0 ? (
                  trend.source_urls.slice(0, 4).map((url, index) => {
                    let domain = 'Source';
                    try {
                        domain = new URL(url).hostname.replace('www.', '');
                    } catch (e) {
                        console.error('Invalid URL:', url);
                        domain = url && url.length > 10 ? url.substring(0, 20) + '...' : 'Direct Source';
                    }
                    return (
                      <div key={index} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-xl border border-slate-800 bg-slate-900/20 hover:border-blue-900/50 hover:bg-slate-900/40 transition-all group">
                        <div className="flex items-center space-x-4 mb-4 sm:mb-0 flex-1 min-w-0 pointer-events-none">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:bg-slate-700 transition-colors shrink-0">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-white capitalize truncate">{domain}</h4>
                            <p className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-md">{url}</p>
                          </div>
                        </div>
                        <div className="flex space-x-3 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white"
                            onClick={() => setSelectedUrl(url)}
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Link 
                            href={`/script?trend=${encodeURIComponent(JSON.stringify(trend))}`}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
                          >
                            Generate Script
                          </Link>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-slate-500 italic">No resources available for this story.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Backdrop */}
      {selectedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0a0c10] w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0a0c10]">
              <div className="flex items-center space-x-3 overflow-hidden">
                <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                <span className="font-bold text-white truncate max-w-md">
                  {selectedUrl}
                </span>
                <a 
                  href={selectedUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-4 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded flex items-center shrink-0 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 mr-1.5" />
                  Open in New Tab
                </a>
              </div>
              <button 
                onClick={() => setSelectedUrl(null)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors ml-4"
              >
                <X className="w-6 h-6 text-slate-400 hover:text-white" />
              </button>
            </div>
            
            {/* Modal Content - Iframe */}
            <div className="flex-1 bg-slate-950">
              <iframe 
                src={`${API_PROXY_URL}${encodeURIComponent(selectedUrl)}`} 
                className="w-full h-full border-none bg-white font-sans"
                title="Source Content"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-[#0a0c10] flex justify-end">
              <Button 
                className="bg-slate-800 hover:bg-slate-700 text-white" 
                onClick={() => setSelectedUrl(null)}
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

