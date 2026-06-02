import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
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
   * "Create <name>" action that creates the Gmail label and applies it.
   */
  onCreate?: (name: string) => void | Promise<void>;
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

  const reset = () => {
    setOpen(false);
    setQuery("");
  };

  const select = (labelId: string, onSelect: (id: string) => void) => {
    reset();
    onSelect(labelId);
  };

  const create = (name: string) => {
    reset();
    void onCreate?.(name);
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
                  onSelect={() => create(trimmed)}
                  className="rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-2 shrink-0" />
                  <span className="truncate">Create “{trimmed}”</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
