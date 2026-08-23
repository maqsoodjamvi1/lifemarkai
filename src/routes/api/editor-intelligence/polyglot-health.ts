/**
 * GET /api/editor-intelligence/polyglot-health
 * Liveness + readiness telemetry for Rust AST + Python AI.
 */
import { createFileRoute } from "@tanstack/react-router";
import { polyglotHealth } from "@/lib/intelligence/polyglot-bridge";

async function handleGET() {
  try {
    const health = await polyglotHealth();
    const mode = health.rust || health.python ? "polyglot" : "llm-only";
    return Response.json({
      rust: health.rust,
      python: health.python,
      rustLive: health.rustLive ?? health.rust,
      rustReady: health.rustReady ?? false,
      rustSymbols: health.rustSymbols ?? 0,
      rustEdges: health.rustEdges ?? 0,
      rustUrl: process.env.LIFEMARK_RUST_AST_URL ?? null,
      pythonUrl: process.env.LIFEMARK_PYTHON_AI_URL ?? null,
      mode,
    });
  } catch {
    return Response.json({
      rust: false,
      python: false,
      rustLive: false,
      rustReady: false,
      rustSymbols: 0,
      rustEdges: 0,
      rustUrl: process.env.LIFEMARK_RUST_AST_URL ?? null,
      pythonUrl: process.env.LIFEMARK_PYTHON_AI_URL ?? null,
      mode: "llm-only",
    });
  }
}

export const Route = createFileRoute("/api/editor-intelligence/polyglot-health")({
  server: {
    handlers: {
      GET: handleGET,
    },
  },
});
