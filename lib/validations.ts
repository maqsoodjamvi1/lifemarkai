import { z } from "zod";

// Permissive on purpose: names are often auto-generated from prompts (can include
// unicode/punctuation), description IS the raw prompt (can be long), framework may
// be "nextjs", and templateId may be a built-in slug ("saas-dashboard"), not a UUID.
// So we validate what actually matters — a non-empty name and sane size caps — and
// never reject a legitimate create request.
export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  description: z.string().max(10000, "Description is too long").optional().nullable(),
  framework: z.string().max(30).optional(),
  templateId: z.string().max(200).optional().nullable(),
  isPublic: z.boolean().optional(),
});

export const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty").max(20000, "Message is too long"),
  // Lenient on purpose — real modes are chat/build/patch/plan/agent (and grow over
  // time). A hardcoded enum silently rejected valid modes like "patch" (Quick Edit);
  // the route logic is the real gatekeeper. Same reasoning applies to `model` below.
  mode: z.string().min(1).max(20).optional(),
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
