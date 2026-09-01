"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  Plus,
  Search,
  Shirt,
  Star,
  Tags,
  Trash2,
  Upload,
  UserRoundPlus,
} from "lucide-react";

import { MediaPreview } from "@/components/studio/media-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createEmptyCharacter,
  createId,
  type StudioMedia,
  type StudioProject,
} from "@/lib/studio";

type CharacterManagerProps = {
  project: StudioProject;
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  updateProject: (mutate: (draft: StudioProject) => void) => void;
  uploadMedia: (files: File[], kind: StudioMedia["kind"]) => Promise<string[]>;
  removeMedia: (mediaId: string) => Promise<void>;
};

export function CharacterManager({
  project,
  selectedCharacterId,
  onSelectCharacter,
  updateProject,
  uploadMedia,
  removeMedia,
}: CharacterManagerProps) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [deleteCharacterId, setDeleteCharacterId] = useState<string | null>(null);
  const selected =
    project.characters.find((character) => character.id === selectedCharacterId) ??
    project.characters[0];
  const allTags = useMemo(
    () => [...new Set(project.characters.flatMap((character) => character.tags))].sort(),
    [project.characters],
  );
  const filteredCharacters = project.characters.filter((character) => {
    const query = search.trim().toLocaleLowerCase("fr");
    const matchesSearch =
      !query ||
      [character.name, character.role, character.species, ...character.tags]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    return matchesSearch && (tagFilter === "all" || character.tags.includes(tagFilter));
  });

  function addCharacter() {
    const character = createEmptyCharacter();
    updateProject((draft) => draft.characters.push(character));
    onSelectCharacter(character.id);
  }

  function confirmDeleteCharacter() {
    if (!deleteCharacterId) return;
    const character = project.characters.find((item) => item.id === deleteCharacterId);
    const mediaIds = character
      ? [...character.imageIds, ...character.outfits.flatMap((outfit) => outfit.imageIds)]
      : [];
    updateProject((draft) => {
      draft.characters = draft.characters.filter((item) => item.id !== deleteCharacterId);
      draft.characters.forEach((item) => {
        item.relations = item.relations.filter(
          (relation) => relation.targetCharacterId !== deleteCharacterId,
        );
      });
    });
    Promise.all(mediaIds.map((id) => removeMedia(id))).catch(() => undefined);
    const next = project.characters.find((item) => item.id !== deleteCharacterId);
    if (next) onSelectCharacter(next.id);
    setDeleteCharacterId(null);
  }

  async function addCharacterImages(files: File[]) {
    if (!selected || !files.length) return;
    const ids = await uploadMedia(files, "character-image");
    updateProject((draft) => {
      const target = draft.characters.find((character) => character.id === selected.id);
      if (target) {
        target.imageIds.push(...ids);
        target.thumbnailImageId ??= ids[0] ?? null;
      }
    });
  }

  function moveCharacterImage(mediaId: string, direction: -1 | 1) {
    if (!selected) return;
    editCharacter(updateProject, selected.id, (character) => {
      const index = character.imageIds.indexOf(mediaId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= character.imageIds.length) return;
      [character.imageIds[index], character.imageIds[targetIndex]] = [character.imageIds[targetIndex], character.imageIds[index]];
    });
  }

  async function addOutfitImages(outfitId: string, files: File[]) {
    if (!selected || !files.length) return;
    const ids = await uploadMedia(files, "outfit-image");
    updateProject((draft) => {
      const target = draft.characters.find((character) => character.id === selected.id);
      target?.outfits.find((outfit) => outfit.id === outfitId)?.imageIds.push(...ids);
    });
  }

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Distribution</div>
            <h1 className="text-3xl font-bold tracking-[-.03em] text-white">Personnages</h1>
            <p className="mt-2 text-sm text-[#8f8996]">Fiches, relations, références visuelles et tenues.</p>
          </div>
          <Button className="bg-[#ef4f5f] text-white hover:bg-[#ff6675]" onClick={addCharacter}>
            <UserRoundPlus /> Ajouter un personnage
          </Button>
        </div>

        {project.characters.length ? (
          <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
            <aside className="min-w-0">
              <div className="mb-3 grid gap-2 rounded-xl border border-white/7 bg-[#131218] p-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#77717f]" />
                  <Input
                    value={search}
                    placeholder="Rechercher…"
                    className="border-white/9 bg-black/20 pl-9"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="w-full border-white/9 bg-black/20">
                    <Tags className="size-4" /> <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les tags</SelectItem>
                    {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid max-h-[70svh] gap-2 overflow-y-auto pr-1">
                {filteredCharacters.map((character) => (
                  <button
                    key={character.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      character.id === selected?.id
                        ? "border-[#ef4f5f]/35 bg-[#ef4f5f]/8"
                        : "border-white/7 bg-[#131218] hover:border-white/13"
                    }`}
                    onClick={() => onSelectCharacter(character.id)}
                  >
                    <MediaPreview
                      mediaId={character.thumbnailImageId ?? character.imageIds[0]}
                      alt={character.name}
                      className="size-12 shrink-0 rounded-xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">{character.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-[#77717f]">{character.role || "Rôle à définir"}</span>
                      {character.tags.length > 0 && (
                        <span className="mt-1.5 flex gap-1 overflow-hidden">
                          {character.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-[#9c96a5]">{tag}</span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                {!filteredCharacters.length && (
                  <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#77717f]">Aucun personnage ne correspond aux filtres.</p>
                )}
              </div>
            </aside>

            {selected && (
              <section className="min-w-0 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7">
                <div className="mb-6 flex flex-col gap-4 border-b border-white/7 pb-6 sm:flex-row sm:items-center">
                  <MediaPreview mediaId={selected.thumbnailImageId ?? selected.imageIds[0]} alt={selected.name} className="size-20 shrink-0 rounded-2xl" expandable gallery={selected.imageIds.map((id, index) => ({ id, alt: `${selected.name} ${index + 1}` }))} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[.15em] text-[#77717f]">Fiche personnage</p>
                    <h2 className="mt-1 truncate text-xl font-semibold text-white">{selected.name}</h2>
                    <p className="mt-1 truncate text-sm text-[#8f8996]">{selected.role || "Rôle à définir"}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-[#ef4f5f]/25 bg-transparent text-[#ff8a95] hover:bg-[#ef4f5f]/10 hover:text-[#ff9da6]"
                    onClick={() => setDeleteCharacterId(selected.id)}
                  >
                    <Trash2 /> Supprimer
                  </Button>
                </div>

                <Tabs defaultValue="identity">
                  <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto bg-black/20 p-1">
                    <TabsTrigger value="identity">Identité</TabsTrigger>
                    <TabsTrigger value="profile">Profil</TabsTrigger>
                    <TabsTrigger value="gallery">Galerie</TabsTrigger>
                    <TabsTrigger value="outfits">Tenues</TabsTrigger>
                    <TabsTrigger value="relations">Relations</TabsTrigger>
                  </TabsList>

                  <TabsContent value="identity" className="grid gap-5 sm:grid-cols-2">
                    <Field label="Nom">
                      <Input value={selected.name} className="border-white/10 bg-black/20" onChange={(event) => editCharacter(updateProject, selected.id, (character) => { character.name = event.target.value; })} />
                    </Field>
                    <Field label="Rôle">
                      <Input value={selected.role} placeholder="Protagoniste, allié…" className="border-white/10 bg-black/20" onChange={(event) => editCharacter(updateProject, selected.id, (character) => { character.role = event.target.value; })} />
                    </Field>
                    <Field label="Âge">
                      <Input value={selected.age} placeholder="24 ans, inconnu…" className="border-white/10 bg-black/20" onChange={(event) => editCharacter(updateProject, selected.id, (character) => { character.age = event.target.value; })} />
                    </Field>
                    <Field label="Espèce / nature">
                      <Input value={selected.species} placeholder="Humaine, démone…" className="border-white/10 bg-black/20" onChange={(event) => editCharacter(updateProject, selected.id, (character) => { character.species = event.target.value; })} />
                    </Field>
                    <Field label="Tags" className="sm:col-span-2">
                      <Input
                        value={selected.tags.join(", ")}
                        placeholder="protagoniste, résistance, pilote…"
                        className="border-white/10 bg-black/20"
                        onChange={(event) => editCharacter(updateProject, selected.id, (character) => {
                          character.tags = [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))];
                        })}
                      />
                    </Field>
                  </TabsContent>

                  <TabsContent value="profile" className="grid gap-5 sm:grid-cols-2">
                    <TextField label="Résumé" value={selected.description} onChange={(value) => editCharacter(updateProject, selected.id, (character) => { character.description = value; })} />
                    <TextField label="Apparence" value={selected.appearance} onChange={(value) => editCharacter(updateProject, selected.id, (character) => { character.appearance = value; })} />
                    <TextField label="Personnalité" value={selected.personality} onChange={(value) => editCharacter(updateProject, selected.id, (character) => { character.personality = value; })} />
                    <TextField label="Objectifs personnels" value={selected.objectives} onChange={(value) => editCharacter(updateProject, selected.id, (character) => { character.objectives = value; })} />
                    <TextField label="Notes complémentaires" value={selected.notes} className="sm:col-span-2" onChange={(value) => editCharacter(updateProject, selected.id, (character) => { character.notes = value; })} />
                  </TabsContent>

                  <TabsContent value="gallery">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">Images du personnage</h3>
                        <p className="mt-1 text-xs text-[#77717f]">Réorganisez les images et choisissez le portrait principal avec l’étoile.</p>
                      </div>
                      <UploadLabel onFiles={addCharacterImages} multiple />
                    </div>
                    {selected.imageIds.length ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {selected.imageIds.map((mediaId, index) => (
                          <div key={mediaId} className="group relative overflow-hidden rounded-xl border border-white/8">
                            <MediaPreview mediaId={mediaId} alt={`${selected.name} ${index + 1}`} className="aspect-[3/4] w-full" expandable gallery={selected.imageIds.map((id, galleryIndex) => ({ id, alt: `${selected.name} ${galleryIndex + 1}` }))} />
                            <div className="absolute bottom-2 left-2 flex gap-1 rounded-lg bg-black/60 p-1 opacity-0 transition group-hover:opacity-100"><Button aria-label="Déplacer l’image vers la gauche" title="Déplacer vers la gauche" variant="ghost" size="icon-xs" disabled={index === 0} onClick={() => moveCharacterImage(mediaId, -1)}><ArrowLeft /></Button><Button aria-label="Déplacer l’image vers la droite" title="Déplacer vers la droite" variant="ghost" size="icon-xs" disabled={index === selected.imageIds.length - 1} onClick={() => moveCharacterImage(mediaId, 1)}><ArrowRight /></Button></div>
                            <Button aria-label="Choisir comme portrait principal" title="Choisir comme portrait principal" variant="ghost" size="icon-xs" className={`absolute left-2 top-2 ${selected.thumbnailImageId === mediaId ? "bg-[#ef4f5f] text-white" : "bg-black/60 text-white opacity-0 group-hover:opacity-100"}`} onClick={() => editCharacter(updateProject, selected.id, (character) => { character.thumbnailImageId = mediaId; })}><Star className={selected.thumbnailImageId === mediaId ? "fill-current" : ""} /></Button>
                            <Button
                              aria-label="Supprimer l’image"
                              variant="destructive"
                              size="icon-xs"
                              className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100"
                              onClick={() => {
                                editCharacter(updateProject, selected.id, (character) => {
                                  character.imageIds = character.imageIds.filter((id) => id !== mediaId);
                                  if (character.thumbnailImageId === mediaId) character.thumbnailImageId = character.imageIds[0] ?? null;
                                });
                                removeMedia(mediaId).catch(() => undefined);
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyPanel icon={Upload} text="Ajoutez un portrait ou des références visuelles." />
                    )}
                  </TabsContent>

                  <TabsContent value="outfits">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">Garde-robe</h3>
                        <p className="mt-1 text-xs text-[#77717f]">Chaque tenue peut avoir sa description et plusieurs images.</p>
                      </div>
                      <Button
                        variant="outline"
                        className="border-white/10 bg-transparent"
                        onClick={() => editCharacter(updateProject, selected.id, (character) => {
                          character.outfits.push({ id: createId("outfit"), name: "Nouvelle tenue", description: "", imageIds: [] });
                        })}
                      >
                        <Plus /> Ajouter une tenue
                      </Button>
                    </div>
                    <div className="grid gap-4">
                      {selected.outfits.map((outfit) => (
                        <article key={outfit.id} className="rounded-xl border border-white/8 bg-black/18 p-4">
                          <div className="flex items-center gap-3">
                            <Shirt className="size-4 text-[#ef6977]" />
                            <Input
                              value={outfit.name}
                              className="h-auto flex-1 border-0 bg-transparent px-0 font-medium text-white shadow-none focus-visible:ring-0"
                              onChange={(event) => editCharacter(updateProject, selected.id, (character) => {
                                const target = character.outfits.find((item) => item.id === outfit.id);
                                if (target) target.name = event.target.value;
                              })}
                            />
                            <UploadLabel onFiles={(files) => addOutfitImages(outfit.id, files)} multiple compact />
                            <Button
                              aria-label="Supprimer la tenue"
                              title="Supprimer la tenue"
                              variant="ghost"
                              size="icon-sm"
                              className="text-[#77717f] hover:text-[#ff7885]"
                              onClick={() => {
                                outfit.imageIds.forEach((id) => removeMedia(id).catch(() => undefined));
                                editCharacter(updateProject, selected.id, (character) => {
                                  character.outfits = character.outfits.filter((item) => item.id !== outfit.id);
                                });
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <textarea
                            value={outfit.description}
                            placeholder="Description, contexte, accessoires…"
                            className="mt-3 min-h-20 w-full resize-y rounded-lg border border-white/7 bg-white/2 p-3 text-xs leading-5 text-[#c8c2cf] outline-none"
                            onChange={(event) => editCharacter(updateProject, selected.id, (character) => {
                              const target = character.outfits.find((item) => item.id === outfit.id);
                              if (target) target.description = event.target.value;
                            })}
                          />
                          {outfit.imageIds.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                              {outfit.imageIds.map((mediaId) => (
                                <div key={mediaId} className="group relative shrink-0">
                                  <MediaPreview mediaId={mediaId} alt={outfit.name} className="h-28 w-20 rounded-lg" expandable gallery={outfit.imageIds.map((id, index) => ({ id, alt: `${outfit.name} ${index + 1}` }))} />
                                  <Button
                                    aria-label="Supprimer l’image de tenue"
                                    variant="destructive"
                                    size="icon-xs"
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                                    onClick={() => {
                                      editCharacter(updateProject, selected.id, (character) => {
                                        const target = character.outfits.find((item) => item.id === outfit.id);
                                        if (target) target.imageIds = target.imageIds.filter((id) => id !== mediaId);
                                      });
                                      removeMedia(mediaId).catch(() => undefined);
                                    }}
                                  >
                                    <Trash2 />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </article>
                      ))}
                      {!selected.outfits.length && <EmptyPanel icon={Shirt} text="Aucune tenue enregistrée pour ce personnage." />}
                    </div>
                  </TabsContent>

                  <TabsContent value="relations">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-white">Relations</h3>
                        <p className="mt-1 text-xs text-[#77717f]">Reliez ce personnage aux autres membres du projet.</p>
                      </div>
                      <Button
                        variant="outline"
                        className="border-white/10 bg-transparent"
                        disabled={project.characters.length < 2}
                        onClick={() => {
                          const target = project.characters.find((character) => character.id !== selected.id);
                          if (!target) return;
                          editCharacter(updateProject, selected.id, (character) => {
                            character.relations.push({ id: createId("relation"), targetCharacterId: target.id, type: "Relation", description: "" });
                          });
                        }}
                      >
                        <Link2 /> Ajouter une relation
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {selected.relations.map((relation) => (
                        <article key={relation.id} className="grid gap-3 rounded-xl border border-white/8 bg-black/18 p-4 sm:grid-cols-2">
                          <Field label="Personnage">
                            <Select
                              value={relation.targetCharacterId}
                              onValueChange={(value) => editCharacter(updateProject, selected.id, (character) => {
                                const target = character.relations.find((item) => item.id === relation.id);
                                if (target) target.targetCharacterId = value;
                              })}
                            >
                              <SelectTrigger className="w-full border-white/9 bg-white/3"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {project.characters.filter((character) => character.id !== selected.id).map((character) => (
                                  <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field label="Type de relation">
                            <Input value={relation.type} placeholder="Amie, rivale, sœur…" className="border-white/9 bg-white/3" onChange={(event) => editCharacter(updateProject, selected.id, (character) => {
                              const target = character.relations.find((item) => item.id === relation.id);
                              if (target) target.type = event.target.value;
                            })} />
                          </Field>
                          <textarea
                            value={relation.description}
                            placeholder="Décrivez la dynamique entre les personnages…"
                            className="min-h-20 resize-y rounded-lg border border-white/7 bg-white/2 p-3 text-xs leading-5 text-[#c8c2cf] outline-none sm:col-span-2"
                            onChange={(event) => editCharacter(updateProject, selected.id, (character) => {
                              const target = character.relations.find((item) => item.id === relation.id);
                              if (target) target.description = event.target.value;
                            })}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-self-start text-[#77717f] hover:text-[#ff7885] sm:col-span-2"
                            onClick={() => editCharacter(updateProject, selected.id, (character) => {
                              character.relations = character.relations.filter((item) => item.id !== relation.id);
                            })}
                          >
                            <Trash2 /> Supprimer la relation
                          </Button>
                        </article>
                      ))}
                      {!selected.relations.length && <EmptyPanel icon={Link2} text="Aucune relation enregistrée." />}
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            )}
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center">
            <div>
              <UserRoundPlus className="mx-auto mb-4 size-8 text-[#ef6977]" />
              <h2 className="font-semibold text-white">Aucun personnage</h2>
              <p className="mt-2 text-sm text-[#8f8996]">Créez votre première fiche complète.</p>
              <Button className="mt-5 bg-[#ef4f5f] text-white" onClick={addCharacter}><Plus /> Ajouter</Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={Boolean(deleteCharacterId)} onOpenChange={(open) => !open && setDeleteCharacterId(null)}>
        <AlertDialogContent className="border-white/10 bg-[#17151d] text-[#eeeaf2]">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce personnage ?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#9c96a5]">Sa fiche, ses tenues, ses images et les relations qui le ciblent seront supprimées.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent">Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteCharacter}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function editCharacter(
  updateProject: (mutate: (draft: StudioProject) => void) => void,
  characterId: string,
  mutate: (character: StudioProject["characters"][number]) => void,
) {
  updateProject((draft) => {
    const character = draft.characters.find((item) => item.id === characterId);
    if (character) mutate(character);
  });
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${className}`}>{label}{children}</label>;
}

function TextField({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <Field label={label} className={className}>
      <textarea
        value={value}
        className="min-h-36 resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-[#ddd8e5] outline-none focus:border-[#ef4f5f]/60 focus:ring-2 focus:ring-[#ef4f5f]/10"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function UploadLabel({ onFiles, multiple = false, compact = false }: { onFiles: (files: File[]) => void | Promise<void>; multiple?: boolean; compact?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-transparent font-medium text-[#ddd8e5] transition hover:bg-white/6 ${compact ? "size-8" : "h-9 px-3 text-sm"}`}>
      <Upload className="size-4" /> {!compact && "Importer"}
      <input
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={multiple}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </label>
  );
}

function EmptyPanel({ icon: Icon, text }: { icon: typeof Upload; text: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 bg-white/2 p-6 text-center">
      <div><Icon className="mx-auto mb-2 size-5 text-[#77717f]" /><p className="text-xs text-[#77717f]">{text}</p></div>
    </div>
  );
}
