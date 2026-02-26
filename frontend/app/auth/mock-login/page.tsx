"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Instagram, Facebook, Twitter } from "lucide-react";

function MockLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const platform = searchParams.get("platform") || "social";
  
  const handleLogin = () => {
    router.push(`/auth/${platform}/callback?code=mock_code_123`);
  };

  const getIcon = () => {
    switch(platform) {
      case 'instagram': return <Instagram className="h-12 w-12 text-pink-600" />;
      case 'facebook': return <Facebook className="h-12 w-12 text-blue-600" />;
      case 'x': return <Twitter className="h-12 w-12 text-sky-500" />;
      default: return null;
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {getIcon()}
          </div>
          <CardTitle>Login to {platform.charAt(0).toUpperCase() + platform.slice(1)}</CardTitle>
          <CardDescription>
            This is a mock login page for demonstration purposes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <div className="p-2 border rounded bg-muted/50 text-sm">meta_user</div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="p-2 border rounded bg-muted/50 text-sm">••••••••••••</div>
          </div>
          <Button className="w-full" onClick={handleLogin}>
            Login and Connect
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => router.push('/settings')}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MockLoginPage() {
  return (
    <Suspense fallback={
       <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="animate-spin text-primary mb-4" />
          <div className="text-lg font-medium">Loading...</div>
       </div>
    }>
      <MockLoginContent />
    </Suspense>
  )
}
