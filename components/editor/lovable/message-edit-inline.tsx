"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
        className="text-xs bg-muted/50 border-white/10 resize-none min-h-[60px]"
        autoFocus
      />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-6 text-xs px-2 bg-violet-600 hover:bg-violet-500 text-white" onClick={onSubmit}>
          Regenerate
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
