
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { modKeyLabel } from "./shortcut-labels";

interface LovableMessageEditInlineProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function LovableMessageEditInline({ value, onChange, onSubmit, onCancel }: LovableMessageEditInlineProps) {
  return (
    <div className="mt-2 space-y-1.5 w-full">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="text-xs bg-muted/50 border-white/10 resize-none min-h-[60px]"
        autoFocus
      />
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-6 text-xs px-2 bg-violet-600 hover:bg-violet-500 text-white" onClick={onSubmit}>
          Revert and resend
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-[9px] text-muted-foreground/45 ml-auto tabular-nums">
          {modKeyLabel()}↵ · Esc
        </span>
      </div>
    </div>
  );
}
