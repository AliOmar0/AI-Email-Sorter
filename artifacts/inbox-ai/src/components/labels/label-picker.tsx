import { useState, type ReactNode } from "react";
import { ChevronLeft, Plus, Check } from "lucide-react";
import { Label } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** A small curated palette offered when quick-creating a label inline. */
export const LABEL_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#64748b",
] as const;

const DEFAULT_LABEL_COLOR = "#6366f1";

export interface LabelPickerSection {
  heading: string;
  labels: Label[];
  onSelect: (labelId: string) => void;
  /** Extra classes applied to each item (e.g. destructive styling for "remove"). */
  itemClassName?: string;
  /** Shown in place of the section when it has no labels. */
  emptyText?: string;
}

interface LabelPickerProps {
  trigger: ReactNode;
  sections: LabelPickerSection[];
  align?: "start" | "center" | "end";
  /** Placeholder text for the type-to-filter input. */
  searchPlaceholder?: string;
  /**
   * When set, typing a name that matches no existing label offers a
   * "Create <name>" action. Choosing it reveals a small swatch palette so the
   * user can pick a color before the Gmail label is created and applied.
   */
  onCreate?: (name: string, color: string) => void | Promise<void>;
}

/**
 * A label menu with a type-to-filter field at the top, so accounts with many
 * labels stay fast to navigate (especially on a phone). Sections keep "add" vs
 * "remove" clearly separated while a single search filters across all of them.
 */
export function LabelPicker({
  trigger,
  sections,
  align = "end",
  searchPlaceholder = "Search labels…",
  onCreate,
}: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // When set, the picker shows the swatch palette for naming `pendingName`.
  const [pendingName, setPendingName] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setQuery("");
    setPendingName(null);
  };

  const select = (labelId: string, onSelect: (id: string) => void) => {
    reset();
    onSelect(labelId);
  };

  const create = (name: string, color: string) => {
    reset();
    void onCreate?.(name, color);
  };

  const hasAnyLabels = sections.some((s) => s.labels.length > 0);
  const trimmed = query.trim();
  // Only offer "create" when the typed text matches no existing label. An
  // includes-match implies cmdk's (fuzzier) filter also matches, so we never
  // hide a real label behind the create option.
  const matchesExisting = sections.some((s) =>
    s.labels.some((l) => l.name.toLowerCase().includes(trimmed.toLowerCase())),
  );
  const showCreate = !!onCreate && trimmed.length > 0 && !matchesExisting;

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-60 p-0 rounded-xl shadow-lg">
        {pendingName !== null ? (
          <div className="p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => setPendingName(null)}
                className="flex items-center justify-center h-6 w-6 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                aria-label="Back to labels"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground truncate">
                Color for “<span className="text-foreground font-medium">{pendingName}</span>”
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {LABEL_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => create(pendingName, color)}
                  className={cn(
                    "h-6 w-6 rounded-full ring-offset-background transition-transform hover:scale-110",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    color === DEFAULT_LABEL_COLOR &&
                      "ring-2 ring-ring ring-offset-2",
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Create label with color ${color}`}
                >
                  {color === DEFAULT_LABEL_COLOR && (
                    <Check className="w-3.5 h-3.5 text-white mx-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
        <Command>
          {(hasAnyLabels || onCreate) && (
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-10"
              value={query}
              onValueChange={setQuery}
            />
          )}
          <CommandList className="max-h-[min(60vh,320px)]">
            <CommandEmpty>No labels found.</CommandEmpty>
            {sections.map((section) => (
              <CommandGroup
                key={section.heading}
                heading={section.heading}
                className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {section.labels.length === 0 && section.emptyText ? (
                  <div className="py-2 px-2 text-xs text-muted-foreground text-center">
                    {section.emptyText}
                  </div>
                ) : (
                  section.labels.map((l) => (
                    <CommandItem
                      key={`${section.heading}-${l.id}`}
                      value={`${section.heading}-${l.name}`}
                      keywords={[l.name]}
                      onSelect={() => select(l.id, section.onSelect)}
                      className={cn("rounded-lg cursor-pointer", section.itemClassName)}
                    >
                      <div
                        className="w-2 h-2 rounded-full mr-2 shrink-0"
                        style={{ backgroundColor: l.color || "#888" }}
                      />
                      <span className="truncate">{l.name}</span>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            ))}
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={trimmed}
                  forceMount
                  onSelect={() => setPendingName(trimmed)}
                  className="rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-2 shrink-0" />
                  <span className="truncate">Create “{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
