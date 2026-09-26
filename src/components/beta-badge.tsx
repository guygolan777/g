import { cn } from "@/lib/utils";

/** "Beta" tag shown next to the logo while the app is in beta. */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn(
        "ms-2 inline-block rounded-full bg-primary-soft px-2 py-0.5 align-super font-sans text-[0.7rem] leading-none font-bold tracking-wide text-primary uppercase",
        className,
      )}
    >
      Beta
    </span>
  );
}
