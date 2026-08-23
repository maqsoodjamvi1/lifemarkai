# Git push remaining (from your machine)

Remote `git push` from the agent sandbox has no GitHub credentials.
MCP successfully pushed initiative knowledge + prior gap files.

## Apply local commit (panel + console + package.json)

Patch file on agent host:
`/home/workdir/artifacts/0001-feat-wire-PlanApprove-PolyglotStatus-AstRisk-knowled.patch`

```bash
git clone -b feature/polyglot-editor-intelligence https://github.com/maqsoodjamvi1/lifemarkai.git
cd lifemarkai
git am /path/to/0001-feat-wire-PlanApprove-PolyglotStatus-AstRisk-knowled.patch
# OR manually:
# - Use PlanTree from intelligence/use-plan-tree (risk strip)
# - Copy panel wiring for PlanApproveCard + PolyglotStatus + OnboardingStepper
# - Restore package.json from master + verify scripts
git push origin feature/polyglot-editor-intelligence
```

## Already on remote

- initiative.ts: KNOWLEDGE.md -> agent knowledge
- plan-tree-with-risk.tsx, projects-create knowledge seed
- polyglot health readiness, docker-compose, etc.
