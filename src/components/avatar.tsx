import { cn } from "@/lib/utils";

export function Avatar({
  src,
  name,
  size = 40,
  ring = false,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const initial = (name ?? "?").trim().charAt(0) || "?";
  const inner = src ? (
    <img src={src} alt={name ?? ""} loading="lazy" className="size-full rounded-full object-cover" />
  ) : (
    <div className="grid size-full place-items-center rounded-full bg-primary-soft font-bold text-primary">{initial}</div>
  );
  return (
    <div
      className={cn("shrink-0 rounded-full", ring ? "bg-gradient-ring p-[2.5px]" : "", className)}
      style={{ width: size, height: size }}
    >
      {ring ? <div className="size-full rounded-full bg-surface p-[2px]">{inner}</div> : inner}
    </div>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: Array<{ id: string; name: string; avatar_url: string | null }>; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <div className="flex -space-x-2 space-x-reverse">
      {shown.map((p) => (
        <Avatar key={p.id} src={p.avatar_url} name={p.name} size={size} className="ring-2 ring-surface" />
      ))}
    </div>
  );
}
