"use client";

import { useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { isChunkLoadError, reloadOnceOnChunkError } from "@/lib/import-with-retry";
import { clearLifemarkServiceWorker } from "@/lib/sw-cleanup";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EditorError({ error, reset }: ErrorProps) {
  const chunkStale = isChunkLoadError(error);
  const swControlled =
    typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

  useLayoutEffect(() => {
    if (chunkStale) {
      clearLifemarkServiceWorker();
      reloadOnceOnChunkError();
    }
  }, [chunkStale]);

  useEffect(() => {
    console.error("Editor error:", error);
  }, [error]);

  function hardReload() {
    sessionStorage.removeItem("lifemark-chunk-reload");
    clearLifemarkServiceWorker();
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Editor Error</h1>
        <p className="text-slate-400">
          {chunkStale
            ? "The editor loaded an outdated script bundle (usually after a server restart or rebuild). Reload the page to fetch the latest version."
            : error.message || "An unexpected error occurred while loading the editor."}
        </p>
        {error.digest && <p className="text-xs text-slate-600">Error ID: {error.digest}</p>}
        {swControlled && chunkStale && (
          <p className="text-xs text-amber-500/80">
            A service worker may be serving stale scripts. Try a hard refresh (Ctrl+Shift+R) or clear site data.
          </p>
        )}
        
        <div className="flex flex-col gap-2 pt-4">
          {chunkStale ? (
            <Button onClick={hardReload} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" />
              Reload page
            </Button>
          ) : (
            <Button onClick={reset} className="w-full">
              Try Again
            </Button>
          )}
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
