import { Search } from "lucide-react";

export function AdminSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="mb-3 flex h-11 items-center gap-2 rounded-full border border-input bg-surface px-4">
      <Search className="size-4 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-full w-full min-w-0 bg-transparent text-sm outline-none" />
    </label>
  );
}

export const likeTerm = (s: string) => `%${s.trim().replace(/[%,()]/g, "")}%`;
