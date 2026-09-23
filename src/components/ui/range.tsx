import { cn } from "@/lib/utils";

const TRACK =
  "pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-soft [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface";

/** Single-thumb slider with a filled track. */
export function Slider({
  min,
  max,
  value,
  onChange,
  className,
  label,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  className?: string;
  label?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn("relative h-8", className)} dir="ltr">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      <div className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(TRACK, "w-full")}
      />
    </div>
  );
}

/** Two-thumb range slider. */
export function DualSlider({
  min,
  max,
  value,
  onChange,
  className,
  label,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  className?: string;
  label?: string;
}) {
  const [lo, hi] = value;
  const p = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className={cn("relative h-8", className)} dir="ltr">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
      <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${p(lo)}%`, right: `${100 - p(hi)}%` }} />
      <input
        type="range"
        aria-label={label ? `${label} — מינימום` : undefined}
        min={min}
        max={max}
        value={lo}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        className={cn(TRACK, "w-full")}
      />
      <input
        type="range"
        aria-label={label ? `${label} — מקסימום` : undefined}
        min={min}
        max={max}
        value={hi}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        className={cn(TRACK, "w-full")}
      />
    </div>
  );
}
