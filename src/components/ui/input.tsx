import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "field-input h-11 w-full rounded-lg border border-border bg-elevated/80 px-3 text-sm text-fg outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />;
}
