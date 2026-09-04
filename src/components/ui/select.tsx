import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/input";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(inputClass, className)} {...props} />;
}
