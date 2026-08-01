import { createFileRoute } from "@tanstack/react-router";
import {
  listGroupsOrMembers,
  createGroup,
  updateGroup,
  setGroupMembership,
  deleteGroup,
} from "@/lib/server-fns/member-groups";

const unauth = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/** Native /api/member-groups — GET(list|members), POST(create), PATCH(update), PUT(membership), DELETE. */
export const Route = createFileRoute("/api/member-groups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const groupId = new URL(request.url).searchParams.get("groupId") ?? undefined;
        const r = await listGroupsOrMembers({ groupId });
        if (r.status === "unauthorized") return unauth();
        if (r.status === "members") return Response.json({ members: r.members });
        return Response.json({ groups: r.groups });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as any;
        const r = await createGroup(body);
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json(r.group, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as any;
        const r = await updateGroup(body);
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ ok: true });
      },
      PUT: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as any;
        const r = await setGroupMembership(body);
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Group not found" }, { status: 404 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const groupId = new URL(request.url).searchParams.get("groupId") ?? "";
        const r = await deleteGroup({ groupId });
        if (r.status === "unauthorized") return unauth();
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
