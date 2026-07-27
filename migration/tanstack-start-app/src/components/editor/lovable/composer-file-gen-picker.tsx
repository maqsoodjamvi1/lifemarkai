
import { AnimatePresence, motion } from "framer-motion";
import { FileDown, Loader2 } from "lucide-react";

export type LovableFileGenFormat = "md" | "csv" | "json" | "txt" | "html" | "pdf" | "xlsx" | "pptx";

export const LOVABLE_FILE_GEN_FORMATS: Array<{
  id: LovableFileGenFormat;
  label: string;
  binary?: boolean;
}> = [
  { id: "md", label: "Markdown document" },
  { id: "csv", label: "CSV spreadsheet" },
  { id: "json", label: "JSON data" },
  { id: "txt", label: "Plain text" },
  { id: "html", label: "HTML page" },
  { id: "pdf", label: "PDF document", binary: true },
  { id: "xlsx", label: "Excel spreadsheet", binary: true },
  { id: "pptx", label: "PowerPoint deck", binary: true },
];

interface LovableComposerFileGenPickerProps {
  open: boolean;
  busy: boolean;
  disabled: boolean;
  input: string;
  /** When false, binary formats (pdf/xlsx/pptx) that need analyze sandbox are disabled. */
  binaryEnabled?: boolean;
  binaryDisabledReason?: string | null;
  onToggle: () => void;
  onGenerate: (format: LovableFileGenFormat) => void;
}

/** Lovable-parity "generate prompt as file" picker beside the send button. */
export function LovableComposerFileGenPicker({
  open,
  busy,
  disabled,
  input,
  binaryEnabled = true,
  binaryDisabledReason = null,
  onToggle,
  onGenerate,
}: LovableComposerFileGenPickerProps) {
  const promptLooksLikeFile = /\b(as a file|\.md|\.csv|\.json|\.txt|\.html|csv|json|markdown|download|export|report|document)\b/i.test(
    input,
  );

  return (
    <div className="relative flex-shrink-0">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full right-0 mb-2 z-50 w-52 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-3 py-1.5 border-b border-border">
              <span className="text-[10px] font-semibold text-muted-foreground">Generate prompt as file</span>
            </div>
            {LOVABLE_FILE_GEN_FORMATS.map((fmt) => {
              const binaryBlocked = !!fmt.binary && !binaryEnabled;
              return (
              <button
                key={fmt.id}
                disabled={binaryBlocked}
                title={binaryBlocked ? (binaryDisabledReason ?? "Binary file generation needs an analyze sandbox") : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (binaryBlocked) return;
                  onGenerate(fmt.id);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  binaryBlocked
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-muted"
                }`}
              >
                <span className="font-mono text-[10px] text-violet-400 w-9 shrink-0">.{fmt.id}</span>
                <span className="text-muted-foreground flex-1">{fmt.label}</span>
                {fmt.binary && (
                  <span className={`text-[9px] shrink-0 ${binaryBlocked ? "text-muted-foreground" : "text-amber-400/80"}`}>
                    {binaryBlocked ? "unavailable" : "sandbox"}
                  </span>
                )}
              </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-colors ${
          open || busy
            ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
            : promptLooksLikeFile
              ? "border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
              : "border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title="Generate as file — .md/.csv/.json/.txt/.html or binary .pdf/.xlsx/.pptx via analyze sandbox (1 credit)"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
