import { createFileRoute } from "@tanstack/react-router";
import {
createSkill,
deleteSkill,
listSkills,
patchSkill,
} from "@/lib/server-fns/skills";

/** Native /api/skills */
export const Route = createFileRoute("/api/skills")({
  server: {
    handlers: {
      GET: async () => {
        const result = await listSkills();
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({
          custom: result.custom,
          builtin: result.builtin,
        });
      },
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const name = typeof body.name === "string" ? body.name : "";
        const prompt = typeof body.prompt === "string" ? body.prompt : "";
        if (!name.trim() || !prompt.trim()) {
          return Response.json(
            { error: "name and prompt are required" },
            { status: 400 },
          );
        }
        const result = await createSkill({
            name,
            description:
              typeof body.description === "string" ? body.description : null,
            prompt,
            icon: typeof body.icon === "string" ? body.icon : undefined,
            tags: Array.isArray(body.tags)
              ? body.tags.filter((t): t is string => typeof t === "string")
              : undefined,
          });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.skill, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return Response.json({ error: "id required" }, { status: 400 });
        }
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await patchSkill({
            id,
            name: typeof body.name === "string" ? body.name : undefined,
            description:
              typeof body.description === "string"
                ? body.description
                : body.description === null
                  ? null
                  : undefined,
            prompt: typeof body.prompt === "string" ? body.prompt : undefined,
            icon: typeof body.icon === "string" ? body.icon : undefined,
            tags: Array.isArray(body.tags)
              ? body.tags.filter((t): t is string => typeof t === "string")
              : undefined,
            incrementUse: body.incrementUse === true,
          });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        if (result.kind === "increment") {
          return Response.json({ ok: true });
        }
        return Response.json(result.skill);
      },
      DELETE: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) {
          return Response.json({ error: "id required" }, { status: 400 });
        }
        const result = await deleteSkill({ id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
