import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";

/** Native /api/scrape — fetch a URL, return cleaned text + meta for "Chat with URL". */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|iframe|svg|canvas|video|audio)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string): { title: string; description: string; ogImage: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const ogImageMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  return {
    title: titleMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
    ogImage: ogImageMatch?.[1]?.trim() ?? "",
  };
}

export const Route = createFileRoute("/api/scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const rl = await rateLimitAsync(user.id, { ...RATE_LIMITS.ai, limit: 20 });
          if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

          const { url } = (await request.json()) as { url?: string };
          if (!url || typeof url !== "string") return Response.json({ error: "url is required" }, { status: 400 });

          let parsedUrl: URL;
          try {
            parsedUrl = new URL(url);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
              return Response.json({ error: "Only http/https URLs are supported" }, { status: 400 });
            }
          } catch {
            return Response.json({ error: "Invalid URL" }, { status: 400 });
          }

          const host = parsedUrl.hostname;
          if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host.startsWith("10.") ||
            host.startsWith("192.168.") ||
            host.startsWith("172.") ||
            host.endsWith(".local")
          ) {
            return Response.json({ error: "Private URLs are not allowed" }, { status: 400 });
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          let html: string;
          try {
            const res = await fetch(url, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; LifemarkAI/1.0; +https://lifemarkai.com)",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
              },
            });
            clearTimeout(timeout);
            if (!res.ok) return Response.json({ error: `Fetch failed: ${res.status} ${res.statusText}` }, { status: 502 });
            html = await res.text();
          } catch (err) {
            clearTimeout(timeout);
            if (err instanceof Error && err.name === "AbortError") {
              return Response.json({ error: "Request timed out" }, { status: 504 });
            }
            return Response.json({ error: "Failed to fetch URL" }, { status: 502 });
          }

          const meta = extractMeta(html);
          const text = htmlToText(html).slice(0, 8000);

          return Response.json({
            url,
            title: meta.title,
            description: meta.description,
            ogImage: meta.ogImage,
            textContent: text,
            truncated: htmlToText(html).length > 8000,
          });
        } catch (err) {
          console.error("[scrape]", err);
          return Response.json({ error: "Internal error" }, { status: 500 });
        }
      },
    },
  },
});
