/** Shared types for AI code review (kept out of the Next route so Vite can import them). */
export interface ReviewIssue {
  category: "quality" | "security" | "performance" | "bestpractice";
  severity: "error" | "warning" | "info";
  line?: number;
  title: string;
  description: string;
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
}
