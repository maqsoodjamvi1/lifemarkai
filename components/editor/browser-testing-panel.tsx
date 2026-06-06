"use client";

import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronRight, Loader2, Play, CheckCircle2, XCircle, Clock,
  Globe, FileCode, RefreshCw, AlertTriangle, Copy, Check,
  Camera, ExternalLink, Wifi,
} from "lucide-react";
import type { ProjectFile, Project } from "@/types/database";

interface BrowserTestingPanelProps {
  project: Project;
  files: ProjectFile[];
  onFilesUpdate: (files: ProjectFile[]) => void;
  onOpenFile: (file: ProjectFile) => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  error?: string;
}

interface TestSuiteResult {
  file: string;
  results: TestResult[];
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTestNames(content: string): string[] {
  const names: string[] = [];
  const re = /test\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

/** Deterministic "random" 0..1 from a string seed */
function seedRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) / 0xffffffff);
}

function simulateResults(file: ProjectFile): TestSuiteResult {
  const names = parseTestNames(file.content || "");
  const results: TestResult[] = names.map((name) => {
    const r = seedRand(file.path + name);
    const status: "pass" | "fail" | "skip" = r > 0.85 ? "fail" : r > 0.78 ? "skip" : "pass";
    const duration = Math.floor(r * 1800 + 200);
    return {
      name,
      status,
      duration,
      error: status === "fail"
        ? `Expected element to be visible\n  Selector: [data-testid="${name.toLowerCase().replace(/\s+/g, "-")}"]\n  Timeout: 5000ms`
        : undefined,
    };
  });

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const duration = results.reduce((s, r) => s + r.duration, 0);

  return { file: file.path, results, duration, passed, failed, skipped };
}

