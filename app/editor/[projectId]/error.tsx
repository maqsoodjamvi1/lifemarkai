"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EditorError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error for monitoring
    console.error("Editor error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Editor Error</h1>
        <p className="text-slate-400">
          {error.message || "An unexpected error occurred while loading the editor."}
        </p>
        {error.digest && <p className="text-xs text-slate-600">Error ID: {error.digest}</p>}
        
        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={reset} className="w-full">
            Try Again
          </Button>
          <Link href="/dashboard" className="w-full">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
