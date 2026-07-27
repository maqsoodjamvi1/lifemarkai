"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface EditorConnectivityErrorProps {
  detail?: string;
}

export function EditorConnectivityError({ detail }: EditorConnectivityErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Connection problem</h1>
        <p className="text-slate-400">
          The editor could not reach the database. This is usually temporary — check your
          internet connection and try again.
        </p>
        {detail && (
          <p className="text-xs text-slate-600 font-mono break-all">{detail.slice(0, 200)}</p>
        )}
        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={() => window.location.reload()} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
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
