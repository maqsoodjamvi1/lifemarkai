import { z } from "zod";

export const projectSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(60, "Name must be under 60 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Name can only contain letters, numbers, spaces, hyphens, and underscores"),
  description: z.string().max(300, "Description must be under 300 characters").optional(),
  framework: z.enum(["react", "next", "vue", "svelte"]),
  templateId: z.string().uuid().optional(),
  isPublic: z.boolean().optional(),
});

export const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(10000, "Message is too long"),
  mode: z.enum(["chat", "agent", "plan", "build"]),
  // Any model id (incl. OpenRouter slugs like "openai/gpt-4o"). A hardcoded
  // enum here silently rejected new models; the provider layer is the real
  // gatekeeper and falls back gracefully for unknown ids.
  model: z.string().min(1).max(100).optional(),
});

export const profileSchema = z.object({
  full_name: z.string().min(2, "Name is too short").max(80, "Name is too long").optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be under 30 characters")
    .regex(/^[a-zA-Z0-9_\-]+$/, "Username can only contain letters, numbers, underscores, and hyphens")
    .optional(),
  bio: z.string().max(160, "Bio must be under 160 characters").optional(),
});

export const inviteSchema = z.object({
  projectId: z.string().uuid(),
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "editor", "admin"]).optional(),
});

export const deploySchema = z.object({
  projectId: z.string().uuid(),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
