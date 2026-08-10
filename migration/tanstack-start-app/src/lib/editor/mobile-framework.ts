/**
 * Framework rules for the composer's Web / React Native (mobile) toggle.
 *
 * Extracted from chat-panel so the regression documented there stays pinned
 * by tests: projects_framework_check has never accepted "web", so the value
 * remembered for "toggle mobile back off" must be a real web framework —
 * "react" is the same fallback createProject uses.
 */

import type { Project } from "@/types/database";

type Framework = Project["framework"];

/** True when the project targets React Native / Expo. */
export function isRnFramework(f?: string | null): boolean {
  return f === "react-native" || f === "expo";
}

/**
 * The web framework to remember when hydrating the toggle, used to restore
 * the project when mobile mode is switched off. Never returns an RN value
 * and never invents "web".
 */
export function initialWebFramework(f: Framework | null | undefined): Framework {
  return isRnFramework(f) ? "tanstack-start" : (f ?? "tanstack-start");
}

/** The framework to persist when the toggle changes. */
export function frameworkForMobileMode(mobile: boolean, rememberedWeb: Framework): Framework {
  return mobile ? "react-native" : rememberedWeb;
}
