import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/input";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClass, "min-h-24 resize-y py-2", className)}
      {...props}
    />
  );
}