function buildFilesSample(files: ProjectFile[]): string {
  const priority = ["app/page.tsx", "src/App.tsx", "index.html", "src/index.tsx"];
  const ordered = [
    ...priority.map((p) => files.find((f) => f.path === p)).filter(Boolean) as ProjectFile[],
    ...files.filter((f) => f.path.endsWith(".tsx") && !priority.includes(f.path)).slice(0, 3),
  ];
  return ordered.map((f) => `// ${f.path}\n${(f.content || "").slice(0, 1200)}`).join("\n\n").slice(0, 6000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: "pass" | "fail" | "skip" }) {
  if (status === "pass") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
  if (status === "fail") return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

function TestResultRow({ result }: { result: TestResult }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 text-left group"
          disabled={!result.error}
        >
          <StatusIcon status={result.status} />
          <span className="flex-1 text-xs truncate">{result.name}</span>
          <span className="text-[10px] text-muted-foreground">{result.duration}ms</span>
          {result.error && (
            <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          )}
        </button>
      </CollapsibleTrigger>
      {result.error && (
        <CollapsibleContent>
          <pre className="mx-3 mb-2 px-2 py-2 text-[10px] bg-red-500/10 text-red-400 rounded font-mono whitespace-pre-wrap border border-red-500/20">
            {result.error}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function SuiteResultCard({ suite }: { suite: TestSuiteResult }) {
  const [open, setOpen] = useState(suite.failed > 0);
  const total = suite.passed + suite.failed + suite.skipped;
  const passRate = total > 0 ? Math.round((suite.passed / total) * 100) : 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-muted/30 cursor-pointer group">
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-xs font-medium truncate">{suite.file}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {suite.passed > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                {suite.passed}✓
              </Badge>
            )}
            {suite.failed > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-red-500 border-red-500/30 bg-red-500/10">
                {suite.failed}✗
              </Badge>
            )}
            {suite.skipped > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                {suite.skipped}~
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">{Math.round(suite.duration / 1000)}s</span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-b border-border">
          {/* Pass rate bar */}
          <div className="px-3 py-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">Pass rate</span>
              <span className="text-[10px] font-medium">{passRate}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${passRate}%` }}
              />
            </div>
          </div>
          {suite.results.map((r) => (
            <TestResultRow key={r.name} result={r} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ── Live test types ───────────────────────────────────────────────────────────

interface LiveStep {
  index: number;
  action: string;
  status: "running" | "pass" | "fail";
  error?: string;
}

interface LiveScreenshot {
  index: number;
  label: string;
  dataUrl: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function BrowserTestingPanel({ project, files, onFilesUpdate, onOpenFile }: BrowserTestingPanelProps) {
  const [tab, setTab] = useState<"generate" | "tests" | "results" | "live">("generate");
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [suiteResults, setSuiteResults] = useState<TestSuiteResult[]>([]);
  const [copied, setCopied] = useState(false);

  // ── Live test state ─────────────────────────────────────────────────────────
  const deployedUrl = (project as any).deployed_url as string | null ?? null;
  const [liveUrl, setLiveUrl] = useState<string>(deployedUrl ?? "");
  const [liveScenario, setLiveScenario] = useState("");
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [liveScreenshots, setLiveScreenshots] = useState<LiveScreenshot[]>([]);
  const [liveDone, setLiveDone] = useState<{ pass: number; fail: number; url: string; note?: string; engine?: "playwright" | "fetch" } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveStatusMsg, setLiveStatusMsg] = useState<string>("");
  const liveAbortRef = useRef<(() => void) | null>(null);
  const liveScrollRef = useRef<HTMLDivElement>(null);

  // E2E test files in the project
  const testFiles = useMemo(
    () => files.filter((f) => f.path.match(/\.(spec|test)\.(ts|js)$/) || f.path.startsWith("e2e/")),
    [files]
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const filesSample = buildFilesSample(files);
      const res = await fetch("/api/ai/generate-browser-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          previewUrl: (project as any).preview_url || (project as any).deploy_url || "",
          description: description.trim() || undefined,
          filesSample,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      onFilesUpdate([data.file]);
      setTab("tests");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunAll = async () => {
    if (testFiles.length === 0) return;
    setIsRunning(true);
    setSuiteResults([]);
    setTab("results");

    // Simulate sequential test execution
    for (const file of testFiles) {
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
      setSuiteResults((prev) => [...prev, simulateResults(file)]);
    }
    setIsRunning(false);
  };

  const handleCopyInstall = () => {
    navigator.clipboard.writeText("npm install -D @playwright/test\nnpx playwright install chromium");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Live test handler ─────────────────────────────────────────────────────────
  const handleRunLive = async () => {
    if (!liveUrl.trim()) return;
    setIsLiveRunning(true);
    setLiveSteps([]);
    setLiveScreenshots([]);
    setLiveDone(null);
    setLiveError(null);
    setLiveStatusMsg("Connecting…");

    let aborted = false;
    const controller = new AbortController();
    liveAbortRef.current = () => { aborted = true; controller.abort(); };

    try {
      const res = await fetch(`/api/projects/${project.id}/browser-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: liveUrl.trim(), scenario: liveScenario.trim() || undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Request failed");
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;
        buffer += dec.decode(value, { stream: true });

        // Parse SSE events
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let evtType = "";
          let evtData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) evtType = line.slice(7).trim();
            if (line.startsWith("data: ")) evtData = line.slice(6);
          }
          if (!evtType || !evtData) continue;
          try {
            const payload = JSON.parse(evtData) as Record<string, unknown>;
            if (evtType === "status") setLiveStatusMsg(payload.message as string);
            if (evtType === "step") {
              setLiveSteps((prev) => {
                const idx = prev.findIndex((s) => s.index === (payload.index as number));
                const step: LiveStep = {
                  index: payload.index as number,
                  action: payload.action as string,
                  status: payload.status as LiveStep["status"],
                  error: payload.error as string | undefined,
                };
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = step;
                  return next;
                }
                return [...prev, step];
              });
              // Auto-scroll
              setTimeout(() => liveScrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }), 50);
            }
            if (evtType === "screenshot") {
              setLiveScreenshots((prev) => [...prev, {
                index: payload.index as number,
                label: payload.label as string,
                dataUrl: payload.dataUrl as string,
              }]);
            }
            if (evtType === "done") {
              setLiveDone({
                pass: payload.pass as number,
                fail: payload.fail as number,
                url: payload.url as string,
                note: payload.note as string | undefined,
                engine: payload.engine as "playwright" | "fetch" | undefined,
              });
              setLiveStatusMsg("");
            }
            if (evtType === "error") {
              setLiveError(payload.message as string);
            }
          } catch { /* skip unparseable */ }
        }
      }
    } catch (e) {
      if (!aborted) setLiveError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsLiveRunning(false);
      liveAbortRef.current = null;
    }
  };

  const totalPassed = suiteResults.reduce((s, r) => s + r.passed, 0);
  const totalFailed = suiteResults.reduce((s, r) => s + r.failed, 0);
  const totalSkipped = suiteResults.reduce((s, r) => s + r.skipped, 0);
  const totalTests = totalPassed + totalFailed + totalSkipped;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Browser Tests</span>
          {testFiles.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {testFiles.length} file{testFiles.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {testFiles.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={handleRunAll}
            disabled={isRunning}
          >
            {isRunning ? (
              <><Loader2 className="w-3 h-3 animate-spin" />Running…</>
            ) : (
              <><Play className="w-3 h-3" />Run All</>
            )}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0 mx-3 mt-2 h-7 text-xs grid grid-cols-4">
          <TabsTrigger value="generate" className="text-xs">Generate</TabsTrigger>
          <TabsTrigger value="tests" className="text-xs">
            Tests {testFiles.length > 0 && `(${testFiles.length})`}
          </TabsTrigger>
          <TabsTrigger value="results" className="text-xs">
            Results {totalTests > 0 && `(${totalTests})`}
          </TabsTrigger>
          <TabsTrigger value="live" className="text-xs flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5" />Live
          </TabsTrigger>
        </TabsList>

        {/* ── Generate tab ─────────────────────────────────────────────────── */}
        <TabsContent value="generate" className="flex-1 overflow-auto m-0 p-3 flex flex-col gap-3">
          {/* Setup hint */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary" /> Playwright Setup
            </p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Install Playwright in your project to run the generated tests locally.
            </p>
            <div className="flex items-center gap-2 font-mono text-[10px] bg-background rounded px-2 py-1.5 border border-border">
              <code className="flex-1 text-muted-foreground">npm install -D @playwright/test</code>
              <button onClick={handleCopyInstall} className="shrink-0 text-muted-foreground hover:text-foreground">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">App description (optional)</label>
            <Textarea
              placeholder="Describe key user flows to test: login, checkout, form submission…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs resize-none"
              rows={4}
            />
            <p className="text-[10px] text-muted-foreground">
              Leave blank to auto-detect from your source files.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full h-8 text-xs gap-2"
          >
            {isGenerating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating tests…</>
            ) : (
              <><Globe className="w-3.5 h-3.5" />Generate Playwright Tests</>
            )}
          </Button>

          {testFiles.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <p className="text-xs text-emerald-600 font-medium mb-0.5">
                ✓ {testFiles.length} test file{testFiles.length !== 1 ? "s" : ""} already generated
              </p>
              <p className="text-[10px] text-muted-foreground">
                Click "Run All" to simulate execution or view in the Tests tab.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Tests tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="tests" className="flex-1 overflow-hidden m-0 flex flex-col">
          {testFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
              <FileCode className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No test files yet</p>
              <p className="text-xs text-muted-foreground/60">
                Generate tests from the Generate tab or add .spec.ts files manually.
              </p>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setTab("generate")}>
                Generate Tests
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {testFiles.map((file) => {
                  const names = parseTestNames(file.content || "");
                  return (
                    <Collapsible key={file.id}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 cursor-pointer">
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-90" />
                          <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{file.path}</p>
                            <p className="text-[10px] text-muted-foreground">{names.length} test{names.length !== 1 ? "s" : ""}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 shrink-0"
                            onClick={(e) => { e.stopPropagation(); onOpenFile(file); }}
                            title="Open file"
                          >
                            <FileCode className="w-3 h-3" />
                          </Button>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-2 border-b border-border">
                          {names.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground py-2">No test() blocks detected.</p>
                          ) : (
                            names.map((name) => (
                              <div key={name} className="flex items-center gap-2 py-1">
                                <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs text-muted-foreground truncate">{name}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ── Results tab ───────────────────────────────────────────────────── */}
        <TabsContent value="results" className="flex-1 overflow-hidden m-0 flex flex-col">
          {suiteResults.length === 0 && !isRunning ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
              <RefreshCw className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No results yet</p>
              <p className="text-xs text-muted-foreground/60">Run your tests to see results here.</p>
              {testFiles.length > 0 && (
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleRunAll}>
                  <Play className="w-3 h-3" /> Run All Tests
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Summary bar */}
              {totalTests > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
                  {totalPassed > 0 && (
                    <div className="flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle2 className="w-3 h-3" />{totalPassed} passed
                    </div>
                  )}
                  {totalFailed > 0 && (
                    <div className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="w-3 h-3" />{totalFailed} failed
                    </div>
                  )}
                  {totalSkipped > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />{totalSkipped} skipped
                    </div>
                  )}
                  <div className="ml-auto flex-1 max-w-[80px] h-1.5 rounded-full bg-muted overflow-hidden flex">
                    {totalPassed > 0 && (
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(totalPassed / totalTests) * 100}%` }}
                      />
                    )}
                    {totalFailed > 0 && (
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${(totalFailed / totalTests) * 100}%` }}
                      />
                    )}
                    {totalSkipped > 0 && (
                      <div
                        className="h-full bg-muted-foreground/30 transition-all"
                        style={{ width: `${(totalSkipped / totalTests) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Running indicator */}
              {isRunning && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running tests…
                </div>
              )}

              <ScrollArea className="flex-1">
                {suiteResults.map((suite) => (
                  <SuiteResultCard key={suite.file} suite={suite} />
                ))}
              </ScrollArea>
            </>
          )}
        </TabsContent>

        {/* ── Results tab ───────────────────────────────────────────────────── */}
        <TabsContent value="results" className="flex-1 overflow-hidden m-0 flex flex-col">
          {suiteResults.length === 0 && !isRunning ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
              <Play className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No results yet</p>
              <p className="text-xs text-muted-foreground/60">
                Click "Run All" to simulate test execution.
              </p>
              {testFiles.length > 0 && (
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleRunAll}>
                  <Play className="w-3 h-3" />Run All Tests
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Summary bar */}
              {totalTests > 0 && (
                <div className="px-3 py-2 border-b border-border shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-3 text-xs">
                      {totalPassed > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />{totalPassed} passed
                        </span>
                      )}
                      {totalFailed > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" />{totalFailed} failed
                        </span>
                      )}
                      {totalSkipped > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />{totalSkipped} skipped
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2"
                      onClick={handleRunAll}
                      disabled={isRunning}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />Re-run
                    </Button>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                    {totalPassed > 0 && (
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(totalPassed / totalTests) * 100}%` }}
                      />
                    )}
                    {totalFailed > 0 && (
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${(totalFailed / totalTests) * 100}%` }}
                      />
                    )}
                    {totalSkipped > 0 && (
                      <div
                        className="h-full bg-muted-foreground/30 transition-all"
                        style={{ width: `${(totalSkipped / totalTests) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Running indicator */}
              {isRunning && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running tests…
                </div>
              )}

              <ScrollArea className="flex-1">
                {suiteResults.map((suite) => (
                  <SuiteResultCard key={suite.file} suite={suite} />
                ))}
              </ScrollArea>
            </>
          )}
        </TabsContent>
        {/* ── Live test tab ─────────────────────────────────────────────── */}
        <TabsContent value="live" className="flex-1 overflow-hidden m-0 flex flex-col">
          {/* URL input + run button */}
          <div className="p-3 border-b border-border space-y-2 shrink-0">
                   <div className="flex gap-2">
              <input
                type="url"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder="https://your-app.netlify.app"
                className="flex-1 h-7 px-2.5 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center px-2 h-7 rounded-md border border-border hover:bg-muted transition-colors">
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              )}
            </div>
            <Textarea
              value={liveScenario}
              onChange={(e) => setLiveScenario(e.target.value)}
              placeholder="Describe what to test: login flow, hero image, checkout…"
              className="text-xs resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs gap-1.5"
                onClick={() => void handleRunLive()} disabled={isLiveRunning || !liveUrl.trim()}>
                {isLiveRunning ? <><Loader2 className="w-3 h-3 animate-spin" />Running…</> : <><Play className="w-3 h-3" />Run Live Tests</>}
              </Button>
              {isLiveRunning && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => liveAbortRef.current?.()}>Stop</Button>
              )}
            </div>
            {!deployedUrl && (
              <p className="text-[10px] text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Deploy your app first, or paste a URL above.
              </p>
            )}
          </div>

          <div ref={liveScrollRef} className="flex-1 overflow-y-auto">
            {liveStatusMsg && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />{liveStatusMsg}
              </div>
            )}
            {liveError && (
              <div className="flex items-start gap-2 m-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400">{liveError}</p>
              </div>
            )}
            {liveDone && (
              <div className={`mx-3 mt-3 mb-2 rounded-lg border px-3 py-2 ${liveDone.fail > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {liveDone.fail > 0 ? <XCircle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className="text-xs font-semibold">{liveDone.fail > 0 ? "Some checks failed" : "All checks passed"}</span>
                  {liveDone.engine && (
                    <span
                      className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${
                        liveDone.engine === "playwright"
                          ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                          : "border-border text-muted-foreground"
                      }`}
                      title={liveDone.engine === "playwright"
                        ? "Real Chromium executed JS before the assertions ran"
                        : "Plain HTTP fetch — JS-rendered content not visible"}
                    >
                      {liveDone.engine === "playwright" ? "Chromium" : "HTTP fetch"}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-[11px]">
                  <span className="text-emerald-400">{liveDone.pass} passed</span>
                  {liveDone.fail > 0 && <span className="text-red-400">{liveDone.fail} failed</span>}
                </div>
                {liveDone.note && <p className="text-[10px] text-muted-foreground mt-1">{liveDone.note}</p>}
              </div>
            )}
            {liveSteps.length > 0 && (
              <div className="divide-y divide-border/50 mt-1">
                {liveSteps.map((step) => (
                  <div key={step.index} className="flex items-start gap-2 px-3 py-2">
                    {step.status === "running" && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0 mt-0.5" />}
                    {step.status === "pass" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                    {step.status === "fail" && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{step.action}</p>
                      {step.error && <p className="text-[10px] text-red-400 mt-0.5 line-clamp-2 font-mono">{step.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {liveScreenshots.length > 0 && (
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Camera className="w-3.5 h-3.5" />Screenshots
                </div>
                {liveScreenshots.map((ss, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium">{ss.label}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ss.dataUrl} alt={ss.label} className="w-full rounded-lg border border-border object-cover" style={{ maxHeight: 220 }} />
                  </div>
                ))}
              </div>
            )}
            {!isLiveRunning && !liveError && liveSteps.length === 0 && !liveDone && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-4">
                <Wifi className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  {deployedUrl ? "Click Run Live Tests to check your deployed app." : "Deploy your app first, then run live browser tests."}
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
