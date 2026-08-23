/**
 * GET /api/editor-intelligence/polyglot-health
 *
 * Reports whether the optional Rust AST + Python AI side services are reachable.
 * Used by the Editor Intelligence Console status strip. Never throws to the client.
 */
import { createFileRoute } from "@tanstack/react-router";
import { polyglotHealth } from "@/lib/intelligence/polyglot-bridge";

async function handleGET() {
  try {
    const health = await polyglotHealth();
    return Response.json({
      rust: health.rust,
      python: health.python,
      rustUrl: process.env.LIFEMARK_RUST_AST_URL ?? null,
      pythonUrl: process.env.LIFEMARK_PYTHON_AI_URL ?? null,
      mode: health.rust || health.python ? "polyglot" : "llm-only",
    });
  } catch {
    return Response.json({
      rust: false,
      python: false,
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
