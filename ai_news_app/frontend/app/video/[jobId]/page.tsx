'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getJobStatus, JobStatusResponse } from '@/lib/api';
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, Download, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function VideoResultPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const router = useRouter();
  
  const [statusData, setStatusData] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await getJobStatus(jobId);
      setStatusData(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch job status.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;

    // Initial fetch
    fetchStatus();

    // Poll every 5 seconds if processing
    const interval = setInterval(() => {
      if (statusData?.status !== 'completed' && statusData?.status !== 'failed') {
        fetchStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId, statusData?.status]);

  if (!jobId) return null;

  return (
    <div className="min-h-screen bg-[#000000] font-sans py-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-4xl mx-auto">
         <div className="mb-10">
          <Link href="/" className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-blue-400 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
        </div>

        <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
          <div className="p-10 text-center">
            
            {loading && !statusData && (
               <div className="flex flex-col items-center py-20">
                  <div className="relative mb-8">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin absolute inset-0" />
                    <div className="w-16 h-16 rounded-full border-4 border-blue-900/20"></div>
                  </div>
                  <h2 className="text-2xl font-black text-white">Loading Job Details...</h2>
                  <p className="text-slate-500 mt-3 font-medium">Checking the status of your video pipeline.</p>
               </div>
            )}

            {statusData?.status === 'processing' && (
              <div className="flex flex-col items-center py-16">
                 <div className="relative">
                   <div className="w-32 h-32 border-8 border-blue-900/20 rounded-full"></div>
                   <div className="absolute top-0 left-0 w-32 h-32 border-t-8 border-blue-500 rounded-full animate-spin"></div>
                   <div className="absolute inset-0 flex items-center justify-center font-black text-blue-400 text-2xl">
                     {statusData.percent}%
                   </div>
                 </div>
                 <h2 className="text-3xl font-black text-white mt-8 tracking-tight">Generating Your <span className="text-blue-500">Video</span></h2>
                 <p className="text-slate-400 mt-4 max-w-md mx-auto leading-relaxed font-medium">
                   AI is analyzing the script, selecting assets, and rendering your video. This may take a few minutes.
                 </p>
                 <div className="mt-10 px-6 py-2.5 bg-blue-900/20 text-blue-400 border border-blue-800/30 rounded-full text-sm font-bold flex items-center shadow-lg shadow-blue-900/10">
                   <RefreshCw className="w-4 h-4 mr-3 animate-spin" /> Auto-refreshing status
                 </div>
              </div>
            )}

            {statusData?.status === 'completed' && (
               <div className="flex flex-col items-center py-6">
                  <div className="w-20 h-20 bg-emerald-950/30 text-emerald-400 rounded-2xl flex items-center justify-center mb-8 border border-emerald-900/30 shadow-2xl">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h2 className="text-4xl font-black text-white mb-3 tracking-tight">Video <span className="text-emerald-400">Ready!</span></h2>
                  <p className="text-slate-400 mb-10 font-medium">Your viral news video has been successfully generated.</p>
                  
                  <div className="w-full max-w-sm bg-black rounded-3xl overflow-hidden shadow-2xl shadow-blue-900/20 aspect-[9/16] relative mb-12 border border-slate-800">
                     {/* Player */}
                     <video 
                        src={statusData.video_url} 
                        controls 
                        className="w-full h-full object-cover"
                        poster="https://placehold.co/1080x1920/1f2937/fff?text=Video+Ready" 
                     />
                  </div>

                  <div className="flex gap-6 w-full max-w-md">
                     <a 
                       href={statusData.video_url} 
                       target="_blank"
                       download
                       className="flex-1 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-500 flex items-center justify-center shadow-xl shadow-blue-900/20 transition-all active:scale-95"
                     >
                       <Download className="w-6 h-6 mr-3" /> Download
                     </a>
                     <Link 
                       href="/"
                       className="flex-1 px-8 py-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-2xl font-black hover:bg-slate-800 hover:text-white flex items-center justify-center transition-all"
                     >
                       Create Another
                     </Link>
                  </div>
               </div>
            )}

            {(statusData?.status === 'failed' || error) && (
               <div className="flex flex-col items-center py-16">
                  <div className="w-20 h-20 bg-red-950/30 text-red-500 rounded-2xl flex items-center justify-center mb-8 border border-red-900/30 shadow-2xl">
                    <AlertCircle className="w-10 h-10" />
                  </div>
                  <h2 className="text-4xl font-black text-white mb-4 tracking-tight">Pipeline Failed</h2>
                  <p className="text-red-300/80 max-w-md mx-auto mb-10 font-medium leading-relaxed">
                    {error || statusData?.error || "An unexpected error occurred during video generation."}
                  </p>
                   <Link 
                       href="/"
                       className="px-10 py-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-2xl font-black hover:bg-slate-800 hover:text-white transition-all shadow-xl"
                     >
                       Return to Dashboard
                   </Link>
               </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
