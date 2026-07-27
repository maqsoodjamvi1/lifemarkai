/**
 * Shared Zod search schemas for high-traffic routes.
 */
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

export const loginSearchSchema = z
  .object({
    next: z.string().optional(),
    redirect: z.string().optional(),
    error: z.string().optional(),
    auth_callback_failed: z.union([z.string(), z.boolean()]).optional(),
  })
  .catch({});

export const loginSearchValidator = zodValidator(loginSearchSchema);
export type LoginSearch = z.infer<typeof loginSearchSchema>;

export const exploreSearchSchema = z
  .object({
    q: z.string().catch(""),
    framework: z.string().catch(""),
    sort: z.enum(["recent", "popular"]).catch("recent"),
  })
  .catch({ q: "", framework: "", sort: "recent" as const });

export const exploreSearchValidator = zodValidator(exploreSearchSchema);
export type ExploreSearch = z.infer<typeof exploreSearchSchema>;

export const templatesSearchSchema = z
  .object({
    category: z.string().catch("All"),
  })
  .catch({ category: "All" });

export const templatesSearchValidator = zodValidator(templatesSearchSchema);

export const dashboardSearchSchema = z
  .object({
    new: z.union([z.literal("true"), z.literal("1"), z.string()]).optional(),
    fromUrl: z.union([z.literal("true"), z.literal("1"), z.string()]).optional(),
    prompt: z.string().optional(),
  })
  .catch({});

export const dashboardSearchValidator = zodValidator(dashboardSearchSchema);
