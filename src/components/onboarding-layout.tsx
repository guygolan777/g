import * as React from "react";
import { cn } from "@/lib/utils";

export function OnboardingLayout({ step, title, subtitle, children, footer }: { step: 1 | 2 | 3; title: string; subtitle?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
      <div className="mt-6 flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full", s <= step ? "bg-gradient-brand" : "bg-muted")} />
        ))}
      </div>
      <p className="mt-4 text-sm font-semibold text-primary">שלב {step} מתוך 3</p>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      <div className="mt-6 flex-1 pb-6">{children}</div>
      <div className="sticky bottom-0 -mx-5 border-t border-border bg-background/95 px-5 py-3 pb-safe backdrop-blur">{footer}</div>
    </main>
  );
}
