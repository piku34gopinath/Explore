"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import SocialCallback from "@/components/social-callback";

function XCallbackContent() {
  return <SocialCallback platform="x" />;
}

export default function XCallbackPage() {
  return (
    <Suspense fallback={
       <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-10 w-10 animate-spin text-sky-500 mb-4" />
          <div className="text-lg font-medium">Loading...</div>
       </div>
    }>
      <XCallbackContent />
    </Suspense>
  )
}
