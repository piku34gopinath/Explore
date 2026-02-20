'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateScript, generateVideo, ScriptResponse } from '@/lib/api';
import { Loader2, Edit3, Type, Hash, Image as ImageIcon, Video, ArrowLeft, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ScriptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [scriptData, setScriptData] = useState<ScriptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoSuccess, setVideoSuccess] = useState<string | null>(null);

  useEffect(() => {
    const trendDataParam = searchParams.get('trend');
    if (!trendDataParam) {
      setError('No trend data provided.');
      setLoading(false);
      return;
    }

    try {
      const trendData = JSON.parse(decodeURIComponent(trendDataParam));
      generate(trendData);
    } catch (e) {
      setError('Invalid trend data.');
      setLoading(false);
    }
  }, [searchParams]);

  const generate = async (trendData: any) => {
    setGenerating(true);
    try {
      const data = await generateScript(trendData);
      
      if ((data as any).error) {
         setError((data as any).error);
         return;
      }

      setScriptData(data);
    } catch (err) {
      console.error(err);
      setError('Failed to generate script. Check your API settings.');
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!scriptData) return;
    setVideoGenerating(true);
    setVideoSuccess(null);
    try {
      const result = await generateVideo(scriptData);
      setVideoSuccess(`Video generation started! Job ID: ${result.job_id}`);
      
      // Redirect to status page after short delay
      setTimeout(() => {
        router.push(`/video/${result.job_id}`);
      }, 1500);

    } catch (err) {
      console.error(err);
      alert('Failed to start video generation. Check your Video Provider settings.');
    } finally {
      setVideoGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading || generating) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#000000]">
        <div className="relative mb-8">
            <Loader2 className="h-14 w-14 animate-spin text-blue-500 absolute inset-0" />
            <div className="h-14 w-14 rounded-full border-4 border-blue-900/20"></div>
        </div>
        <h2 className="text-xl font-bold text-white">Generating Viral Script...</h2>
        <p className="text-slate-500 mt-3 font-medium">AI is crafting hooks, story, and hashtags.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#000000] p-4 text-white">
        <div className="bg-red-950/20 border border-red-900/50 p-10 rounded-3xl text-center max-w-lg shadow-2xl">
          <div className="bg-red-900/40 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-800/30">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-4">Generation Failed</h2>
          <p className="text-red-200/70 mb-8 leading-relaxed font-medium">{error}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/" className="px-6 py-3 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 font-bold hover:bg-slate-800 hover:text-white transition-all">
              Back to Dashboard
            </Link>
            <Link href="/settings" className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-900/20">
              Check Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!scriptData) return null;

  return (
    <div className="min-h-screen bg-[#000000] font-sans py-8 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10">
          <Link href="/" className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-blue-400 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight sm:text-5xl flex items-center">
              <Edit3 className="w-10 h-10 mr-4 text-blue-500" />
              Script <span className="text-blue-500">Editor</span>
            </h1>
            <p className="mt-3 text-lg text-slate-400 font-medium">
              Review and edit your AI-generated script before video creation.
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
             {videoSuccess && (
                 <div className="text-emerald-400 text-sm font-bold flex items-center bg-emerald-950/20 px-4 py-3 rounded-xl border border-emerald-900/30 shadow-lg">
                     <CheckCircle className="w-5 h-5 mr-3" />
                     {videoSuccess}
                 </div>
             )}
            <button 
                onClick={handleGenerateVideo}
                disabled={videoGenerating || !!videoSuccess}
                className="inline-flex items-center px-8 py-4 bg-blue-600 text-white rounded-2xl text-base font-black hover:bg-blue-500 shadow-xl shadow-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
                {videoGenerating ? (
                    <>
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        Starting Job...
                    </>
                ) : (
                    <>
                        <Video className="w-6 h-6 mr-3" />
                        Generate Video
                    </>
                )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main Script Column */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="bg-[#0d1017] px-8 py-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center">
                    <span className="bg-blue-900/40 text-blue-400 p-1.5 rounded-lg mr-3 border border-blue-800/30">📄</span>
                    Video Script (60s)
                </h3>
                <button 
                  onClick={() => copyToClipboard(Object.values(scriptData.script).join('\n\n'))}
                  className="text-slate-400 hover:text-white text-xs font-bold flex items-center bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 mr-2" /> Copy All
                </button>
              </div>
              <div className="p-8 space-y-10">
                <div className="group">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 group-focus-within:text-blue-500 transition-colors">
                    0:00 - 0:03 HOOK
                  </label>
                  <textarea 
                    className="w-full p-5 bg-[#0d1117] border border-slate-800 rounded-2xl text-white font-bold text-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-900/10 focus:outline-none transition-all placeholder-slate-700 shadow-inner"
                    rows={2}
                    defaultValue={scriptData.script.hook}
                  />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 group-focus-within:text-blue-500 transition-colors">
                    0:03 - 0:40 MAIN STORY
                  </label>
                  <textarea 
                    className="w-full p-5 bg-[#0d1117] border border-slate-800 rounded-2xl text-white font-medium leading-relaxed focus:border-blue-500 focus:ring-4 focus:ring-blue-900/10 focus:outline-none transition-all placeholder-slate-700 shadow-inner"
                    rows={8}
                    defaultValue={scriptData.script.main_story}
                  />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 group-focus-within:text-blue-500 transition-colors">
                    0:40 - 0:55 WHY IT MATTERS
                  </label>
                  <textarea 
                    className="w-full p-5 bg-[#0d1117] border border-slate-800 rounded-2xl text-slate-300 font-medium italic focus:border-blue-500 focus:ring-4 focus:ring-blue-900/10 focus:outline-none transition-all placeholder-slate-700 shadow-inner"
                    rows={3}
                    defaultValue={scriptData.script.why_it_matters}
                  />
                </div>
                <div className="group">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 group-focus-within:text-blue-500 transition-colors">
                    0:55 - 1:00 ENDING
                  </label>
                  <textarea 
                    className="w-full p-5 bg-[#0d1117] border border-slate-800 rounded-2xl text-white font-bold focus:border-blue-500 focus:ring-4 focus:ring-blue-900/10 focus:outline-none transition-all placeholder-slate-700 shadow-inner"
                    rows={2}
                    defaultValue={scriptData.script.ending_line}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Metadata Column */}
          <div className="space-y-10">
            {/* Titles */}
            <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="bg-[#0d1017] px-8 py-5 border-b border-slate-800">
                <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center">
                  <Type className="w-4 h-4 mr-3 text-blue-500" />
                  Title Options
                </h3>
              </div>
              <div className="p-6 space-y-3">
                {scriptData.metadata.titles.map((title, i) => (
                  <div key={i} className="p-4 bg-[#0d1117] rounded-2xl text-sm font-bold text-slate-300 hover:bg-blue-900/20 hover:text-blue-400 cursor-pointer border border-slate-800 hover:border-blue-800/40 transition-all">
                    {title}
                  </div>
                ))}
              </div>
            </div>

            {/* Thumbnail Text */}
            <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="bg-[#0d1017] px-8 py-5 border-b border-slate-800">
                <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center">
                  <ImageIcon className="w-4 h-4 mr-3 text-blue-500" />
                  Thumbnail Text
                </h3>
              </div>
              <div className="p-10 text-center bg-[#0d1117]">
                <div className="inline-block p-6 bg-blue-600 text-white font-black text-2xl uppercase tracking-tighter transform -rotate-3 rounded-lg shadow-2xl shadow-blue-900/40 border-2 border-white/10">
                  {scriptData.metadata.thumbnail_text}
                </div>
              </div>
            </div>

            {/* Hashtags */}
            <div className="bg-[#0a0c10] rounded-3xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="bg-[#0d1017] px-8 py-5 border-b border-slate-800">
                <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center">
                  <Hash className="w-4 h-4 mr-3 text-blue-500" />
                  Hashtags
                </h3>
              </div>
              <div className="p-6 flex flex-wrap gap-3">
                {scriptData.metadata.hashtags.map((tag, i) => (
                  <span key={i} className="px-4 py-2 bg-blue-900/20 text-blue-400 rounded-xl text-xs font-black border border-blue-800/30 hover:bg-blue-800 hover:text-white transition-colors cursor-default">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
