import { GENRES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function GenrePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => {
        const on = value.includes(g);
        return (
          <button
            type="button"
            key={g}
            onClick={() => onChange(on ? value.filter((x) => x !== g) : [...value, g])}
            className={cn(
              "border-2 border-foreground px-3 py-1 text-xs font-bold uppercase transition-colors",
              on ? "bg-secondary text-secondary-foreground" : "bg-transparent hover:bg-muted",
            )}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}
