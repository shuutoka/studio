"use client";

import { useEffect, useMemo, useState } from "react";
import { Grid2X2, Image as ImageIcon, Images, List, Search, Shirt, Text, UserRound } from "lucide-react";

import { MediaPreview } from "@/components/studio/media-preview";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadAllMedia } from "@/lib/studio-db";
import type { StudioMedia, StudioProject } from "@/lib/studio";

type ImageContext = {
  media: StudioMedia;
  project: StudioProject;
  characterId: string | null;
  characterName: string | null;
  outfitName: string | null;
};

type GalleryLayout = "grid" | "list" | "images" | "text";

export function MediaGallery({ projects, onOpenProject, onOpenCharacter }: { projects: StudioProject[]; onOpenProject?: (project: StudioProject) => void; onOpenCharacter?: (project: StudioProject, characterId: string) => void }) {
  const [media, setMedia] = useState<StudioMedia[]>([]);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [characterId, setCharacterId] = useState("all");
  const [scope, setScope] = useState("all");
  const [layout, setLayout] = useState<GalleryLayout>("grid");
  const [thumbnailFit, setThumbnailFit] = useState<"cover" | "contain">("cover");
  const signature = projects.map((project) => `${project.id}:${project.revision}`).join("|");

  useEffect(() => {
    let cancelled = false;
    loadAllMedia().then((items) => { if (!cancelled) setMedia(items.filter((item) => item.kind !== "font")); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [signature]);

  const contexts = useMemo(() => {
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const linked = projects.flatMap((project) => project.characters.flatMap((character) => [
      ...character.imageIds.flatMap((id) => {
        const item = mediaById.get(id);
        return item ? [{ media: item, project, characterId: character.id, characterName: character.name, outfitName: null } satisfies ImageContext] : [];
      }),
      ...character.outfits.flatMap((outfit) => outfit.imageIds.flatMap((id) => {
        const item = mediaById.get(id);
        return item ? [{ media: item, project, characterId: character.id, characterName: character.name, outfitName: outfit.name } satisfies ImageContext] : [];
      })),
    ]));
    const linkedIds = new Set(linked.map((item) => item.media.id));
    const unlinked = media.flatMap((item) => {
      if (linkedIds.has(item.id)) return [];
      const project = projects.find((candidate) => candidate.id === item.projectId);
      return project ? [{ media: item, project, characterId: null, characterName: null, outfitName: null } satisfies ImageContext] : [];
    });
    return [...linked, ...unlinked];
  }, [media, projects]);

  const characters = useMemo(() => projects
    .filter((project) => projectId === "all" || project.id === projectId)
    .flatMap((project) => project.characters.map((character) => ({ ...character, projectName: project.name }))), [projects, projectId]);

  const filtered = contexts.filter((item) => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (
      (!query || [item.media.name, item.project.name, item.characterName, item.outfitName].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(query)) &&
      (projectId === "all" || item.project.id === projectId) &&
      (characterId === "all" || item.characterId === characterId) &&
      (scope === "all" || (scope === "portraits" ? !item.outfitName : Boolean(item.outfitName)))
    );
  });
  const lightboxGallery = [...new Map(filtered.map((item) => [item.media.id, { id: item.media.id, alt: item.outfitName ? `${item.characterName} — ${item.outfitName}` : item.characterName ?? item.media.name }])).values()];

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]"><Images className="size-4" /> Visionneuse</div>
          <h1 className="text-3xl font-bold tracking-[-.035em] text-white">Toutes les images</h1>
          <p className="mt-2 text-sm text-[#8f8996]">Filtrez les portraits et tenues, puis cliquez sur une image pour l’agrandir.</p>
        </div>

        <div className="mb-6 grid gap-3 rounded-2xl border border-white/8 bg-[#131218] p-4 lg:grid-cols-[1fr_210px_240px_180px]">
          <div className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#77717f]" /><Input value={search} placeholder="Image, projet, personnage, tenue…" className="border-white/9 bg-black/20 pl-9" onChange={(event) => setSearch(event.target.value)} /></div>
          <Select value={projectId} onValueChange={(value) => { setProjectId(value); setCharacterId("all"); }}><SelectTrigger className="w-full border-white/9 bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les projets</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
          <Select value={characterId} onValueChange={setCharacterId}><SelectTrigger className="w-full border-white/9 bg-black/20"><UserRound className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les personnages</SelectItem>{characters.map((character) => <SelectItem key={character.id} value={character.id}>{character.name} — {character.projectName}</SelectItem>)}</SelectContent></Select>
          <Select value={scope} onValueChange={setScope}><SelectTrigger className="w-full border-white/9 bg-black/20"><Shirt className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Portraits et tenues</SelectItem><SelectItem value="portraits">Portraits seulement</SelectItem><SelectItem value="outfits">Tenues seulement</SelectItem></SelectContent></Select>
          <div className="flex flex-wrap gap-2 lg:col-span-4"><Select value={layout} onValueChange={(value: GalleryLayout) => setLayout(value)}><SelectTrigger className="w-52 border-white/9 bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="grid"><span className="flex items-center gap-2"><Grid2X2 className="size-4" /> Grille</span></SelectItem><SelectItem value="list"><span className="flex items-center gap-2"><List className="size-4" /> Liste</span></SelectItem><SelectItem value="images"><span className="flex items-center gap-2"><ImageIcon className="size-4" /> Images uniquement</span></SelectItem><SelectItem value="text"><span className="flex items-center gap-2"><Text className="size-4" /> Texte uniquement</span></SelectItem></SelectContent></Select><Select value={thumbnailFit} onValueChange={(value: "cover" | "contain") => setThumbnailFit(value)}><SelectTrigger className="w-52 border-white/9 bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cover">Aperçu : centré et recadré</SelectItem><SelectItem value="contain">Aperçu : image entière</SelectItem></SelectContent></Select></div>
        </div>

        {filtered.length ? (
          <div className={layout === "list" || layout === "text" ? "grid gap-3" : layout === "images" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" : "grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"}>
            {filtered.map((item) => (
              <article key={`${item.media.id}-${item.characterId}-${item.outfitName ?? "portrait"}`} className={`overflow-hidden rounded-2xl border border-white/8 bg-[#131218] ${layout === "list" ? "grid grid-cols-[140px_1fr]" : ""}`}>
                {layout !== "text" && <MediaPreview mediaId={item.media.id} alt={item.outfitName ? `${item.characterName} — ${item.outfitName}` : item.characterName ?? item.media.name} className={layout === "list" ? "h-full min-h-28 w-full rounded-none" : "aspect-[4/3] w-full rounded-none"} expandable gallery={lightboxGallery} fit={thumbnailFit} />}
                {layout !== "images" && <div className="p-4"><button type="button" className="text-left text-[10px] font-semibold uppercase tracking-[.12em] text-[#ef6977] hover:underline" onClick={() => onOpenProject?.(item.project)}>{item.project.name}</button>{item.characterId ? <button type="button" className="mt-1 block max-w-full truncate text-left text-sm font-medium text-white hover:text-[#ff8a95] hover:underline" onClick={() => onOpenCharacter?.(item.project, item.characterId!)}>{item.characterName}</button> : <h2 className="mt-1 truncate text-sm font-medium text-white">{item.media.name}</h2>}<p className="mt-1 truncate text-xs text-[#77717f]">{item.outfitName ? `Tenue : ${item.outfitName}` : item.characterId ? "Portrait / référence" : "Image du projet"}</p></div>}
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-white/12 bg-white/2 p-8 text-center"><div><Images className="mx-auto mb-3 size-8 text-[#77717f]" /><h2 className="font-medium text-white">Aucune image trouvée</h2><p className="mt-2 text-sm text-[#8f8996]">Ajoutez des images aux personnages ou modifiez les filtres.</p></div></div>
        )}
      </div>
    </div>
  );
}
