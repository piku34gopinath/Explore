"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InstagramCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Connecting your Instagram account...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError("Instagram authentication failed or was cancelled.");
      setTimeout(() => router.push("/settings"), 3000);
      return;
    }

    if (code) {
      exchangeCode(code);
    } else {
      router.push("/settings");
    }
  }, [searchParams]);

  const exchangeCode = async (code: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await axios.post(`${API_URL}/auth/instagram/callback?code=${code}`, {}, { withCredentials: true });
      setStatus("Successfully connected! Redirecting...");
      setTimeout(() => router.push("/settings"), 1500);
    } catch (err: any) {
      console.error("Instagram callback error:", err);
      setError("Failed to connect Instagram. " + (err.response?.data?.detail || err.message));
      setTimeout(() => router.push("/settings"), 4000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Instagram Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center space-y-4 py-8">
          {error ? (
            <div className="text-destructive text-center font-medium">
              <p>{error}</p>
              <p className="text-sm text-muted-foreground mt-2">Redirecting to settings...</p>
            </div>
          ) : (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">{status}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
