
import type { MutableRefObject } from "react";
import { Check,ChevronDown } from "lucide-react";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
CHAT_MODEL_OPTIONS,
getOpenRouterModelLabel,
type OpenRouterModelId,
} from "@/lib/ai/openrouter-models";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/editor-intelligence";
import type { EditorMode } from "@/components/editor/editor-layout";

function modelPickerRank(model: (typeof CHAT_MODEL_OPTIONS)[number]): number {
  if (model.free) return 0;
  if (model.fast && !model.creditMultiplier) return 1;
  if (model.category === "coding" && !model.creditMultiplier) return 2;
  if (model.creditMultiplier && model.creditMultiplier >= 2) return 5;
  return 3;
}

// LAZY on purpose — do NOT hoist this back to a module-level constant.
// Iterating CHAT_MODEL_OPTIONS at module-init crashed production SSR on every
// request ("CHAT_MODEL_OPTIONS is not iterable"): the bundler's chunk ordering
// evaluated this module before the openrouter-models chunk had initialized.
// Computing on first render is always safe; dev never reproduces the crash.
let lovableAiModelsCache: Array<(typeof CHAT_MODEL_OPTIONS)[number]> | null = null;
export function getLovableAiModels(): Array<(typeof CHAT_MODEL_OPTIONS)[number]> {
  if (!lovableAiModelsCache) {
    lovableAiModelsCache = [...CHAT_MODEL_OPTIONS].sort(
      (a, b) => modelPickerRank(a) - modelPickerRank(b) || a.label.localeCompare(b.label),
    );
  }
  return lovableAiModelsCache;
}

interface LovableComposerModelMenuProps {
  mode: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  multiAgent: boolean;
  onMultiAgentChange: (value: boolean) => void;
  modelManuallySelectedRef: MutableRefObject<boolean>;
  selectedModel: OpenRouterModelId;
  onSelectModel: (model: OpenRouterModelId, manual: boolean) => void;
  autoModel: OpenRouterModelId;
  activeModelLabel: string;
}

/** Lovable-parity overflow menu: Chat/Build/Plan/Patch/Agent + Team toggle + model picker. */
export function LovableComposerModelMenu({
  mode,
  onModeChange,
  multiAgent,
  onMultiAgentChange,
  modelManuallySelectedRef,
  selectedModel,
  onSelectModel,
  autoModel,
  activeModelLabel,
}: LovableComposerModelMenuProps) {
  const showIndicator =
    mode === "chat" || mode === "agent" || mode === "patch" || modelManuallySelectedRef.current;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 border border-border/70"
          title={`Modes & model — ${mode === "patch" ? "Quick Edit" : mode.charAt(0).toUpperCase() + mode.slice(1)} · ${modelManuallySelectedRef.current ? "" : "Auto: "}${activeModelLabel}`}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          {showIndicator && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52 p-1">
        <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("chat")}>
          <div className="w-4 h-4 flex items-center justify-center">{mode === "chat" && <Check className="w-3 h-3" />}</div>
          <div>
            <p className="font-medium">Chat</p>
            <p className="text-[10px] text-muted-foreground">Q&amp;A without code changes</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("build")}>
          <div className="w-4 h-4 flex items-center justify-center">{mode === "build" && <Check className="w-3 h-3" />}</div>
          <div>
            <p className="font-medium">Build</p>
            <p className="text-[10px] text-muted-foreground">Make changes directly</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("plan")}>
          <div className="w-4 h-4 flex items-center justify-center">{mode === "plan" && <Check className="w-3 h-3" />}</div>
          <div>
            <p className="font-medium">Plan</p>
            <p className="text-[10px] text-muted-foreground">Discuss before building</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("patch")}>
          <div className="w-4 h-4 flex items-center justify-center">{mode === "patch" && <Check className="w-3 h-3" />}</div>
          <div>
            <p className="font-medium">Quick Edit</p>
            <p className="text-[10px] text-muted-foreground">Small targeted patches</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("agent")}>
          <div className="w-4 h-4 flex items-center justify-center">{mode === "agent" && <Check className="w-3 h-3" />}</div>
          <div>
            <p className="font-medium">Agent</p>
            <p className="text-[10px] text-muted-foreground">Autonomous AI agent</p>
          </div>
        </DropdownMenuItem>
        <div className="h-px bg-border/60 my-1" />
        <DropdownMenuItem
          className="text-xs gap-2 py-2.5"
          onSelect={(e) => {
            e.preventDefault();
            onMultiAgentChange(!multiAgent);
          }}
        >
          <div className="w-4 h-4 flex items-center justify-center">{multiAgent && <Check className="w-3 h-3" />}</div>
          <div className="flex-1">
            <p className="font-medium flex items-center gap-1.5">
              Team
              <span className="rounded bg-fuchsia-500/15 px-1 py-px text-[9px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">MULTI-AGENT</span>
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Agent mode runs the full lens team (debate + waves) in the Intelligence panel
            </p>
          </div>
        </DropdownMenuItem>
        <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground">
          <span>Toggle with</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[10px] font-mono">Alt</kbd>
            <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[10px] font-mono">P</kbd>
          </span>
        </div>
        <div className="h-px bg-border/60 my-1" />
        <DropdownMenuItem
          onClick={() => onSelectModel(DEFAULT_CODING_MODEL as OpenRouterModelId, false)}
          className={`text-xs gap-2 py-2 ${!modelManuallySelectedRef.current ? "bg-muted" : ""}`}
        >
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {!modelManuallySelectedRef.current && <Check className="w-3 h-3 text-violet-400" />}
          </div>
          <span className="flex-1 font-medium">Auto</span>
          <span className="text-[10px] text-muted-foreground/70 flex-shrink-0 truncate max-w-[150px]">
            {getOpenRouterModelLabel(autoModel)}
          </span>
          <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25 flex-shrink-0">
            Smart
          </span>
        </DropdownMenuItem>
        {getLovableAiModels().map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onSelectModel(model.id, true)}
            className={`text-xs gap-2 py-2 ${selectedModel === model.id ? "bg-muted" : ""}`}
          >
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              {selectedModel === model.id && <Check className="w-3 h-3 text-violet-400" />}
            </div>
            <span className="flex-1 font-medium">{model.label}</span>
            <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{model.badge}</span>
            {model.free && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex-shrink-0">
                Free
              </span>
            )}
            {model.best && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                Best
              </span>
            )}
            {model.fast && !model.best && !model.free && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25 flex-shrink-0">
                Fast
              </span>
            )}
            {model.creditMultiplier && model.creditMultiplier >= 2 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/25 flex-shrink-0">
                Premium
              </span>
            )}
            {model.new && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex-shrink-0">
                New
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
