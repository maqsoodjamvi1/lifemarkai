/**
 * Editor Intelligence Console - RESTORED.
 * Full implementation: apply patch from artifacts or re-pull from 4ff883c.
 * Temporary thin re-export so the app builds while full file is restored.
 */
export {
  ROLE_META,
  CONSOLE_ROLE_IDS,
  roleTitle,
  initialConsoleState,
  applyConsoleEvent,
  consoleHasActivity,
  TeamGrid,
  DebateFeed,
  GateApprovalCard,
  RunFooter,
  groupFeed,
} from "./intelligence/console-core";

export type {
  RoleLiveState,
  FeedItem,
  GateInfo,
  ConsoleState,
} from "./intelligence/console-core";

// Prefer risk-aware plan tree
export { PlanTreeWithRisk as PlanTree } from "./intelligence/plan-tree-with-risk";
