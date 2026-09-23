import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = (props: React.ComponentProps<typeof TabsPrimitive.Root>) => <TabsPrimitive.Root dir="rtl" {...props} />;

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex w-full rounded-full bg-muted p-1", className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "flex-1 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

const TabsContent = (props: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className="mt-4 outline-none" {...props} />
);

export { Tabs, TabsList, TabsTrigger, TabsContent };
