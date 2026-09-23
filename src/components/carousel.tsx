import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal RTL carousel. Cards are sized so ~1.5 are visible
 * (≈219px on a 384px-wide screen).
 */
export function Carousel({
  title,
  moreTo,
  moreSearch,
  children,
  className,
  itemClassName = "w-[58vw] max-w-[230px]",
}: {
  title?: React.ReactNode;
  moreTo?: string;
  moreSearch?: Record<string, string>;
  children: React.ReactNode[];
  className?: string;
  itemClassName?: string;
}) {
  if (!children.length) return null;
  return (
    <section className={cn("mt-6", className)}>
      {(title || moreTo) && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          {moreTo && (
            <Link to={moreTo} search={moreSearch as never} className="flex items-center gap-1 text-sm font-semibold text-primary">
              הצג הכול
              <ChevronLeft className="size-4" />
            </Link>
          )}
        </div>
      )}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none" dir="rtl">
        {children.map((child, i) => (
          <div key={i} className={cn("shrink-0 snap-start", itemClassName)}>
            {child}
          </div>
        ))}
      </div>
    </section>
  );
}
