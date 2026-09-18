import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "field-input h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-fg outline-none placeholder:text-subtle disabled:opacity-50";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />;
}
