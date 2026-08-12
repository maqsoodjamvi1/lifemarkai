/**
 * Shared API payload types.
 *
 * In the Next.js app these were exported from the route handlers themselves
 * (app/api/activity/route.ts, app/api/search/route.ts). Under TanStack Start
 * the API routes will live at src/routes/api/*, but the shared payload shapes
 * belong here so both the client components and the (future) server routes can
 * import them without a client→server-route dependency.
 */

export interface ActivityEvent {
  id: string;
  type: "generation" | "deploy" | "commit" | "project_created";
  projectId: string;
  projectName: string;
  description: string;
  createdAt: string;
}

export interface SearchResult {
  type: "project" | "file" | "message";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  snippet: string;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  total: number;
}
