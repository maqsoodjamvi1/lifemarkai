"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Rewind, Play, Pause, FastForward, SkipBack, SkipForward,
  Clock, Loader2, ChevronDown, Film, FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";

const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> }
);

interface Snapshot {
  id: string;
  created_at: string;
  prompt?: string;
  files_snapshot: { path: string; content: string }[];
}

interface TimeLapsePanelProps {
  projectId: string;
}

const PLAY_SPEEDS = [0.5, 1, 2, 4] as const;
type PlaySpeed = typeof PLAY_SPEEDS[number];

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  css: "css", json: "json", md: "markdown", html: "html", sql: "sql",
};

function getLang(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return LANG_MAP[ext] ?? "plaintext";
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TimeLapsePanel({ projectId }: TimeLapsePanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileList, setFileList] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0); // index into snapshots (0 = oldest)
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { loadSnapshots(); }, [projectId]);

  async function loadSnapshots() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots?limit=30`);
      if (!res.ok) throw new Error();
      const data = await res.json() as { snapshots: Snapshot[] };
      const snaps = [...(data.snapshots ?? [])].reverse(); // oldest first
      setSnapshots(snaps);

      // Build union of all files across snapshots
      const paths = new Set<string>();
      for (const s of snaps) {
        for (const f of (s.files_snapshot ?? [])) paths.add(f.path);
      }
      const sorted = [...paths].sort();
      setFileList(sorted);
      if (sorted.length > 0) setSelectedFile(sorted[0]);
      setCursor(0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  // Play/pause loop
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCursor((c) => {
          if (c >= snapshots.length - 1) {
            setPlaying(false);
            return c;
          }
          return c + 1;
        });
      }, Math.round(1500 / speed));
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, snapshots.length]);

  const current = snapshots[cursor];
  const prev = snapshots[cursor > 0 ? cursor - 1 : 0];

  const beforeContent = prev?.files_snapshot?.find((f) => f.path === selectedFile)?.content ?? "";
  const afterContent = current?.files_snapshot?.find((f) => f.path === selectedFile)?.content ?? "";

  const progress = snapshots.length > 1 ? cursor / (snapshots.length - 1) : 0;

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    setPlaying(false);
    setCursor(Number(e.target.value));
  }

  function cycleSpeed() {
    const idx = PLAY_SPEEDS.indexOf(speed);
    setSpeed(PLAY_SPEEDS[(idx + 1) % PLAY_SPEEDS.length]);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading snapshots…</p>
        </div>
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Film className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-foreground">Time-Lapse</h2>
          </div>
          <p className="text-xs text-muted-foreground">Replay file evolution across snapshots</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <Film className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">Not enough snapshots yet</p>
          <p className="text-xs text-muted-foreground">
            Time-lapse appears after at least 2 AI generations. Each generation creates a snapshot automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Film className="w-4 h-4 text-purple-400" />
          <h2 className="font-semibold text-foreground">Time-Lapse</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {snapshots.length} snapshots
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Replay how files evolved through AI generations</p>
      </div>

      {/* File picker */}
      <div className="p-2 border-b border-border shrink-0 relative">
        <button
          onClick={() => setShowFileDropdown((v) => !v)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-muted/20 hover:bg-muted/30 transition-colors text-xs text-left"
        >
          <FileCode className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 font-mono truncate">{selectedFile || "Select a file…"}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
        {showFileDropdown && (
          <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-background border border-border rounded-xl shadow-2xl overflow-y-auto max-h-48">
            {fileList.map((path) => (
              <button
                key={path}
                onClick={() => { setSelectedFile(path); setShowFileDropdown(false); setCursor(0); setPlaying(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-muted/30 transition-colors truncate ${path === selectedFile ? "text-purple-400 bg-purple-500/10" : "text-foreground"}`}
              >
                {path}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Diff viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MonacoDiffEditor
          original={cursor === 0 ? "" : beforeContent}
          modified={afterContent}
          language={getLang(selectedFile)}
          theme="vs-dark"
          options={{
            renderSideBySide: false,
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 11,
            lineNumbers: "on",
            folding: false,
            wordWrap: "on",
          }}
        />
      </div>

      {/* Snapshot info */}
      {current && (
        <div className="shrink-0 px-3 py-1.5 border-t border-border bg-muted/5 flex items-center gap-2 min-h-0">
          <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground">{timeAgo(current.created_at)}</span>
          {current.prompt && (
            <span className="text-[10px] text-foreground/70 truncate flex-1">"{current.prompt.slice(0, 60)}{current.prompt.length > 60 ? "…" : ""}"</span>
          )}
          <span className="text-[10px] text-muted-foreground shrink-0">{cursor + 1}/{snapshots.length}</span>
        </div>
      )}

      {/* Timeline scrubber */}
      <div className="shrink-0 px-3 pt-2 border-t border-border">
        <div className="relative">
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={cursor}
            onChange={handleScrub}
            className="w-full h-1 accent-purple-500 cursor-pointer"
          />
          {/* Snapshot tick marks */}
          <div className="flex justify-between mt-0.5">
            {snapshots.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setCursor(i); setPlaying(false); }}
                className={`w-1 h-2.5 rounded-full transition-colors ${i === cursor ? "bg-purple-400" : "bg-muted-foreground/30 hover:bg-muted-foreground/60"}`}
                style={{ flexShrink: 0 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Playback controls */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 pb-3 pt-2">
        <button onClick={() => { setCursor(0); setPlaying(false); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setCursor((c) => Math.max(0, c - 1)); setPlaying(false); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
          <Rewind className="w-3.5 h-3.5" />
        </button>

        <Button
          size="sm"
          className="flex-1 h-8 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
          onClick={() => {
            if (cursor >= snapshots.length - 1) setCursor(0);
            setPlaying((v) => !v);
          }}
        >
          {playing ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Play</>}
        </Button>

        <button onClick={() => { setCursor((c) => Math.min(snapshots.length - 1, c + 1)); setPlaying(false); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
          <FastForward className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setCursor(snapshots.length - 1); setPlaying(false); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={cycleSpeed}
          className="px-2 py-1 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground font-mono min-w-[32px] text-center"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}
