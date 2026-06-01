import { useState } from "react";
import { 
  useListLabels, 
  getListLabelsQueryKey, 
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  Label
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Tags, Plus, Edit2, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LabelBadge } from "@/components/labels/label-badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function LabelsPage() {
  const { data: labels = [], isLoading } = useListLabels({ query: { queryKey: getListLabelsQueryKey() } });
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formData, setFormData] = useState({ name: "", color: "#3b82f6", description: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();

  const handleOpenCreate = () => {
    setEditingLabel(null);
    setFormData({ name: "", color: "#3b82f6", description: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (label: Label) => {
    setEditingLabel(label);
    setFormData({ 
      name: label.name, 
      color: label.color || "#3b82f6", 
      description: label.description || "" 
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    try {
      if (editingLabel) {
        await updateLabel.mutateAsync({
          id: editingLabel.id,
          data: {
            name: formData.name,
            color: formData.color,
            description: formData.description || null
          }
        });
        toast({ title: "Label updated" });
      } else {
        await createLabel.mutateAsync({
          data: {
            name: formData.name,
            color: formData.color,
            description: formData.description || undefined
          }
        });
        toast({ title: "Label created" });
      }
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      setIsDialogOpen(false);
    } catch (e) {
      toast({ title: "Error saving label", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this label?")) return;
    try {
      await deleteLabel.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      toast({ title: "Label deleted" });
    } catch (e) {
      toast({ title: "Error deleting label", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background selection:bg-primary/10">
      <div className="max-w-4xl mx-auto p-8 lg:p-12 space-y-10">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Tags className="w-7 h-7 text-muted-foreground" />
              Manage Labels
            </h1>
            <p className="text-muted-foreground text-sm">
              Organize and categorize your inbox with custom tags.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2 shadow-sm rounded-xl h-10 px-5">
            <Plus className="w-4 h-4" />
            Create Label
          </Button>
        </div>

        <div className="bg-card rounded-3xl border border-border/60 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-center gap-5">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-muted/50 border border-border/50">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: label.color || '#888' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <LabelBadge label={label} size="md" />
                        {label.isSystem && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-[4px]">
                            <ShieldAlert className="w-3 h-3" />
                            System
                          </span>
                        )}
                      </div>
                      {label.description && (
                        <p className="text-sm text-muted-foreground">{label.description}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right flex flex-col items-end">
                      <p className="text-lg font-semibold tabular-nums text-foreground">{label.emailCount}</p>
                      <p className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider">Emails</p>
                    </div>
                    
                    <div className="flex items-center gap-1 border-l border-border/50 pl-4 h-10">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(label)} disabled={label.isSystem} className="rounded-full w-8 h-8 text-muted-foreground hover:text-foreground">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(label.id)} disabled={label.isSystem} className="rounded-full w-8 h-8 hover:text-destructive hover:bg-destructive/10 text-muted-foreground">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {labels.length === 0 && (
                <div className="p-16 text-center text-muted-foreground flex flex-col items-center">
                  <Tags className="w-10 h-10 mb-4 opacity-20" />
                  <p className="text-sm font-medium">No labels found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'Edit Label' : 'Create Label'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <UILabel htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">Name</UILabel>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Invoices"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <UILabel htmlFor="color" className="text-xs uppercase tracking-wider text-muted-foreground">Color</UILabel>
              <div className="flex gap-3">
                <div className="relative overflow-hidden rounded-xl h-10 w-16 border border-input shrink-0 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="absolute -inset-2 w-[200%] h-[200%] cursor-pointer"
                  />
                </div>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 font-mono uppercase h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <UILabel htmlFor="description" className="text-xs uppercase tracking-wider text-muted-foreground">Description <span className="text-muted-foreground/50 lowercase normal-case">(optional)</span></UILabel>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What is this label for?"
                className="h-10 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.name.trim() || createLabel.isPending || updateLabel.isPending} className="rounded-xl px-6">
              Save Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
