import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: React.ComponentProps<"button"> & {
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      data-slot="switch"
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border transition-colors",
        checked ? "bg-primary" : "bg-elevated",
        disabled && "opacity-50",
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-surface shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
