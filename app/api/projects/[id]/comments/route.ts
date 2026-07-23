import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ProfileAuthor = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type CommentRow = {
  id: string;
  project_id: string;
  user_id: string | null;
  parent_id: string | null;
  content: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  element_xpath?: string | null;
  element_tag?: string | null;
  page_path?: string | null;
  element_preview?: string | null;
  is_guest?: boolean;
  guest_name?: string | null;
};

/** Attach profiles by user_id — FK is to auth.users, so PostgREST can't embed profiles. */
async function withAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: CommentRow[],
): Promise<Array<CommentRow & { author: ProfileAuthor | null }>> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, author: null }));
  }
  const { data: profiles } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, avatar_url, email")
    .in("id", ids);
  const byId = new Map<string, ProfileAuthor>(
    ((profiles ?? []) as ProfileAuthor[]).map((p) => [p.id, p]),
  );
  return rows.map((r) => ({
    ...r,
    author: r.user_id ? byId.get(r.user_id) ?? null : null,
  }));
}

const BASE_COLUMNS = `
  id,
  project_id,
  user_id,
  parent_id,
  content,
  resolved,
  resolved_by,
  resolved_at,
  created_at,
  updated_at
`;

const ELEMENT_COLUMNS = `
  element_xpath,
  element_tag,
  page_path,
  element_preview,
  is_guest,
  guest_name
`;

function missingOptionalColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /element_xpath|element_tag|page_path|element_preview|is_guest|guest_name/i.test(message) &&
    /does not exist|schema cache/i.test(message)
  );
}

async function selectComments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const full = await (supabase as any)
    .from("project_comments")
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!full.error) return { data: (full.data ?? []) as CommentRow[], error: null };

  if (!missingOptionalColumn(full.error.message)) {
    return { data: [] as CommentRow[], error: full.error };
  }

  // Migrations 058/079 not applied yet — degrade without pin/guest fields.
  const basic = await (supabase as any)
    .from("project_comments")
    .select(BASE_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (basic.error) return { data: [] as CommentRow[], error: basic.error };

  const rows = ((basic.data ?? []) as CommentRow[]).map((r) => ({
    ...r,
    element_xpath: null,
    element_tag: null,
    page_path: null,
    element_preview: null,
    is_guest: false,
    guest_name: null,
  }));
  return { data: rows, error: null };
}

// GET /api/projects/[id]/comments — list all top-level comments + replies
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await selectComments(supabase, id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withAuthor = await withAuthors(supabase, data);
  return NextResponse.json(withAuthor);
}

// POST /api/projects/[id]/comments — create a comment or reply
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { content, parent_id, element_xpath, element_tag, page_path, element_preview } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: "Comment too long (max 4000 chars)" }, { status: 400 });
  }

  const baseInsert = {
    project_id: id,
    user_id: user.id,
    content: content.trim(),
    parent_id: parent_id ?? null,
  };

  const withElement = {
    ...baseInsert,
    element_xpath: element_xpath ?? null,
    element_tag: element_tag ?? null,
    page_path: page_path ?? null,
    element_preview: element_preview ? String(element_preview).slice(0, 120) : null,
  };

  let result = await (supabase as any)
    .from("project_comments")
    .insert(withElement)
    .select(`${BASE_COLUMNS},${ELEMENT_COLUMNS}`)
    .single();

  if (result.error && missingOptionalColumn(result.error.message)) {
    result = await (supabase as any)
      .from("project_comments")
      .insert(baseInsert)
      .select(BASE_COLUMNS)
      .single();
    if (!result.error && result.data) {
      result.data = {
        ...result.data,
        element_xpath: null,
        element_tag: null,
        page_path: null,
        element_preview: null,
        is_guest: false,
        guest_name: null,
      };
    }
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const [withAuthor] = await withAuthors(supabase, [result.data as CommentRow]);
  return NextResponse.json(withAuthor, { status: 201 });
}
