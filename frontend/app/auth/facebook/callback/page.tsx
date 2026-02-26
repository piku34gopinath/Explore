"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import SocialCallback from "@/components/social-callback";

function FacebookCallbackContent() {
  return <SocialCallback platform="facebook" />;
}

export default function FacebookCallbackPage() {
  return (
    <Suspense fallback={
       <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mb-4" />
          <div className="text-lg font-medium">Loading...</div>
       </div>
    }>
      <FacebookCallbackContent />
    </Suspense>
  )
}
