# Remaining gap wire (local commit 827683c)

## Applied on branch this session

- `projects-*.ts` split + `KNOWLEDGE.md` seed on create
- `plan-tree-with-risk.tsx` - risk summary under plan
- `package.json` scripts include verify:polyglot / verify:gap-closure (ensure deps restored from master if tip is thin)

## Local (push from Codespace if MCP size-limited)

Commit on clone `/tmp/lifemark-rem`:

```
feat: close remaining gaps - AstRisk on plan, PlanApprove UI, knowledge in agent, restore package.json
```

Files:

1. `src/components/editor/editor-intelligence-console.tsx` - AstRiskBadge per task
2. `src/components/editor/editor-intelligence-panel.tsx` - PolyglotStatus, PlanApproveCard, OnboardingStepper
3. `src/routes/api/editor-intelligence/initiative.ts` - KNOWLEDGE.md -> agent knowledge
4. Full `package.json` (92 deps)

```bash
cd lifemarkai
git fetch origin feature/polyglot-editor-intelligence
git checkout feature/polyglot-editor-intelligence
# copy from Codespace /tmp/lifemark-rem the 4 files above
git add -A && git commit -m "feat: wire plan approve, polyglot status, knowledge agent, package.json"
git push origin feature/polyglot-editor-intelligence
```

Or cherry-pick `827683c` if that clone is available.
