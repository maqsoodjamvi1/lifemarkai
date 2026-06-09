/**
 * Verify zero-credits preview state machine (no browser required).
 */
function previewState(
  outOfCredits: boolean,
  deployedUrl: string | undefined,
  previewCompileOk: boolean,
  previewCompileFailed: boolean,
) {
  const showDeployedPreview =
    outOfCredits && !!deployedUrl && previewCompileFailed && !previewCompileOk;
  const iframeVisible = !outOfCredits || previewCompileOk;
  const showPausedOverlay = outOfCredits && !previewCompileOk && !showDeployedPreview;
  return { showDeployedPreview, iframeVisible, showPausedOverlay };
}

const cases = [
  {
    name: "initial-0-credits-with-deploy",
    args: [true, "https://x.app", false, false] as const,
    expect: { showPausedOverlay: true, showDeployedPreview: false, iframeVisible: false },
  },
  {
    name: "compile-ok-0-credits",
    args: [true, "https://x.app", true, false] as const,
    expect: { showPausedOverlay: false, showDeployedPreview: false, iframeVisible: true },
  },
  {
    name: "compile-fail-fallback-deploy",
    args: [true, "https://x.app", false, true] as const,
    expect: { showPausedOverlay: false, showDeployedPreview: true, iframeVisible: false },
  },
  {
    name: "has-credits-normal",
    args: [false, "https://x.app", true, false] as const,
    expect: { showPausedOverlay: false, showDeployedPreview: false, iframeVisible: true },
  },
];

let ok = true;
for (const c of cases) {
  const got = previewState(...c.args);
  const pass = Object.entries(c.expect).every(([k, v]) => got[k as keyof typeof got] === v);
  if (!pass) ok = false;
  console.log(JSON.stringify({ case: c.name, pass, got, expect: c.expect }));
}
process.exit(ok ? 0 : 1);
