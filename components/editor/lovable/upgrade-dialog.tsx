"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LovableUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
}

/**
 * Lovable-parity Pro gate — shown when free users tap Code tab.
 */
export function LovableUpgradeDialog({
  open,
  onOpenChange,
  feature = "Code editor",
}: LovableUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[var(--bg-accent)]/15 border border-[color:var(--border-accent)]">
              <Sparkles className="size-4 text-[var(--fg-accent)]" />
            </div>
            <DialogTitle>Upgrade to Pro</DialogTitle>
          </div>
          <DialogDescription>
            {feature} is a Pro feature. Upgrade for more credits, the full code editor,
            custom domains, and team collaboration.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button asChild className="bg-[var(--bg-accent)] hover:opacity-90 text-[var(--fg-emphasis)]">
            <Link href="/dashboard/billing">View plans</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
