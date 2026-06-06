"use client";

import { useState, useMemo, useRef } from "react";
import {
  FlaskConical, Sparkles, Play, Check, X, AlertCircle,
  FileCode, ChevronRight, ChevronDown, Loader2, Plus,
  CircleDot, SkipForward, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface TestingPanelProps {
  projectId: string;
  files: ProjectFile[];
  onFilesUpdate: (files: ProjectFile[]) => void;
  onOpenFile: (file: ProjectFile) => void;
}

type TestStatus = "pass" | "fail" | "skip" | "pending";

interface ParsedTest {
  name: string;
  status: TestStatus;
  duration?: number;
  error?: string;
}

interface ParsedSuite {
  name: string;
  tests: ParsedTest[];
  file: ProjectFile;
  status: TestStatus;
}

interface RunResult {
  suites: ParsedSuite[];
  pass: number;
  fail: number;
  skip: number;
  duration: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path);
}

function isSourceFile(path: string): boolean {
  return (
    /\.(ts|tsx|js|jsx)$/.test(path) &&
    !isTestFile(path) &&
    !path.includes("node_modules") &&
    !path.includes(".config.")
  );
}

/** Extract describe/it/test names from test file content using regex */
function parseTestNames(content: string): string[] {
  const names: string[] = [];
  const re = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

function parseSuiteName(content: string, filePath: string): string {
  const m = content.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
  return m?.[1] ?? filePath.split("/").pop()?.replace(/\.(test|spec)\.\w+$/, "") ?? "Tests";
}

/** Parse suites from API response into the local shape */
function apiSuitesToParsedSuites(
  apiSuites: Array<{ file: string; tests: Array<{ name: string; status: string; duration?: number; error?: string }> }>,
  testFiles: ProjectFile[],
): ParsedSuite[] {
  return apiSuites.map((s) => {
    const file = testFiles.find((f) => f.path.includes(s.file) || s.file.includes(f.path.split("/").pop()!)) ?? testFiles[0];
    const tests: ParsedTest[] = s.tests.map((t) => ({
      name: t.name,
      status: (t.status as TestStatus) ?? "pass",
      duration: t.duration,
      error: t.error,
    }));
    const hasFail = tests.some((t) => t.status === "fail");
    const allPass = tests.every((t) => t.status === "pass");
    return {
      name: s.file,
      tests,
      file: file ?? { id: "", path: s.file, content: "", language: "typescript", project_id: "", created_at: "", updated_at: "" },
      status: hasFail ? "fail" : allPass ? "pass" : "skip",
    };
  });
}

/** Fallback: build ParsedSuites from testFiles when API returns no suites */
function fallbackSuites(testFiles: ProjectFile[], exitCode: number | null): ParsedSuite[] {
  return testFiles.map((f) => {
    const names = parseTestNames(f.content ?? "");
    const suiteName = parseSuiteName(f.content ?? "", f.path);
    const tests: ParsedTest[] = names.length > 0
      ? names.map((name) => ({ name, status: exitCode === 0 ? "pass" : "fail" as TestStatus }))
      : [{ name: "No test cases detected", status: "skip" as TestStatus }];
    return { name: suiteName, tests, file: f, status: exitCode === 0 ? "pass" : "fail" as TestStatus };
  });
}

/** @deprecated kept to satisfy compiler — no longer called */
function simulateRun(suite: { name: string; tests: string[]; file: ProjectFile }): ParsedSuite {
  const tests: ParsedTest[] = suite.tests.map((name, i) => {
    const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    let status: TestStatus = "pass";
    if (hash % 17 === 0) status = "skip";
    else if (hash % 23 === 0) status = "fail";
    return {
      name,
      status,
      duration: 2 + (hash % 40),
      error: status === "fail" ? `Expected value to equal mock result\n  at ${suite.file.path}:${10 + i}` : undefined,
    };
  });

  const hasFail = tests.some((t) => t.status === "fail");
  const allSkip = tests.every((t) => t.status === "skip");
  return {
    name: suite.name,
    tests,
    file: suite.file,
    status: hasFail ? "fail" : allSkip ? "skip" : "pass",
  };
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, size = "sm" }: { status: TestStatus; size?: "sm" | "xs" }) {
  const cfg: Record<TestStatus, { icon: React.ReactNode; color: string; label: string }> = {
    pass:    { icon: <Check    className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />, color: "text-emerald-500", label: "PASS" },
    fail:    { icon: <X        className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />, color: "text-red-500",     label: "FAIL" },
    skip:    { icon: <SkipForward className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />, color: "text-yellow-500", label: "SKIP" },
    pending: { icon: <CircleDot className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />, color: "text-muted-foreground", label: "IDLE" },
  };
  const { icon, color, label } = cfg[status];
  return (
    <span className={`flex items-center gap-1 font-mono font-bold ${color} ${size === "xs" ? "text-[9px]" : "text-[10px]"}`}>
      {icon}{label}
    </span>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export function TestingPanel({ projectId, files, onFilesUpdate, onOpenFile }: TestingPanelProps) {
  const { toast } = useToast();

  const testFiles  = useMemo(() => files.filter((f) => isTestFile(f.path)), [files]);
  const sourceFiles = useMemo(() => files.filter((f) => isSourceFile(f.path)), [files]);

  const [view, setView] = useState<"tests" | "generate" | "results" | "logs">("tests");
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [liveLogs, setLiveLogs] = useState<Array<{ line: string; isError?: boolean }>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Generate view state
  const [selectedSource, setSelectedSource] = useState<ProjectFile | null>(null);
  const [generating, setGenerating] = useState(false);

  // ── Run all tests via real SSE runner ────────────────────────────────────
  async function runTests() {
    if (!testFiles.length) return;
    setRunning(true);
    setRunResult(null);
    setLiveLogs([]);
    setView("results");

    try {
      const res = await fetch("/api/tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          files: testFiles.map((f) => ({ path: f.path, content: f.content ?? "" })),
          runner: "vitest",
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        toast({ title: "Test run failed", description: errText, variant: "destructive" });
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const eventMatch = part.match(/^event:\s*(.+)$/m);
          const dataMatch  = part.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;

          const eventType = eventMatch?.[1]?.trim() ?? "message";
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataMatch[1]) as Record<string, unknown>; } catch { continue; }

          if (eventType === "log") {
            const entry = { line: payload.line as string, isError: payload.isError as boolean | undefined };
            setLiveLogs((prev) => [...prev.slice(-199), entry]); // keep last 200 lines
            setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          } else if (eventType === "done") {
            const apiSuites = (payload.suites as Array<{ file: string; tests: Array<{ name: string; status: string; duration?: number; error?: string }> }>) ?? [];
            const suites = apiSuites.length > 0
              ? apiSuitesToParsedSuites(apiSuites, testFiles)
              : fallbackSuites(testFiles, payload.exitCode as number | null);

            const pass     = payload.pass as number ?? suites.reduce((a, s) => a + s.tests.filter((t) => t.status === "pass").length, 0);
            const fail     = payload.fail as number ?? suites.reduce((a, s) => a + s.tests.filter((t) => t.status === "fail").length, 0);
            const skip     = payload.skip as number ?? suites.reduce((a, s) => a + s.tests.filter((t) => t.status === "skip").length, 0);
            const duration = payload.duration as number ?? 0;

            setRunResult({ suites, pass, fail, skip, duration });
            setRunning(false);
            const firstFail = suites.find((s) => s.status === "fail");
            if (firstFail) setExpandedSuites(new Set([firstFail.file.path]));
          } else if (eventType === "error") {
            toast({ title: "Test runner error", description: payload.message as string, variant: "destructive" });
            setRunning(false);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Test run failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  // ── Generate tests ────────────────────────────────────────────────────────
  async function generateTests() {
    if (!selectedSource) return;
    setGenerating(true);

    const res = await fetch("/api/ai/generate-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        filePath: selectedSource.path,
        fileContent: selectedSource.content ?? "",
      }),
    });

    if (res.ok) {
      const { file } = await res.json();
      onFilesUpdate([file]);
      toast({ title: "Tests generated!", description: file.path });
      setView("tests");
      setSelectedSource(null);
    } else {
      const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
      toast({ title: "Generation failed", description: error, variant: "destructive" });
    }
    setGenerating(false);
  }

  function toggleSuite(path: string) {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <FlaskConical className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Testing</span>
        {testFiles.length > 0 && (
          <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {testFiles.length} file{testFiles.length > 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setView("generate"); setSelectedSource(null); }}
            className="h-6 px-2 text-[10px] gap-1"
          >
            <Plus className="w-3 h-3" />Generate
          </Button>
          {testFiles.length > 0 && (
            <Button
              size="sm"
              onClick={() => void runTests()}
              disabled={running}
              className="h-6 px-2 text-[10px] gap-1"
            >
              {running
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Play className="w-3 h-3" />
              }
              Run all
            </Button>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-border px-4 shrink-0">
        {[
          { id: "tests",    label: "Test files" },
          { id: "generate", label: "Generate" },
          { id: "results",  label: "Results" },
          ...(liveLogs.length > 0 ? [{ id: "logs", label: "Logs" }] : []),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id as typeof view)}
            className={`py-2 text-xs font-medium mr-4 relative transition-colors ${
              view === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {view === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Test files list ─────────────────────────────────────────────── */}
        {view === "tests" && (
          <div className="p-2 space-y-1">
            {testFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
                <FlaskConical className="w-8 h-8 text-muted-foreground/30" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">No test files yet</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Use "Generate" to create Vitest tests from any source file
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setView("generate")} className="h-7 text-xs gap-1.5">
                  <Sparkles className="w-3 h-3" />Generate tests
                </Button>
              </div>
            ) : (
              testFiles.map((f) => {
                const names = parseTestNames(f.content ?? "");
                const suiteName = parseSuiteName(f.content ?? "", f.path);
                const expanded = expandedSuites.has(f.path);
                return (
                  <div key={f.path} className="rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => toggleSuite(f.path)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      {expanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      }
                      <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{suiteName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{f.path}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{names.length} tests</span>
                    </button>
                    {expanded && (
                      <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1">
                        {names.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground italic">No test cases detected</p>
                        ) : (
                          names.map((name, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <CircleDot className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">{name}</span>
                            </div>
                          ))
                        )}
                        <button
                          onClick={() => onOpenFile(f)}
                          className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-1"
                        >
                          <FileCode className="w-2.5 h-2.5" />Open file
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Generate tests ──────────────────────────────────────────────── */}
        {view === "generate" && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Pick a source file and AI will write comprehensive Vitest tests for it — covering happy paths, edge cases, and error states.
            </p>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Source file
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {sourceFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-2">No source files found</p>
                ) : (
                  sourceFiles.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => setSelectedSource(f)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                        selectedSource?.path === f.path
                          ? "bg-primary/10 border border-primary/30 text-foreground"
                          : "hover:bg-muted/40 text-muted-foreground hover:text-foreground border border-transparent"
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{f.path.split("/").pop()}</p>
                        <p className="text-[10px] truncate opacity-60">{f.path}</p>
                      </div>
                      {selectedSource?.path === f.path && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {selectedSource && (
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Selected</p>
                <p className="text-xs font-mono text-foreground">{selectedSource.path}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(selectedSource.content ?? "").split("\n").length} lines
                </p>
              </div>
            )}

            <Button
              onClick={generateTests}
              disabled={!selectedSource || generating}
              className="w-full h-8 text-xs gap-2"
            >
              {generating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating tests…</>
                : <><Sparkles className="w-3.5 h-3.5" />Generate Vitest tests</>
              }
            </Button>

            {/* Vitest config hint */}
            <div className="rounded-lg bg-muted/20 border border-border p-3 text-[10px] text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Setup required</p>
              <p>Add to <code className="font-mono">package.json</code>:</p>
              <pre className="font-mono bg-muted/40 rounded p-2 overflow-x-auto text-[9px]">{`"scripts": { "test": "vitest" }
"devDependencies": {
  "vitest": "^1.0.0",
  "@testing-library/react": "^14.0.0",
  "@testing-library/jest-dom": "^6.0.0"
}`}</pre>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        {view === "results" && (
          <div className="p-3 space-y-3">
            {running && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Running {testFiles.length} test file{testFiles.length > 1 ? "s" : ""}…
                </div>
                {liveLogs.length > 0 && (
                  <div className="rounded-lg bg-black/40 border border-border p-2 max-h-48 overflow-y-auto font-mono">
                    {liveLogs.map((l, i) => (
                      <p key={i} className={`text-[10px] leading-relaxed whitespace-pre-wrap break-all ${l.isError ? "text-red-400" : "text-slate-300"}`}>
                        {l.line}
                      </p>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            )}

            {!running && !runResult && (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
                <Play className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No results yet — click "Run all" to execute tests</p>
              </div>
            )}

            {!running && runResult && (
              <>
                {/* Summary bar */}
                <div className={`rounded-lg border p-3 ${
                  runResult.fail > 0 ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${runResult.fail > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {runResult.fail > 0 ? "✗ Tests failed" : "✓ All tests passed"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{runResult.duration}ms</span>
                  </div>
                  <div className="flex gap-4 text-[11px] font-mono">
                    <span className="text-emerald-400">{runResult.pass} passed</span>
                    {runResult.fail > 0 && <span className="text-red-400">{runResult.fail} failed</span>}
                    {runResult.skip > 0 && <span className="text-amber-400">{runResult.skip} skipped</span>}
                  </div>
                </div>

                {/* Suite list */}
                <div className="space-y-2">
                  {runResult.suites.map((suite) => (
                    <div key={suite.file.path} className="rounded-lg border border-border/60 overflow-hidden">
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
                        onClick={() => onOpenFile(suite.file)}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          suite.status === "pass" ? "bg-emerald-400" :
                          suite.status === "fail" ? "bg-red-400" : "bg-amber-400"
                        }`} />
                        <span className="text-[11px] font-medium truncate flex-1">{suite.name}</span>
                        <span className="text-[10px] text-muted-foreground">{suite.tests.length} tests</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <div className="divide-y divide-border/40">
                        {suite.tests.map((test, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                            {test.status === "pass" && <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                            {test.status === "fail" && <X className="w-3 h-3 text-red-400 flex-shrink-0" />}
                            {test.status === "skip" && <SkipForward className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                            {test.status === "pending" && <CircleDot className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                            <span className="text-[11px] flex-1 truncate">{test.name}</span>
                            {test.duration !== undefined && (
                              <span className="text-[10px] text-muted-foreground">{test.duration}ms</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {suite.tests.some((t) => t.error) && (
                        <div className="px-3 py-2 bg-red-500/5 border-t border-red-500/20">
                          {suite.tests.filter((t) => t.error).map((t, i) => (
                            <pre key={i} className="text-[10px] text-red-400 font-mono whitespace-pre-wrap break-all">{t.error}</pre>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
