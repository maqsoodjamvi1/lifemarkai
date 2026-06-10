// @ts-nocheck
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AIModel } from "@/lib/ai/provider";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";

interface AppState {
  // Theme
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Editor preferences
  preferredModel: AIModel;
  modelManuallySelected: boolean;
  setPreferredModel: (model: AIModel) => void;
  setModelManuallySelected: (manual: boolean) => void;

  editorFontSize: number;
  setEditorFontSize: (size: number) => void;

  editorTabSize: number;
  setEditorTabSize: (size: number) => void;

  // Recent prompts
  recentPrompts: string[];
  addRecentPrompt: (prompt: string) => void;
  clearRecentPrompts: () => void;

  // Notifications
  notifications: Array<{
    id: string;
    type: "info" | "success" | "warning" | "error";
    title: string;
    message?: string;
    read: boolean;
    createdAt: string;
  }>;
  addNotification: (n: Omit<AppState["notifications"][0], "id" | "read" | "createdAt">) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      preferredModel: "claude-opus-4-6",
      setPreferredModel: (model) => set({ preferredModel: model }),

      editorFontSize: 14,
      setEditorFontSize: (size) => set({ editorFontSize: size }),

      editorTabSize: 2,
      setEditorTabSize: (size) => set({ editorTabSize: size }),

      recentPrompts: [],
      addRecentPrompt: (prompt) =>
        set((s) => ({
          recentPrompts: [prompt, ...s.recentPrompts.filter((p) => p !== prompt)].slice(0, 20),
        })),
      clearRecentPrompts: () => set({ recentPrompts: [] }),

      notifications: [],
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: Math.random().toString(36).slice(2), read: false, createdAt: new Date().toISOString() },
            ...s.notifications,
          ].slice(0, 50),
        })),
      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      clearNotifications: () => set({ notifications: [] }),
    }),
    {
      name: "lifemarkai-app-store",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        preferredModel: state.preferredModel,
        editorFontSize: state.editorFontSize,
        editorTabSize: state.editorTabSize,
        recentPrompts: state.recentPrompts,
      }),
    }
  )
);
