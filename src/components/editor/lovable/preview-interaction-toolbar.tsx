
import { useCallback,useEffect,useRef,useState } from "react";
import {
MousePointer,MessageSquarePlus,Terminal,RefreshCw,
Maximize2,Minimize2,Frame,Monitor,Smartphone,Tablet,Pencil,
Type,ChevronRight,Undo2,Redo2,MoreHorizontal,
} from "lucide-react";
import {
Tooltip,TooltipContent,TooltipProvider,TooltipTrigger,
} from "@/components/ui/tooltip";
import {
DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface LovablePreviewInteractionToolbarProps {
  visualEdit?: boolean;
  visualEditDisabled?: boolean;
  onVisualEditToggle?: () => void;
  /** Discrete edit-text mode (inline text) — optional; falls back to visual edit */
  editTextMode?: boolean;
  onEditTextToggle?: () => void;
  commentPinMode?: boolean;
  onCommentPinToggle?: () => void;
  annotationsEnabled?: boolean;
  onAnnotationsToggle?: () => void;
  onCaptureAnnotate?: () => void;
  showConsole?: boolean;
  onConsoleToggle?: () => void;
  onRefresh?: () => void;
  previewFullscreen?: boolean;
  onFullscreenToggle?: () => void;
  showFrame?: boolean;
  onFrameToggle?: () => void;
  device?: "desktop" | "mobile" | "tablet";
  onDeviceChange?: (device: "desktop" | "mobile" | "tablet") => void;
  /** Expandable tray: annotation undo/redo/clear */
  annotationCount?: number;
  onAnnotationUndo?: () => void;
  onAnnotationRedo?: () => void;
  onAnnotationClear?: () => void;
  canAnnotationUndo?: boolean;
  canAnnotationRedo?: boolean;
  /** Multi-select tray */
  selectionCount?: number;
  onClearSelections?: () => void;
  onAskAboutSelections?: () => void;
  /** Pending visual edits */
  pendingChangeCount?: number;
  onClearPendingChanges?: () => void;
  onSendPendingChanges?: () => void;
  /** Unread comments */
  unreadCommentCount?: number;
  onViewComments?: () => void;
  onDismissCommentsBanner?: () => void;
  /** Lovable dump: “Reverting to earlier version...” tray */
  reverting?: boolean;
  onDismissReverting?: () => void;
  onHide?: () => void;
  className?: string;
}

const STORAGE_KEY = "lifemark-preview-toolbar-pos";

/**
 * Lovable-parity floating glass preview toolbar — top-center, draggable,
 * minimize, discrete Select / Edit text / Annotate / Comment + expandable trays.
 */
export function LovablePreviewInteractionToolbar({
  visualEdit = false,
  visualEditDisabled = false,
  onVisualEditToggle,
  editTextMode = false,
  onEditTextToggle,
  commentPinMode = false,
  onCommentPinToggle,
  annotationsEnabled = false,
  onAnnotationsToggle,
  onCaptureAnnotate,
  showConsole = false,
  onConsoleToggle,
  onRefresh,
  previewFullscreen = false,
  onFullscreenToggle,
  showFrame = true,
  onFrameToggle,
  device = "desktop",
  onDeviceChange,
  annotationCount = 0,
  onAnnotationUndo,
  onAnnotationRedo,
  onAnnotationClear,
  canAnnotationUndo = false,
  canAnnotationRedo = false,
  selectionCount = 0,
  onClearSelections,
  onAskAboutSelections,
  pendingChangeCount = 0,
  onClearPendingChanges,
  onSendPendingChanges,
  unreadCommentCount = 0,
  onViewComments,
  onDismissCommentsBanner,
  reverting = false,
  onDismissReverting,
  onHide,
  className,
}: LovablePreviewInteractionToolbarProps) {
  const [minimized, setMinimized] = useState(false);
  const [toolbarTheme, setToolbarTheme] = useState<"auto" | "light" | "dark">("auto");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // Single-pill content swap (reference structure): the pill's WIDTH animates
  // to fit whichever content is active — tools row or a contextual tray —
  // measured from the live content after each swap.
  const contentRef = useRef<HTMLDivElement>(null);
  const [pillWidth, setPillWidth] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (typeof parsed.x === "number" && typeof parsed.y === "number") setPos(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistPos = useCallback((next: { x: number; y: number }) => {
    setPos(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, [data-no-drag]")) return;
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect();
    const origX = pos?.x ?? rect.left - (parentRect?.left ?? 0);
    const origY = pos?.y ?? rect.top - (parentRect?.top ?? 0);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    persistPos({
      x: Math.max(8, dragRef.current.origX + dx),
      y: Math.max(8, dragRef.current.origY + dy),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const btn = (active: boolean, disabled = false) =>
    cn(
      "relative flex size-8 items-center justify-center rounded-full outline-none transition-colors duration-150",
      "focus-visible:ring-2 focus-visible:ring-[#5E89F2] focus-visible:ring-inset",
      disabled
        ? "opacity-40 cursor-not-allowed text-[var(--fg-quaternary)]"
        : active
        ? "bg-[#2F6FED] text-white border border-[#5E89F2]/60"
        : "text-[#1B1B1B] dark:text-[var(--fg-primary)] hover:bg-black/5 dark:hover:bg-white/10",
    );

  // One active tray at a time, swapped INSIDE the pill (priority: an
  // in-flight revert beats everything; then pending edits awaiting Send;
  // then live selection count; then annotation controls; then comments).
  type ActiveTray = "reverting" | "pending" | "selection" | "annotation" | "comments" | null;
  const activeTray: ActiveTray = reverting
    ? "reverting"
    : pendingChangeCount > 0
      ? "pending"
      : selectionCount > 0
        ? "selection"
        : annotationsEnabled
          ? "annotation"
          : unreadCommentCount > 0
            ? "comments"
            : null;

  // Re-measure the pill's content whenever what it shows changes.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // scrollWidth of the content row + the pill's own 8px padding
    const next = Math.ceil(el.scrollWidth) + 8;
    setPillWidth((prev) => (prev === next ? prev : next));
  }, [activeTray, minimized, selectionCount, unreadCommentCount, annotationCount, pendingChangeCount, visualEdit, editTextMode, commentPinMode]);

  const positionStyle = pos
    ? { left: pos.x, top: pos.y, transform: "none" as const }
    : { left: "50%", bottom: 16, transform: "translateX(-50%)" as const };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={shellRef}
        data-preview-toolbar
        className={cn("pointer-events-auto absolute z-40", className)}
        style={positionStyle}
      >
        <div
          className={cn(
            "relative overflow-hidden text-[#1B1B1B] dark:text-[var(--fg-primary)]",
            toolbarTheme === "light" && "bg-white/80 text-[#1B1B1B]",
            toolbarTheme === "dark" && "bg-[#171717]/85 !text-white",
            toolbarTheme === "auto" && "bg-white/[0.62] dark:bg-black/55",
            "shadow-[0_4px_4px_-2px_rgba(0,0,0,0.04),0_2px_2px_-1px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.12),inset_0_0.5px_0_rgba(255,255,255,0.24)]",
            "backdrop-blur-md backdrop-saturate-[1.4]",
            "rounded-full transition-[width,height] duration-200",
          )}
          style={{
            height: 40,
            width: pillWidth ?? undefined,
            transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div
            role="toolbar"
            aria-label="Preview interactions"
            tabIndex={-1}
            ref={contentRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative flex w-max cursor-grab touch-none items-center gap-1 p-1 select-none active:cursor-grabbing"
          >
            {!minimized && activeTray === "annotation" ? (
              <TrayContent icon={<Pencil className="size-4" />} label="Annotation" accent>
                <TrayBtn disabled={!canAnnotationUndo} onClick={onAnnotationUndo} label="Undo">
                  <Undo2 className="size-3.5" />
                </TrayBtn>
                <TrayBtn disabled={!canAnnotationRedo} onClick={onAnnotationRedo} label="Redo">
                  <Redo2 className="size-3.5" />
                </TrayBtn>
                <TrayTextBtn onClick={onAnnotationClear}>Clear</TrayTextBtn>
                <TrayTextBtn onClick={onAnnotationsToggle}>Done</TrayTextBtn>
              </TrayContent>
            ) : !minimized && activeTray === "selection" ? (
              <TrayContent icon={<MousePointer className="size-4" />} label={`${selectionCount} selection${selectionCount === 1 ? "" : "s"}`} accent>
                <TrayTextBtn onClick={onClearSelections}>Clear</TrayTextBtn>
                {onAskAboutSelections && <TrayTextBtn primary onClick={onAskAboutSelections}>Ask AI</TrayTextBtn>}
              </TrayContent>
            ) : !minimized && activeTray === "pending" ? (
              <TrayContent icon={<Type className="size-4" />} label="Pending changes" accent>
                <TrayTextBtn onClick={onClearPendingChanges}>Clear</TrayTextBtn>
                <TrayTextBtn primary onClick={onSendPendingChanges}>Send</TrayTextBtn>
              </TrayContent>
            ) : !minimized && activeTray === "comments" ? (
              <TrayContent
                icon={<MessageSquarePlus className="size-4" />}
                label={`You have ${unreadCommentCount} unread comment${unreadCommentCount === 1 ? "" : "s"}`}
              >
                <TrayTextBtn onClick={onDismissCommentsBanner}>Close</TrayTextBtn>
                <TrayTextBtn primary onClick={onViewComments}>View</TrayTextBtn>
              </TrayContent>
            ) : !minimized && activeTray === "reverting" ? (
              <TrayContent icon={<RefreshCw className="size-4 animate-spin" />} label="Reverting to earlier version...">
                <TrayTextBtn onClick={onDismissReverting}>Close</TrayTextBtn>
              </TrayContent>
            ) : minimized ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Expand toolbar"
                    data-no-drag
                    onClick={() => setMinimized(false)}
                    className={btn(false)}
                  >
                    <MousePointer className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Expand toolbar</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <div className="relative flex items-center gap-1" data-no-drag>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Select elements"
                        aria-pressed={visualEdit && !editTextMode}
                        disabled={visualEditDisabled}
                        onClick={onVisualEditToggle}
                        className={btn(visualEdit && !editTextMode, visualEditDisabled)}
                      >
                        <MousePointer className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {visualEditDisabled
                        ? "Visual edits disabled for version preview"
                        : "Select elements"}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Edit text inline"
                        aria-pressed={editTextMode}
                        disabled={visualEditDisabled}
                        onClick={() => {
                          if (onEditTextToggle) onEditTextToggle();
                          else onVisualEditToggle?.();
                        }}
                        className={btn(editTextMode, visualEditDisabled)}
                      >
                        <Type className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Edit text inline</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Draw annotation"
                        aria-pressed={annotationsEnabled}
                        onClick={() => onAnnotationsToggle?.()}
                        className={btn(annotationsEnabled)}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Draw annotation</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Add a comment"
                        aria-pressed={commentPinMode}
                        onClick={onCommentPinToggle}
                        className={btn(commentPinMode)}
                      >
                        <MessageSquarePlus className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Add a comment</TooltipContent>
                  </Tooltip>
                </div>

                <span aria-hidden className="mx-0.5 h-6 w-px bg-black/10 dark:bg-white/15" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Toolbar options"
                      data-no-drag
                      className={btn(false)}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        setPos(null);
                        try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
                      }}
                      className="text-xs gap-2"
                    >
                      <Frame className="size-3.5" /> Dock bottom center
                    </DropdownMenuItem>
                    {(["auto", "light", "dark"] as const).map((theme) => (
                      <DropdownMenuItem key={theme} onClick={() => setToolbarTheme(theme)} className="text-xs gap-2 pl-7">
                        <span className="flex-1 capitalize">{theme} theme</span>
                        {toolbarTheme === theme && <span className="size-1.5 rounded-full bg-[#2F6FED]" />}
                      </DropdownMenuItem>
                    ))}
                    {onCaptureAnnotate && (
                      <DropdownMenuItem onClick={onCaptureAnnotate} className="text-xs gap-2">
                        <Pencil className="size-3.5" />
                        Capture & annotate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={onConsoleToggle} className="text-xs gap-2">
                      <Terminal className="size-3.5" />
                      Console {showConsole ? "(on)" : ""}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onRefresh} className="text-xs gap-2">
                      <RefreshCw className="size-3.5" />
                      Refresh
                    </DropdownMenuItem>
                    {onFullscreenToggle && (
                      <DropdownMenuItem onClick={onFullscreenToggle} className="text-xs gap-2">
                        {previewFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                        {previewFullscreen ? "Exit fullscreen" : "Fullscreen"}
                      </DropdownMenuItem>
                    )}
                    {device !== "desktop" && onFrameToggle && (
                      <DropdownMenuItem onClick={onFrameToggle} className="text-xs gap-2">
                        <Frame className="size-3.5" />
                        Device frame {showFrame ? "(on)" : ""}
                      </DropdownMenuItem>
                    )}
                    {onDeviceChange && (
                      <>
                        <DropdownMenuItem onClick={() => onDeviceChange("desktop")} className="text-xs gap-2">
                          <Monitor className="size-3.5" /> Desktop
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDeviceChange("tablet")} className="text-xs gap-2">
                          <Tablet className="size-3.5" /> Tablet
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDeviceChange("mobile")} className="text-xs gap-2">
                          <Smartphone className="size-3.5" /> Mobile
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => setMinimized(true)} className="text-xs gap-2">
                      <Minimize2 className="size-3.5" /> Minimize toolbar
                    </DropdownMenuItem>
                    {onHide && (
                      <DropdownMenuItem onClick={onHide} className="text-xs gap-2">
                        <ChevronRight className="size-3.5" /> Hide toolbar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Minimize toolbar"
                      data-no-drag
                      onClick={() => setMinimized(true)}
                      className={btn(false)}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Minimize toolbar</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

      </div>
    </TooltipProvider>
  );
}

/** Contextual tray content rendered INSIDE the pill (content swap; the pill
 *  itself supplies the glass background and animates its width to fit). */
function TrayContent({
  icon,
  label,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-max items-center gap-2 pr-0.5" data-no-drag>
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
          accent
            ? "border-[0.5px] border-[#5E89F2] bg-[#2F6FED] text-white"
            : "text-[#1B1B1B] dark:text-[var(--fg-primary)]",
        )}
      >
        {icon}
      </span>
      <span className="shrink-0 pr-1 text-sm font-normal whitespace-nowrap text-[#1B1B1B] dark:text-[var(--fg-primary)]">
        {label}
      </span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function TrayBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-black/15 text-[#1B1B1B] dark:text-[var(--fg-primary)] transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function TrayTextBtn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center rounded-full px-3 text-sm font-normal whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-[0.5px] border-[#5E89F2] bg-[#2F6FED] text-white hover:bg-[#2F6FED]/90"
          : "border border-black/15 text-[#1B1B1B] dark:text-[var(--fg-primary)] hover:bg-black/10",
      )}
    >
      {children}
    </button>
  );
}
