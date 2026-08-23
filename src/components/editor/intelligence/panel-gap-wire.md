# Panel gap wire

To finish UI wiring on this branch, in `editor-intelligence-panel.tsx`:

```tsx
import { PlanTree } from "./intelligence/use-plan-tree"; // risk strip
import { PolyglotStatus, fetchPolyglotHealth, type PolyglotHealthState } from "./polyglot-status";
import { PlanApproveCard } from "./intelligence/plan-approve-card";
import { OnboardingStepper } from "./intelligence/onboarding-stepper";
import { computeOnboardingSteps } from "@/lib/editor/onboarding-flow";
```

Team tab: wrap `<TeamGrid>` with `<PolyglotStatus />`.
Plan tab: show `<PlanApproveCard>` when epics exist and not building.

Full wired panel source is in local commit; apply via patch:
`artifacts/0001-feat-wire-PlanApprove-PolyglotStatus-AstRisk-knowled.patch`
