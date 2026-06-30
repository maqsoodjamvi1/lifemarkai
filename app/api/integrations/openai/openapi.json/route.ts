/**
 * OpenAPI 3.1 spec for the LifemarkAI ChatGPT Action.
 *
 * Paste the JSON returned by this endpoint into a Custom GPT's "Actions"
 * configuration screen — ChatGPT will auto-generate the tool-use surface
 * (one operation: createProject) and prompt the user for an API key when
 * the GPT first invokes it.
 *
 * Served as a Next.js route handler (not a static file) so the host URL
 * stays correct in environments where NEXT_PUBLIC_APP_URL changes —
 * production, preview, local dev.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";

  // Spec follows the OpenAPI 3.1 schema ChatGPT Custom GPTs expect.
  // Key choices:
  //   • Single operationId (createProject) — keeps the GPT focused.
  //   • Auth is `apiKey` in the X-LifemarkAI-Key header — simpler than
  //     full OAuth2 + PKCE for the first integration. We can add OAuth later.
  //   • All fields documented inline so the GPT generates good calls.
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "LifemarkAI Build API",
      version: "1.0.0",
      description:
        "Trigger LifemarkAI builds from ChatGPT. Each call creates a new project with the user's prompt and returns an editor URL where the AI is already building the app.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/integrations/openai/build": {
        post: {
          operationId: "createProject",
          summary: "Create a new LifemarkAI project from a prompt",
          description:
            "Creates a project, queues the prompt as a starter message, and returns the editor URL so the user can watch the build in real time.",
          security: [{ apiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: {
                      type: "string",
                      minLength: 5,
                      maxLength: 4000,
                      description:
                        "What the user wants built. Examples: 'A habit tracker with daily streaks and a graph', 'A landing page for a dog-walking service with a Stripe checkout'.",
                    },
                    framework: {
                      type: "string",
                      enum: ["react", "next", "vue", "svelte", "vanilla"],
                      default: "react",
                      description: "Frontend framework. Default is React.",
                    },
                    name: {
                      type: "string",
                      maxLength: 80,
                      description:
                        "Project name. If omitted, the API derives one from the prompt.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Project created.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["projectId", "editorUrl", "name", "next"],
                    properties: {
                      projectId: { type: "string", description: "UUID of the new project." },
                      editorUrl: {
                        type: "string",
                        format: "uri",
                        description: "Direct URL to the editor for this project.",
                      },
                      name: { type: "string" },
                      next: {
                        type: "string",
                        description:
                          "Human-readable next-step instruction the GPT should relay to the user.",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request body.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { error: { type: "string" } } },
                },
              },
            },
            "401": {
              description: "Missing or invalid API key.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { error: { type: "string" } } },
                },
              },
            },
            "403": {
              description: "API key is missing the `projects:create` scope.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { error: { type: "string" } } },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded.",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { error: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-LifemarkAI-Key",
          description:
            "API key provisioned at /dashboard/settings → API keys. Must include the `projects:create` scope.",
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      ...CORS,
      "Cache-Control": "public, max-age=300",
    },
  });
}
