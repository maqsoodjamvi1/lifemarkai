# Gap closure - one flow (vs Lovable)

## Shipped this pass

| Gap | Deliverable |
|-----|-------------|
| Liveness vs readiness | `polyglotHealth` returns `rustLive`, `rustReady`, `rustSymbols`, `rustEdges`; UI shows live/ready + symbol count |
| AST risk visible | `AstRiskBadge` |
| Plan-before-build | `PlanApproveCard` |
| Prompt queue | `src/lib/editor/prompt-queue.ts` |
| Project knowledge | `KNOWLEDGE.md` helpers |
| Onboarding path | `computeOnboardingSteps` + `OnboardingStepper` |
| Side services | `docker-compose.polyglot.yml` |
| Verify | `npm run verify:gap-closure` / `verify:polyglot` |

## Already in repo

- Preview toolbar: `lovable/preview-interaction-toolbar.tsx`
- Publish security: `lib/security/publish-gate.ts`
- Self-verify: initiative `onVerify`
- Multi-lens orchestrator

## Still product work

- Always-on Modal without env friction
- Wire PlanApprove + queue into chat composer as default
- Seed KNOWLEDGE.md on new projects
- Full connector depth

## Codespace

```bash
docker compose -f docker-compose.polyglot.yml up --build -d
export LIFEMARK_RUST_AST_URL=http://127.0.0.1:8765
export LIFEMARK_PYTHON_AI_URL=http://127.0.0.1:8766
npm run verify:gap-closure
```
