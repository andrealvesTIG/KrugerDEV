import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useIntakeGovernanceQuestions,
  useCreateIntakeGovernanceQuestion,
  useUpdateIntakeGovernanceQuestion,
  useDeleteIntakeGovernanceQuestion,
} from "@/hooks/use-intake-governance-questions";
import type { IntakeGovernanceQuestion, IntakeGovernanceCategory } from "@shared/schema";

interface Props {
  intakeId: number;
  category: IntakeGovernanceCategory;
  readOnly?: boolean;
}

const CATEGORY_LABELS: Record<IntakeGovernanceCategory, { title: string; description: string; questionHeader: string; addLabel: string }> = {
  architecture: {
    title: "Architecture Questionnaire",
    description: "Architecture review questions for this intake. Add rows and answer Yes / No.",
    questionHeader: "Questions from Architecture",
    addLabel: "New Architecture Initiative",
  },
  cybersecurity: {
    title: "Cybersecurity Questionnaire",
    description: "Cybersecurity review questions for this intake. Add rows and answer Yes / No.",
    questionHeader: "Questions from Cybersecurity",
    addLabel: "New Cybersecurity Initiative",
  },
};

export function IntakeGovernanceQuestionsSection({ intakeId, category, readOnly = false }: Props) {
  const { toast } = useToast();
  const labels = CATEGORY_LABELS[category];
  const { data: rows, isLoading } = useIntakeGovernanceQuestions(intakeId, category);
  const createMut = useCreateIntakeGovernanceQuestion(intakeId);
  const updateMut = useUpdateIntakeGovernanceQuestion(intakeId);
  const deleteMut = useDeleteIntakeGovernanceQuestion(intakeId);

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<{ question: string; answer: "yes" | "no" | "" }>({ question: "", answer: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ question: string; answer: "yes" | "no" | "" }>({ question: "", answer: "" });

  const startEdit = (row: IntakeGovernanceQuestion) => {
    setEditingId(row.id);
    setEditValues({
      question: row.question,
      answer: (row.answer as "yes" | "no" | null) ?? "",
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (id: number) => {
    if (!editValues.question.trim()) {
      toast({ title: "Question is required", variant: "destructive" });
      return;
    }
    updateMut.mutate(
      {
        id,
        question: editValues.question.trim(),
        answer: editValues.answer === "" ? null : editValues.answer,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err: any) => toast({ title: "Failed to save", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  const handleCreate = () => {
    if (!newRow.question.trim()) {
      toast({ title: "Question is required", variant: "destructive" });
      return;
    }
    const nextPosition = (rows ?? []).reduce((max, r) => Math.max(max, r.position ?? 0), -1) + 1;
    createMut.mutate(
      {
        category,
        question: newRow.question.trim(),
        answer: newRow.answer === "" ? null : newRow.answer,
        position: nextPosition,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setNewRow({ question: "", answer: "" });
        },
        onError: (err: any) => toast({ title: "Failed to add", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  const renderAnswerLabel = (answer: string | null) => {
    if (answer === "yes") return "Yes";
    if (answer === "no") return "No";
    return <span className="text-muted-foreground">---</span>;
  };

  return (
    <Card data-testid={`card-intake-governance-${category}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding((v) => !v)}
            data-testid={`button-new-governance-${category}`}
          >
            <Plus className="h-4 w-4 mr-1" />
            {labels.addLabel}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`table-intake-governance-${category}`}>
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">{labels.questionHeader}</th>
                <th className="text-left px-3 py-2 font-medium w-32">Y or N</th>
                <th className="px-2 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && !adding && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    No questions yet.{!readOnly && ` Click "${labels.addLabel}" to add one.`}
                  </td>
                </tr>
              )}
              {(rows ?? []).map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-b hover:bg-muted/30" data-testid={`row-governance-${category}-${row.id}`}>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          value={editValues.question}
                          onChange={(e) => setEditValues({ ...editValues, question: e.target.value })}
                          className="h-8"
                          data-testid={`input-edit-question-${row.id}`}
                        />
                      ) : (
                        row.question
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Select
                          value={editValues.answer || "__none__"}
                          onValueChange={(v) =>
                            setEditValues({ ...editValues, answer: v === "__none__" ? "" : (v as "yes" | "no") })
                          }
                        >
                          <SelectTrigger className="h-8 w-24" data-testid={`select-edit-answer-${row.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">---</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        renderAnswerLabel(row.answer)
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {!readOnly && isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(row.id)} data-testid={`button-save-${row.id}`}>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} data-testid={`button-cancel-${row.id}`}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!readOnly && !isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)} data-testid={`button-edit-${row.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(row.id)} data-testid={`button-delete-${row.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {adding && !readOnly && (
                <tr className="border-b bg-muted/20" data-testid={`row-new-governance-${category}`}>
                  <td className="px-3 py-2">
                    <Input
                      value={newRow.question}
                      onChange={(e) => setNewRow({ ...newRow, question: e.target.value })}
                      className="h-8"
                      placeholder="Type the question…"
                      data-testid="input-new-question"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={newRow.answer || "__none__"}
                      onValueChange={(v) => setNewRow({ ...newRow, answer: v === "__none__" ? "" : (v as "yes" | "no") })}
                    >
                      <SelectTrigger className="h-8 w-24" data-testid="select-new-answer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">---</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate} disabled={createMut.isPending} data-testid="button-save-new">
                        {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(false)} data-testid="button-cancel-new">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
