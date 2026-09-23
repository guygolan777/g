import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl bg-card text-card-foreground shadow-soft", className)} {...props} />;
}

export { Card };
