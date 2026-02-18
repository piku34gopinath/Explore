"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import axios from "axios";

export default function SocialCallback({ platform }: { platform: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  axios.defaults.withCredentials = true;

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description") || searchParams.get("error_reason");
    
    if (errorParam) {
      setError(errorDesc || errorParam || "Authorization failed");
      return;
    }
    
    if (!code) {
      setError(`No authorization code found for ${platform}.`);
      return;
    }

    const exchangeCode = async () => {
      try {
        const res = await axios.post(`${API_URL}/auth/${platform}/callback?code=${code}`);
        
        if (res.status === 200) {
          router.push("/settings");
        } else {
          setError(res.data.detail || "Authentication failed");
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || "Network error occurred");
      }
    };

    exchangeCode();
  }, [searchParams, router, platform]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center max-w-2xl mx-auto">
        <div className="text-red-500 font-bold mb-4 text-xl">Connection Failed</div>
        <div className="text-muted-foreground mb-8 text-sm bg-zinc-900/50 p-4 rounded-md border border-zinc-800 break-words">
          {error}
        </div>
        <button 
          onClick={() => router.push("/settings")}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md font-medium transition-colors"
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
      <div className="text-lg font-medium">Connecting {platform}...</div>
      <div className="text-sm text-muted-foreground">Finalizing your {platform} account connection</div>
    </div>
  );
}
