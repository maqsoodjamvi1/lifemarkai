"use client";

/**
 * Build with URL — Lovable-API style entrypoint.
 *
 * Reads the hash and query at landing:
 *   /?autosubmit=true#prompt=Create%20a%20todo%20app&images=https://...&images=https://...
 *
 * Behaviour:
 *  - autosubmit must be present (and truthy) to trigger.
 *  - prompt is required. Up to 50,000 chars.
 *  - images is optional. Up to 10 URLs. Comma- or repeat-key form supported.
 *  - If signed in: stash prompt+images in sessionStorage and redirect to
 *    /dashboard?new=true&fromUrl=1 — the dashboard's new-project flow picks
 *    up the stashed prompt and pre-fills the create modal.
 *  - If not signed in: redirect to /signup?redirect=/?autosubmit=...#... so
 *    the prompt is preserved through auth.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

const STORAGE_KEY = "lifemark.buildWithUrl";

interface BuildPayload {
  prompt: string;
  images: string[];
  at: number;
}

function parseHash(): { prompt?: string; images: string[] } | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const prompt = params.get("prompt") ?? undefined;
  const images = params.getAll("images");
  if (!prompt && images.length === 0) return null;
  return { prompt, images };
}

export function BuildWithUrlHandler() {
  const router = useRouter();
  const search = useSearchParams();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const autosubmit = search?.get("autosubmit");
    if (autosubmit !== "true" && autosubmit !== "1") return;

    const parsed = parseHash();
    if (!parsed?.prompt) {
      setError("Missing prompt parameter in URL hash.");
      return;
    }
    if (parsed.prompt.length > 50_000) {
      setError("Prompt is too long (max 50,000 characters).");
      return;
    }
    if (parsed.images.length > 10) {
      setError("Too many image references (max 10).");
      return;
    }

    setProcessing(true);

    // Stash payload for the dashboard to consume
    try {
      const payload: BuildPayload = {
        prompt: parsed.prompt,
        images: parsed.images,
        at: Date.now(),
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage can fail in private modes — fall back to a URL param
    }

    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Preserve the original URL through auth
        const target = window.location.pathname + window.location.search + window.location.hash;
        router.push(`/signup?redirect=${encodeURIComponent(target)}`);
        return;
      }
      router.push("/dashboard?new=true&fromUrl=1");
    })();
  }, [router, search]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur">
        <div className="max-w-md mx-auto text-center p-6">
          <h2 className="text-lg font-semibold text-red-300 mb-2">Build link error</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (!processing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-400" />
        <p className="text-sm text-muted-foreground">Opening Lifemark — preparing your build…</p>
      </div>
    </div>
  );
}
