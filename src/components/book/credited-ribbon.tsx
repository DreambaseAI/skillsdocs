"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The credited edition's mark on the cover: a bookmark ribbon wrapping in
 * from the fore-edge, on the owner line — the way a working library flags a
 * book it is using. The cloth says only CREDITED — the one word the cover
 * needs — and the tooltip carries the sentence (Base UI shows it on hover
 * and on keyboard focus; the trigger is a real button, so it is reachable
 * both ways).
 *
 * Skeuomorphism lives in `.cover-ribbon` (cover.css): accent-dyed cloth with
 * a sheen along its curve, a shadowed fold where it bends around the board's
 * edge, and a swallowtail cut on the free end. All of it is tokens and the
 * issue accent — the ribbon is dyed in the issue's own colours like
 * everything else on the stock.
 */
export function CreditedRibbon({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cover-ribbon">
        <span
          className={cn(
            "font-mono text-[0.6rem] font-medium tracking-[0.24em] uppercase",
            className,
          )}
        >
          Credited
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60 text-pretty">
        Skills in use in this repository, not published from it — credited to
        their authors.
      </TooltipContent>
    </Tooltip>
  );
}
