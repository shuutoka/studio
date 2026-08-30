"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createId, type GoalStatus, type StudioProject } from "@/lib/studio";

const columns: Array<{ status: GoalStatus; label: string; color: string }> = [
  { status: "todo", label: "À faire", color: "#8f8996" },
  { status: "doing", label: "En cours", color: "#e6b35f" },
  { status: "done", label: "Terminé", color: "#58c68a" },
];

export function GoalsBoard({
  project,
  updateProject,
}: {
  project: StudioProject;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
}) {
  const [addingTo, setAddingTo] = useState<GoalStatus | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");

  function addGoal(status: GoalStatus) {
    if (!newGoalTitle.trim()) return;
    updateProject((draft) => {
      draft.goals.push({
        id: createId("goal"),
        title: newGoalTitle.trim(),
        description: "",
        status,
      });
    });
    setNewGoalTitle("");
    setAddingTo(null);
  }

  return (
    <section className="mt-5 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-semibold text-white">Objectifs du projet</h2>
        <p className="mt-1 text-sm text-[#8f8996]">Organisez les prochaines étapes et cochez ce qui est terminé.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {columns.map((column) => {
          const goals = project.goals.filter((goal) => goal.status === column.status);
          return (
            <div key={column.status} className="rounded-xl border border-white/7 bg-black/18 p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: column.color }} />
                <h3 className="text-xs font-semibold uppercase tracking-[.12em] text-[#c8c2cf]">{column.label}</h3>
                <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[#77717f]">{goals.length}</span>
              </div>

              <div className="grid gap-2">
                {goals.map((goal) => (
                  <article key={goal.id} className="rounded-lg border border-white/7 bg-[#18161d] p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        aria-label={`Marquer ${goal.title} comme terminé`}
                        checked={goal.status === "done"}
                        className="mt-0.5 border-white/20 data-[state=checked]:border-[#58c68a] data-[state=checked]:bg-[#58c68a]"
                        onCheckedChange={(checked) =>
                          updateProject((draft) => {
                            const target = draft.goals.find((item) => item.id === goal.id);
                            if (target) target.status = checked ? "done" : "todo";
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${goal.status === "done" ? "text-[#7f7985] line-through" : "text-[#e6e1e9]"}`}>{goal.title}</p>
                        <textarea
                          aria-label={`Description de ${goal.title}`}
                          value={goal.description}
                          placeholder="Ajouter un détail…"
                          className="mt-2 min-h-10 w-full resize-none bg-transparent text-xs leading-5 text-[#77717f] outline-none placeholder:text-[#4e4953]"
                          onChange={(event) =>
                            updateProject((draft) => {
                              const target = draft.goals.find((item) => item.id === goal.id);
                              if (target) target.description = event.target.value;
                            })
                          }
                        />
                      </div>
                      <Button
                        aria-label={`Supprimer ${goal.title}`}
                        title="Supprimer"
                        variant="ghost"
                        size="icon-xs"
                        className="text-[#625c67] hover:text-[#ff7885]"
                        onClick={() =>
                          updateProject((draft) => {
                            draft.goals = draft.goals.filter((item) => item.id !== goal.id);
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <Select
                      value={goal.status}
                      onValueChange={(status: GoalStatus) =>
                        updateProject((draft) => {
                          const target = draft.goals.find((item) => item.id === goal.id);
                          if (target) target.status = status;
                        })
                      }
                    >
                      <SelectTrigger size="sm" className="mt-2 h-7 w-full border-white/7 bg-white/3 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((option) => (
                          <SelectItem key={option.status} value={option.status}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </article>
                ))}
              </div>

              {addingTo === column.status ? (
                <div className="mt-2 rounded-lg border border-[#ef4f5f]/25 bg-[#ef4f5f]/5 p-2">
                  <Input
                    autoFocus
                    value={newGoalTitle}
                    placeholder="Titre de l’objectif"
                    className="h-8 border-white/10 bg-black/20 text-xs"
                    onChange={(event) => setNewGoalTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addGoal(column.status);
                      if (event.key === "Escape") setAddingTo(null);
                    }}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="xs" className="bg-[#ef4f5f] text-white" onClick={() => addGoal(column.status)}>Ajouter</Button>
                    <Button size="xs" variant="ghost" onClick={() => setAddingTo(null)}>Annuler</Button>
                  </div>
                </div>
              ) : (
                <button
                  className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-[#77717f] transition hover:bg-white/4 hover:text-[#c8c2cf]"
                  onClick={() => {
                    setAddingTo(column.status);
                    setNewGoalTitle("");
                  }}
                >
                  {column.status === "done" ? <CheckCircle2 className="size-3.5" /> : column.status === "todo" ? <Circle className="size-3.5" /> : <Plus className="size-3.5" />}
                  Ajouter une carte
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
