'use client';

import { useEffect, useState } from 'react';
import { getTrends } from '@/lib/api';
import { Loader2, ArrowRight, TrendingUp } from 'lucide-react';

interface Trend {
  event_title: string;
  summary: string;
  category: string;
  importance_score: number;
  urgency_score: number;
  trend_score: number;
  source_urls: string[];
}

export default function Dashboard() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const data = await getTrends();
        setTrends(data);
      } catch (error) {
        console.error('Failed to fetch trends:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Function to determine category color
  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'tech': return 'bg-blue-100 text-blue-800';
      case 'politics': return 'bg-red-100 text-red-800';
      case 'finance': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-10 text-center sm:text-left">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl mb-2">
            AI News Video Generator
          </h1>
          <p className="text-lg text-gray-600 font-medium">
            Top Trending Stories Today
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {trends.map((trend, index) => (
            <div 
              key={index} 
              className="group relative flex flex-col bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-6 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${getCategoryColor(trend.category)}`}>
                    {trend.category}
                  </span>
                  <div className="flex items-center space-x-1 text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-gray-700">Score: {trend.trend_score}</span>
                  </div>
                </div>
                
                <h2 className="text-xl font-bold text-gray-900 mb-3 leading-tight group-hover:text-blue-600 transition-colors">
                  {trend.event_title}
                </h2>
                
                <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                  {trend.summary}
                </p>
              </div>

              {/* Card Footer */}
              <div className="mt-auto p-6 pt-0">
                <a 
                  href={`/topic/${index}`} // Using index as mock ID for now
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors duration-200 group-hover:bg-blue-600 group-hover:text-white"
                >
                  View Details
                  <ArrowRight className="ml-2 w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
