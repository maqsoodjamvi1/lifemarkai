"use client";

/**
 * PreviewAnnotateModal
 *
 * Shown when the user clicks "Capture & Annotate" on the preview panel.
 * Displays the screenshot in a canvas overlay, lets the user draw freehand
 * arrows/boxes/text, then emits the annotated dataUrl for sending to AI.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil, Square, ArrowRight, Eraser, Send, RotateCcw, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PreviewAnnotateModalProps {
  screenshotDataUrl: string;
  onSend: (annotatedDataUrl: string, prompt: string) => void;
  onClose: () => void;
}

type Tool = "pen" | "arrow" | "rect" | "eraser";

const COLORS = ["#ff5555", "#ffaa00", "#55ff55", "#5599ff", "#ffffff", "#000000"];
const STROKE_SIZES = [2, 4, 8];

export function PreviewAnnotateModal({ screenshotDataUrl, onSend, onClose }: PreviewAnnotateModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeSize, setStrokeSize] = useState(STROKE_SIZES[1]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [prompt, setPrompt] = useState("Fix the issues I've highlighted in red on the preview.");
  const historyRef = useRef<ImageData[]>([]);

  // Load screenshot as background image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      bgRef.current = img;
      historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    };
    img.src = screenshotDataUrl;
  }, [screenshotDataUrl]);

  function getCanvasPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function saveHistory() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    historyRef.current = [...historyRef.current.slice(-20), ctx.getImageData(0, 0, canvas.width, canvas.height)];
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || historyRef.current.length <= 1) return;
    historyRef.current.pop();
    ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
  }

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    setIsDrawing(true);
    setStartPos(pos);
    saveHistory();

    if (tool === "pen" || tool === "eraser") {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [tool]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pos = getCanvasPos(e);

    if (tool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, strokeSize * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (tool === "rect" || tool === "arrow") {
      // Redraw from last history entry to show live preview
      if (historyRef.current.length > 0) {
        ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeSize;
      if (tool === "rect") {
        ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
      } else {
        // Arrow
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(pos.y - startPos.y, pos.x - startPos.x);
        const headLen = Math.max(12, strokeSize * 4);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x - headLen * Math.cos(angle - Math.PI / 6), pos.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(pos.x - headLen * Math.cos(angle + Math.PI / 6), pos.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }, [isDrawing, tool, color, strokeSize, startPos]);

  const onMouseUp = useCallback(() => {
    setIsDrawing(false);
    saveHistory();
  }, []);

  function handleSend() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSend(dataUrl, prompt);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex flex-col bg-background/95 backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
          <span className="text-sm font-semibold">Annotate Preview</span>
          <span className="text-xs text-muted-foreground">Draw on the screenshot, then send it to AI</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={undo} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Undo (Ctrl+Z)">
              <RotateCcw className="w-3 h-3" /> Undo
            </button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 shrink-0 flex-wrap">
          {/* Tools */}
          <div className="flex items-center gap-1">
            {([["pen", Pencil, "Freehand"], ["arrow", ArrowRight, "Arrow"], ["rect", Square, "Rectangle"], ["eraser", Eraser, "Eraser"]] as const).map(([t, Icon, label]) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                title={label}
                className={`p-1.5 rounded transition-colors ${tool === t ? "bg-violet-500/20 text-violet-400 border border-violet-500/40" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          {/* Colors */}
          <div className="flex items-center gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          {/* Stroke size */}
          <div className="flex items-center gap-1.5">
            {STROKE_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setStrokeSize(s)}
                className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${strokeSize === s ? "bg-muted border border-border" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Minus className="w-3 h-3" style={{ strokeWidth: s > 2 ? 3 : 1.5 }} />
              </button>
            ))}
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/10 p-4">
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className="max-w-full max-h-full object-contain shadow-2xl cursor-crosshair rounded-lg border border-border"
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Send bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-border bg-card shrink-0">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want changed…"
            className="flex-1 h-9 px-3 text-sm rounded-lg bg-muted border border-border focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
          <Button
            onClick={handleSend}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white shrink-0"
            size="sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send to AI
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
