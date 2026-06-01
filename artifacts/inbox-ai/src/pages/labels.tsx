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
  const [formData, setFormData] = useState({ name: "", color: "#6366f1", description: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();

  const handleOpenCreate = () => {
    setEditingLabel(null);
    setFormData({ name: "", color: "#6366f1", description: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (label: Label) => {
    setEditingLabel(label);
    setFormData({ 
      name: label.name, 
      color: label.color, 
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

  const handleDelete = async (id: number) => {
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
    <div className="flex-1 overflow-y-auto bg-muted/30">
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Tags className="w-8 h-8 text-primary" />
              Manage Labels
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Create, edit, and organize the tags used to categorize your inbox.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            Create Label
          </Button>
        </div>

        <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{ backgroundColor: `${label.color}15`, color: label.color }}>
                      <Tags className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <LabelBadge label={label} size="md" />
                        {label.isSystem && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">
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
                  
                  <div className="flex items-center gap-4">
                    <div className="text-center px-4">
                      <p className="text-xl font-semibold">{label.emailCount}</p>
                      <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Emails</p>
                    </div>
                    
                    <div className="flex items-center gap-2 border-l border-border/50 pl-4">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(label)} disabled={label.isSystem}>
                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(label.id)} disabled={label.isSystem} className="hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {labels.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  No labels exist yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'Edit Label' : 'Create Label'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <UILabel htmlFor="name">Name</UILabel>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Invoices"
              />
            </div>
            <div className="grid gap-2">
              <UILabel htmlFor="color">Color</UILabel>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 font-mono uppercase"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <UILabel htmlFor="description">Description (Optional)</UILabel>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What is this label for?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!formData.name.trim() || createLabel.isPending || updateLabel.isPending}>
              Save Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
