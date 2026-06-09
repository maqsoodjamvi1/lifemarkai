// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw, Terminal, Loader2, AlertCircle,
  ExternalLink, Smartphone, Tablet, Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import type { ProjectFile } from "@/types/database";
import { patchFilesForWebContainer } from "@/lib/preview/patch-vite-for-webcontainer";

interface WebContainerPreviewProps {
  files: ProjectFile[];
  onError?: (err: string) => void;
  /** Hide the internal toolbar when embedded inside PreviewPanel */
  embedded?: boolean;
  className?: string;
}

type DeviceMode = "desktop" | "tablet" | "mobile";
type Status = "idle" | "booting" | "installing" | "starting" | "ready" | "error";

const DEVICE_SIZES: Record<DeviceMode, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet:  { width: "768px", label: "Tablet" },
  mobile:  { width: "390px", label: "Mobile" },
};

let _wcInstance: any = null;
let _wcBooting: Promise<any> | null = null;
let _npmInstalled: boolean = false;
let _lastPackageJsonContent: string | null = null;

const MAX_WATCHDOG_ATTEMPTS = 3;
const WATCHDOG_COUNTDOWN_SECS = 5;

const WebContainerPreview: React.FC<WebContainerPreviewProps> = ({ files, onError, embedded = false, className = "" }) => {
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  // Watchdog state
  const [watchdogCountdown, setWatchdogCountdown] = useState<number | null>(null);
  const [watchdogAttempts, setWatchdogAttempts] = useState(0);
  const [watchdogDisabled, setWatchdogDisabled] = useState(false);
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [showConsole, setShowConsole] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastWrittenRef = useRef<Map<string, string>>(new Map());
  const bootedRef = useRef(false);
  const bootingRef = useRef(false);

  const addLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-300), line.replace(/\n$/, "")]);
  }, []);

  const buildFileTree = useCallback((filesToLoad: ProjectFile[]) => {
    const tree: Record<string, any> = {};

    for (const file of filesToLoad) {
      const normalizedPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!normalizedPath) continue;

      const parts = normalizedPath.split("/").filter(Boolean);
      let current = tree;

      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const isFile = i === parts.length - 1;

        if (isFile) {
          current[part] = {
            file: {
              contents: file.content ?? "",
            },
          };
        } else {
          if (!current[part] || !('directory' in current[part])) {
            current[part] = { directory: current[part]?.file ? {} : {} };
          }
          current = current[part].directory;
        }
      }
    }

    return tree;
  }, []);

  const mountFiles = useCallback(async (wc: any, filesToLoad: ProjectFile[]) => {
    const patched = patchFilesForWebContainer(filesToLoad);
    const fileTree = buildFileTree(patched);
    await wc.mount(fileTree);
    addLog("Files mounted");
  }, [addLog, buildFileTree]);

  const boot = useCallback(async (filesToLoad: ProjectFile[]) => {
    if (bootingRef.current) return;

    const shouldStart = !_wcInstance;
    if (!shouldStart && bootedRef.current && _wcInstance) {
      try {
        await mountFiles(_wcInstance, filesToLoad);
      } catch (mountErr) {
        const msg = mountErr instanceof Error ? mountErr.message : String(mountErr);
        addLog(`Error mounting files: ${msg}`);
      }
      return;
    }

    bootingRef.current = true;
    setStatus("booting");
    setErrorMsg(null);
    setLogs([]);
    setPreviewUrl(null);

    try {
      const { WebContainer } = await import("@webcontainer/api");

      // Check cross-origin isolation support
      if (!window.crossOriginIsolated) {
        addLog("⚠ Cross-origin isolation not supported in this context");
        addLog("→ Please ensure the page is served with proper COOP/COEP headers");
        throw new Error(
          "Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers are required. " +
          "Please refresh the page or contact support."
        );
      }

      if (!_wcInstance) {
        if (_wcBooting) {
          _wcInstance = await _wcBooting;
        } else {
          addLog("Booting WebContainer...");
          _wcBooting = WebContainer.boot({ coep: "require-corp" });
          _wcInstance = await _wcBooting;
          _wcBooting = null;
          addLog("WebContainer ready");
        }
      }

      const wc = _wcInstance;
      await mountFiles(wc, filesToLoad);

      const packageJsonFile = filesToLoad.find((f) => f.path.replace(/\\/g, "/").endsWith("package.json"));
      const hasPackageJson = Boolean(packageJsonFile);
      const packageJsonContent = packageJsonFile?.content ?? null;

      if (hasPackageJson && packageJsonContent !== _lastPackageJsonContent) {
        _npmInstalled = false;
        _lastPackageJsonContent = packageJsonContent;
      }

      // Skip npm install if already completed for this WebContainer instance and package.json did not change
      if (hasPackageJson && !_npmInstalled) {
        setStatus("installing");
        addLog("Installing dependencies...");
        
        let installSuccess = false;
        let lastInstallError = "";
        
        // Try npm install up to 3 times with exponential backoff
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            addLog(`Attempt ${attempt}/3: Running npm install...`);
            
            // Use npm ci if package-lock.json exists, otherwise npm install
            const hasPackageLock = filesToLoad.some((f) => 
              f.path.replace(/\\/g, "/").endsWith("package-lock.json")
            );
            const npmCmd = hasPackageLock ? "ci" : "install";
            const args = [npmCmd];
            if (npmCmd === "install") {
              args.push("--legacy-peer-deps");
            }
            
            const install = await wc.spawn("npm", args);
            
            // Collect output for better error reporting
            const outputLines: string[] = [];
            install.output.pipeTo(new WritableStream({ 
              write: (c: string) => {
                addLog(c);
                outputLines.push(c);
              }
            }));
            
            const installCode = await install.exit;
            
            if (installCode === 0) {
              addLog("✓ Dependencies installed successfully");
              _npmInstalled = true;
              installSuccess = true;
              break;
            } else {
              lastInstallError = `npm ${npmCmd} exited with code ${installCode}`;
              addLog(`⚠ ${lastInstallError}`);
              
              if (attempt < 3) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                addLog(`Waiting ${delay / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, delay));
              }
            }
          } catch (installErr) {
            lastInstallError = installErr instanceof Error ? installErr.message : String(installErr);
            addLog(`⚠ npm install error (attempt ${attempt}/3): ${lastInstallError}`);
            
            if (attempt < 3) {
              const delay = Math.pow(2, attempt - 1) * 1000;
              addLog(`Waiting ${delay / 1000}s before retry...`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }
        
        if (!installSuccess) {
          addLog(`✗ Failed to install dependencies after 3 attempts: ${lastInstallError}`);
          addLog("→ Attempting to start dev server anyway (some packages may be missing)");
        }
      } else if (hasPackageJson && _npmInstalled) {
        addLog("✓ Dependencies already installed, skipping npm install");
      } else if (!hasPackageJson) {
        addLog("No package.json found, skipping npm install");
      }

      setStatus("starting");
      addLog("Starting dev server...");
      const dev = await wc.spawn("npm", ["run", "dev"]);
      dev.output.pipeTo(new WritableStream({ write: (c: string) => addLog(c) }));

      let serverReadyTimeout: ReturnType<typeof setTimeout>;
      let serverReadyUnsubscribe: (() => void) | undefined;
      const serverReadyPromise = new Promise<void>((resolve) => {
        serverReadyTimeout = setTimeout(() => {
          addLog("⚠ Server ready timeout — dev server may be running");
          bootedRef.current = true;
          bootingRef.current = false;
          setStatus("ready");
          resolve();
        }, 30000);

        serverReadyUnsubscribe = wc.on("server-ready", (_port: number, url: string) => {
          clearTimeout(serverReadyTimeout);
          addLog(`Server ready at ${url}`);
          setPreviewUrl(url);
          setStatus("ready");
          bootedRef.current = true;
          bootingRef.current = false;
          resolve();
        });
      });

      await serverReadyPromise;
      if (serverReadyUnsubscribe) serverReadyUnsubscribe();

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      
      // Handle isolation-related errors specifically
      const isIsolationError = msg.includes("crossOriginIsolated") || 
                               msg.includes("Cross-Origin") || 
                               msg.includes("SharedArrayBuffer") ||
                               msg.includes("self.crossOriginIsolated");
      
      if (isIsolationError) {
        setErrorMsg(
          "WebContainers requires cross-origin isolation headers. " +
          "Try switching to the standard Sandpack preview below, or refresh the page."
        );
        addLog("❌ Cross-origin isolation error — WebContainers unavailable");
      } else if (msg.includes("Only a single WebContainer instance") && _wcInstance) {
        bootedRef.current = true;
        bootingRef.current = false;
        setStatus("ready");
        return;
      } else {
        setErrorMsg(msg);
        addLog(`Error: ${msg}`);
      }
      
      setStatus("error");
      onError?.(msg);
      bootedRef.current = false;
      bootingRef.current = false;
      _wcInstance = null;
    }
  }, [addLog, mountFiles, onError]);

  useEffect(() => {
    if (files.length === 0) return;
    if (!bootedRef.current && !bootingRef.current) {
      boot(files);
    }
  }, [files]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const hardRefresh = () => {
    bootedRef.current = false;
    bootingRef.current = false;
    _wcInstance = null;
    _wcBooting = null;
    _npmInstalled = false;
    _lastPackageJsonContent = null;
    setWatchdogCountdown(null);
    if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    boot(files);
  };

  // ── Health watchdog: auto-restart on crash ──────────────────────────────
  useEffect(() => {
    if (status !== "error" || watchdogDisabled) {
      // Clear any running countdown if we recovered
      if (status !== "error" && watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
        setWatchdogCountdown(null);
      }
      return;
    }

    // Don't auto-restart cross-origin isolation errors — they need a real fix
    if (errorMsg?.includes("cross-origin isolation") || errorMsg?.includes("Cross-Origin")) return;

    // Cap restart attempts
    if (watchdogAttempts >= MAX_WATCHDOG_ATTEMPTS) return;

    // Start countdown
    setWatchdogCountdown(WATCHDOG_COUNTDOWN_SECS);
    let remaining = WATCHDOG_COUNTDOWN_SECS;

    watchdogTimerRef.current = setInterval(() => {
      remaining -= 1;
      setWatchdogCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(watchdogTimerRef.current!);
        watchdogTimerRef.current = null;
        setWatchdogAttempts((n) => n + 1);
        hardRefresh();
      }
    }, 1000);

    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const statusLabel: Record<Status, string> = {
    idle: "Waiting",
    booting: "Booting",
    installing: "Installing",
    starting: "Starting",
    ready: "Live",
    error: "Error",
  };

  return (
    <div className={`flex flex-col h-full bg-[#0a0a0f] ${className}`}>
      {!embedded && (
      <div className="flex items-center gap-2 px-3 h-10 border-b border-white/[0.06] shrink-0">
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
          status === "ready" ? "bg-emerald-500/15 text-emerald-400" :
          status === "error" ? "bg-red-500/15 text-red-400" :
          "bg-white/[0.06] text-slate-400"
        }`}>
          {status !== "ready" && status !== "idle" && status !== "error" && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          {statusLabel[status]}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          {(["mobile", "tablet", "desktop"] as DeviceMode[]).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`p-1.5 rounded-md text-xs ${
                device === d ? "bg-white/[0.10] text-white" : "text-slate-500"
              }`}
            >
              {d === "mobile" && <Smartphone className="w-3.5 h-3.5" />}
              {d === "tablet" && <Tablet className="w-3.5 h-3.5" />}
              {d === "desktop" && <Monitor className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowConsole(v => !v)}
          className="p-1.5 rounded-md text-slate-500"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        {status === "idle" && (
          <Button size="sm" onClick={() => boot(files)} className="h-7 text-xs">
            Start
          </Button>
        )}
      </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <AnimatePresence>
          {status !== "ready" && status !== "error" && status !== "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0f]"
            >
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                <p className="text-xs text-slate-400">{statusLabel[status]}...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0f] gap-3 p-4"
            >
              <AlertCircle className="w-6 h-6 text-red-400" />
              <div className="text-center max-w-sm">
                <p className="text-xs text-slate-300 font-medium mb-1">WebContainer Error</p>
                <p className="text-xs text-slate-400">{errorMsg}</p>
              </div>

              {/* Watchdog countdown banner */}
              {watchdogCountdown !== null && !watchdogDisabled && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Auto-restarting in {watchdogCountdown}s…</span>
                  <span className="text-amber-500/50">(attempt {watchdogAttempts + 1}/{MAX_WATCHDOG_ATTEMPTS})</span>
                </div>
              )}
              {watchdogAttempts >= MAX_WATCHDOG_ATTEMPTS && (
                <p className="text-[11px] text-slate-500">Auto-restart limit reached</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => { setWatchdogCountdown(null); if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current); hardRefresh(); }} variant="outline" className="text-xs">
                  Restart now
                </Button>
                {watchdogCountdown !== null && !watchdogDisabled && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-500 hover:text-slate-300"
                    onClick={() => {
                      setWatchdogDisabled(true);
                      setWatchdogCountdown(null);
                      if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
                    }}
                  >
                    Stop watchdog
                  </Button>
                )}
                {errorMsg?.includes("cross-origin isolation") && (
                  <Button size="sm" variant="outline" className="text-xs cursor-help" disabled>
                    Use Sandpack
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex items-center justify-center overflow-auto bg-[#0d0d14] p-2">
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full rounded-lg border-0"
              title="Preview"
            />
          ) : (
            <div className="text-slate-600 text-xs">
              {status === "idle" ? "Ready to start" : "Loading..."}
            </div>
          )}
        </div>

        <AnimatePresence>
          {showConsole && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 200 }}
              exit={{ height: 0 }}
              className="overflow-hidden border-t border-white/[0.06] bg-black/40 shrink-0"
            >
              <div className="p-2 font-mono text-xs text-slate-400 h-full overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="truncate">{log}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default WebContainerPreview;
