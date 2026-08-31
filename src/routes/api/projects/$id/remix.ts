import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseWired } from "@/lib/projects/detect-supabase-wiring";

/** Native /api/projects/:id/remix — fork a public, remix-enabled project. */
const MESSAGE_COPY_LIMIT = 500;

export const Route = createFileRoute("/api/projects/$id/remix")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { dryRun?: boolean; disconnectSupabase?: boolean; carryOverChatHistory?: boolean } = {};
        try { body = await request.json(); } catch { /* empty body ok */ }

        const { data: source, error: srcErr } = await supabase
          .from("projects")
          .select("*, project_files(*)")
          .eq("id", id)
          .eq("is_public", true)
          .eq("remix_enabled", true)
          .single();

        if (srcErr || !source) {
          return Response.json({ error: "Project not found or remixing disabled" }, { status: 404 });
        }

        const sourceFiles = (source.project_files ?? []) as Array<{ path: string; content: string; language: string }>;
        const supabaseCheck = hasSupabaseWired(sourceFiles);

        if (body.dryRun) {
          // Count-only — the dry run is what the confirmation dialog shows
          // before committing to a remix, so it shouldn't pull every
          // message's content over the wire just to report how many there are.
          const { count: messageCount } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("project_id", id);

          return Response.json({
            ok: true,
            dryRun: true,
            hasSupabase: supabaseCheck.hasSupabase,
            supabaseEvidence: supabaseCheck.evidence,
            sourceName: source.name,
            fileCount: sourceFiles.length,
            // Capped to what carryOverChatHistory will actually copy (see
            // MESSAGE_COPY_LIMIT below) — showing the untruncated count here
            // would promise the confirm dialog more than the remix delivers.
            messageCount: Math.min(messageCount ?? 0, MESSAGE_COPY_LIMIT),
            messageCountTruncated: (messageCount ?? 0) > MESSAGE_COPY_LIMIT,
          });
        }

        const { data: newProject, error: createErr } = await supabase
          .from("projects")
          .insert({
            user_id: user.id,
            name: `${source.name} (Remix)`,
            description: source.description,
            framework: source.framework,
            status: "active",
            is_public: false,
            remix_of: source.id,
            remix_enabled: false,
            remix_count: 0,
            badge_hidden: false,
            knowledge: source.knowledge,
          })
          .select()
          .single();

        if (createErr || !newProject) {
          return Response.json({ error: createErr?.message ?? "Failed to create project" }, { status: 500 });
        }

        let files = sourceFiles;

        if (body.disconnectSupabase && supabaseCheck.hasSupabase) {
          files = files
            .filter((f) => !/supabase\/(migrations|functions)\//.test(f.path.toLowerCase()))
            .map((f) => ({
              ...f,
              content: (f.content ?? "")
                .replace(/^.*@supabase\/(supabase-js|ssr|auth-helpers).*$/gm,
                  "// TODO: re-wire data layer (Supabase imports removed during remix)")
                .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_URL/g, '/* TODO: SUPABASE_URL */""')
                .replace(/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/g, '/* TODO: SUPABASE_ANON_KEY */""'),
            }));
        }

        if (files.length > 0) {
          const { error: filesErr } = await supabase.from("project_files").insert(
            files.map((f) => ({
              project_id: newProject.id,
              path: f.path,
              content: f.content,
              language: f.language,
            })),
          );
          if (filesErr) console.error("Failed to copy files:", filesErr.message);
        }

        let carriedOverMessages = 0;
        if (body.carryOverChatHistory) {
          // Capped rather than unbounded: this is a one-time copy triggered
          // by a user click, not a paginated read, and a remix is meant to
          // hand the remixer useful context to keep building from — not
          // necessarily the source project's entire history verbatim.
          const { data: sourceMessages, error: msgErr } = await supabase
            .from("messages")
            .select("role, content, tokens_used, model, mode, metadata, created_at")
            .eq("project_id", id)
            .order("created_at", { ascending: true })
            .limit(MESSAGE_COPY_LIMIT);

          if (msgErr) {
            console.error("Failed to read chat history for remix:", msgErr.message);
          } else if (sourceMessages && sourceMessages.length > 0) {
            const { error: copyErr } = await supabase.from("messages").insert(
              sourceMessages.map((m) => ({
                project_id: newProject.id,
                role: m.role,
                content: m.content,
                tokens_used: m.tokens_used,
                model: m.model,
                mode: m.mode,
                metadata: m.metadata,
                created_at: m.created_at,
                // A thumbs up/down is the ORIGINAL author's reaction to that
                // reply — copying it onto the remixer's conversation would
                // misrepresent it as their own feedback.
                rating: null,
              })),
            );
            if (copyErr) console.error("Failed to copy chat history for remix:", copyErr.message);
            else carriedOverMessages = sourceMessages.length;
          }
        }

        supabase.rpc("increment_remix_count", { project_id: source.id }).then(({ error }) => {
          if (error) console.error("Failed to increment remix_count:", error.message);
        });

        return Response.json({
          id: newProject.id,
          disconnectedSupabase: !!body.disconnectSupabase && supabaseCheck.hasSupabase,
          carriedOverMessages,
        });
      },
    },
  },
});
