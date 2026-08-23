/**
 * Editor Intelligence Console views - public entry.
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
  PlanTreeBase,
} from "./intelligence/console-core";

export type {
  RoleLiveState,
  FeedItem,
  GateInfo,
  ConsoleState,
} from "./intelligence/console-core";

/** Default plan view includes AST risk strip. */
export { PlanTreeWithRisk as PlanTree } from "./intelligence/plan-tree-with-risk";
