import { cn } from "@/lib/utils";
import { Label } from "@workspace/api-client-react";
import { X } from "lucide-react";

interface LabelBadgeProps {
  label: Pick<Label, "name" | "color">;
  onRemove?: () => void;
  className?: string;
  size?: "sm" | "md";
}

export function LabelBadge({ label, onRemove, className, size = "sm" }: LabelBadgeProps) {
  const color = label.color ?? "#6b7280";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] border border-black/5 dark:border-white/5 font-medium whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
      style={{
        backgroundColor: `${color}15`,
        color: color,
        borderColor: `${color}25`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
