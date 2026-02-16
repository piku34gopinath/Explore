"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    
    if (!code) {
      setError("No authorization code found.");
      return;
    }

    const exchangeCode = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/callback?code=${code}`, {
          method: "POST",
          credentials: "include",
        });
        
        const data = await res.json();
        
        if (res.ok) {
          // Successful login
          router.push("/");
        } else {
          setError(data.detail || "Authentication failed");
        }
      } catch (err) {
        setError("Network error occurred");
      }
    };

    exchangeCode();
  }, [searchParams, router]);

  if (error) {
    const enableApiUrl = error.match(/https:\/\/console\.developers\.google\.com\/[^" ]+/)?.[0] || 
                        error.match(/https:\/\/console\.cloud\.google\.com\/[^" ]+/)?.[0];

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center max-w-2xl mx-auto">
        <div className="text-red-500 font-bold mb-4 text-xl">Login Failed</div>
        <div className="text-muted-foreground mb-8 text-sm bg-zinc-900/50 p-4 rounded-md border border-zinc-800 break-words">
          {error}
        </div>
        
        <div className="flex flex-col gap-4 w-full max-w-xs">
          {enableApiUrl && (
            <a 
              href={enableApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-md font-medium transition-colors"
            >
              Enable YouTube API
            </a>
          )}
          
          <button 
            onClick={() => router.push("/login")}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md font-medium transition-colors"
          >
            Back to Login
          </button>
        </div>

        {enableApiUrl && (
          <p className="mt-6 text-xs text-muted-foreground">
            After enabling the API, please wait 1-2 minutes then click "Back to Login" and try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Loader2 className="h-10 w-10 animate-spin text-violet-500 mb-4" />
      <div className="text-lg font-medium">Finishing setup...</div>
      <div className="text-sm text-muted-foreground">Connecting your Google & YouTube account</div>
    </div>
  );
}
