"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Library, Search, Tags } from "lucide-react";

import { MediaPreview } from "@/components/studio/media-preview";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StudioCharacter, StudioProject } from "@/lib/studio";

export function GlobalLibrary({
  projects,
  onOpenCharacter,
}: {
  projects: StudioProject[];
  onOpenCharacter: (project: StudioProject, character: StudioCharacter) => void;
}) {
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const entries = useMemo(
    () => projects.flatMap((project) => project.characters.map((character) => ({ project, character }))),
    [projects],
  );
  const allTags = useMemo(
    () => [...new Set(entries.flatMap(({ character }) => character.tags))].sort(),
    [entries],
  );
  const filtered = entries.filter(({ project, character }) => {
    const query = search.trim().toLocaleLowerCase("fr");
    const matchesSearch =
      !query ||
      [character.name, character.role, character.species, project.name, ...character.tags]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    return (
      matchesSearch &&
      (projectFilter === "all" || project.id === projectFilter) &&
      (tagFilter === "all" || character.tags.includes(tagFilter))
    );
  });

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">
            <Library className="size-3.5" /> Bibliothèque générale
          </div>
          <h1 className="text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Tous vos personnages</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#96909e]">Consultez et recherchez les personnages de l’ensemble de vos projets.</p>
        </div>

        <div className="mb-6 grid gap-3 rounded-2xl border border-white/7 bg-[#131218] p-4 md:grid-cols-[1fr_220px_200px]">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#77717f]" />
            <Input value={search} placeholder="Nom, rôle, espèce ou tag…" className="border-white/9 bg-black/20 pl-9" onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-full border-white/9 bg-black/20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les projets</SelectItem>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-full border-white/9 bg-black/20"><Tags className="size-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les tags</SelectItem>
              {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(({ project, character }) => (
              <button
                key={`${project.id}-${character.id}`}
                className="group overflow-hidden rounded-2xl border border-white/8 bg-[#131218] text-left transition hover:-translate-y-0.5 hover:border-white/15"
                onClick={() => onOpenCharacter(project, character)}
              >
                <MediaPreview mediaId={character.imageIds[0]} alt={character.name} className="aspect-[4/3] w-full rounded-none" />
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#ef6977]">{project.name}</p>
                  <div className="mt-2 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-white">{character.name}</h2>
                      <p className="mt-1 truncate text-xs text-[#77717f]">{character.role || character.species || "Profil à compléter"}</p>
                    </div>
                    <ChevronRight className="mt-1 size-4 text-[#625c67] transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </div>
                  {character.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {character.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-[#9c96a5]">{tag}</span>)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center">
            <div><Library className="mx-auto mb-3 size-7 text-[#77717f]" /><h2 className="font-medium text-white">Aucun personnage trouvé</h2><p className="mt-2 text-sm text-[#8f8996]">Ajoutez des personnages dans vos projets ou modifiez les filtres.</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
