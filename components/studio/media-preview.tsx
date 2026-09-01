"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Plus, Search, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { loadMedia } from "@/lib/studio-db";

export type MediaCharacterLinkContext = {
  projectId?: string;
  projectName?: string;
  characters: Array<{ id: string; name: string; imageIds: string[] }>;
};

export type MediaCharacterLinking = MediaCharacterLinkContext & {
  getContext?: (mediaId: string) => MediaCharacterLinkContext;
  onChange: (mediaId: string, characterId: string, linked: boolean, projectId?: string) => void;
};

export function MediaPreview({
  mediaId,
  alt,
  className = "",
  expandable = false,
  gallery,
  fit = "cover",
  characterLinking,
}: {
  mediaId?: string | null;
  alt: string;
  className?: string;
  expandable?: boolean;
  gallery?: Array<{ id: string; alt: string }>;
  fit?: "cover" | "contain";
  characterLinking?: MediaCharacterLinking;
}) {
  if (!mediaId) return <MediaPlaceholder alt={alt} className={className} />;
  return <LoadedMediaPreview key={mediaId} mediaId={mediaId} alt={alt} className={className} expandable={expandable} gallery={gallery} fit={fit} characterLinking={characterLinking} />;
}

function LoadedMediaPreview({ mediaId, alt, className, expandable, gallery, fit, characterLinking }: { mediaId: string; alt: string; className: string; expandable: boolean; gallery?: Array<{ id: string; alt: string }>; fit: "cover" | "contain"; characterLinking?: MediaCharacterLinking }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    loadMedia(mediaId)
      .then((media) => {
        if (!media || cancelled) return;
        objectUrl = URL.createObjectURL(media.blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  if (!url) return <MediaPlaceholder alt={alt} className={className} />;

  if (!expandable) {
    // Blob URLs come from the local IndexedDB media store, so Next Image cannot optimize them.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className}`} />;
  }

  const items = gallery?.length ? gallery : [{ id: mediaId, alt }];
  const currentIndex = Math.max(0, items.findIndex((item) => item.id === mediaId));

  return (
    <>
      <button className={`group relative block cursor-zoom-in overflow-hidden ${className}`} onClick={() => setOpen(true)} aria-label={`Agrandir ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} transition duration-200 group-hover:scale-[1.02]`} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94svh] max-w-[94vw] border-white/10 bg-[#09080c]/96 p-2 sm:max-w-6xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <LightboxCarousel items={items} initialIndex={currentIndex} characterLinking={characterLinking} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LightboxCarousel({ items, initialIndex, characterLinking }: { items: Array<{ id: string; alt: string }>; initialIndex: number; characterLinking?: MediaCharacterLinking }) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index] ?? items[0];

  function move(direction: number) {
    setIndex((current) => (current + direction + items.length) % items.length);
  }

  return <div className="relative grid min-h-[60svh] place-items-center" tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }}>
    <LightboxImage key={item.id} item={item} />
    {characterLinking && <CharacterLinkMenu mediaId={item.id} linking={characterLinking} />}
    {items.length > 1 && <><button type="button" aria-label="Image précédente" className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/65 text-white shadow-lg hover:bg-black/85" onClick={() => move(-1)}><ChevronLeft /></button><button type="button" aria-label="Image suivante" className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/65 text-white shadow-lg hover:bg-black/85" onClick={() => move(1)}><ChevronRight /></button><span className="absolute bottom-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">{index + 1} / {items.length}</span></>}
  </div>;
}

function CharacterLinkMenu({ mediaId, linking }: { mediaId: string; linking: MediaCharacterLinking }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("fr");
  const context = linking.getContext?.(mediaId) ?? linking;
  const linked = context.characters.filter((character) => character.imageIds.includes(mediaId));
  const available = context.characters.filter((character) => !character.imageIds.includes(mediaId) && (!query || character.name.toLocaleLowerCase("fr").includes(query)));

  return <Popover>
    <PopoverTrigger asChild><Button aria-label="Ajouter l’image à un personnage" title="Ajouter à une galerie" size="icon" className="absolute right-12 top-2 z-10 rounded-full bg-[#ef4f5f] text-white shadow-lg hover:bg-[#ff6675]"><Plus /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(90vw,360px)] border-white/10 bg-[#1b1821] p-0 text-[#eeeaf2]">
      <div className="border-b border-white/8 p-4"><PopoverHeader><PopoverTitle>Ajouter à une galerie</PopoverTitle></PopoverHeader>{context.projectName && <p className="mt-1 text-xs text-[#77717f]">Projet : {context.projectName}</p>}<div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#77717f]" /><Input aria-label="Rechercher un personnage" value={search} placeholder="Rechercher un personnage…" className="border-white/10 bg-black/20 pl-9" onChange={(event) => setSearch(event.target.value)} /></div></div>
      <div className="max-h-48 overflow-y-auto p-2">
        {available.map((character) => <button key={character.id} type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[#c8c2cf] hover:bg-[#ef4f5f]/10 hover:text-white" onClick={() => linking.onChange(mediaId, character.id, true, context.projectId)}><UserRound className="size-4 text-[#ef6977]" /><span className="min-w-0 flex-1 truncate">{character.name}</span><Plus className="size-4" /></button>)}
        {!available.length && <p className="px-3 py-4 text-center text-xs text-[#77717f]">{context.characters.length ? "Aucun autre personnage disponible." : "Aucun personnage dans ce projet."}</p>}
      </div>
      <div className="border-t border-white/8 p-3"><p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#77717f]">Déjà ajoutée à</p>{linked.length ? <div className="grid gap-1">{linked.map((character) => <div key={character.id} className="flex items-center gap-2 rounded-lg bg-white/3 px-3 py-2 text-sm"><UserRound className="size-4 text-[#8f8996]" /><span className="min-w-0 flex-1 truncate">{character.name}</span><Button aria-label={`Retirer de ${character.name}`} title={`Retirer de ${character.name}`} size="icon-xs" variant="ghost" className="text-[#8f8996] hover:text-[#ff7885]" onClick={() => linking.onChange(mediaId, character.id, false, context.projectId)}><Trash2 /></Button></div>)}</div> : <p className="px-1 py-2 text-xs text-[#77717f]">Cette image n’est liée à aucun personnage.</p>}</div>
    </PopoverContent>
  </Popover>;
}

function LightboxImage({ item }: { item: { id: string; alt: string } }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    loadMedia(item.id).then((media) => {
      if (!media || cancelled) return;
      objectUrl = URL.createObjectURL(media.blob);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.id]);
  if (!url) return <MediaPlaceholder alt={item.alt} className="size-24 rounded-xl" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={item.alt} className="mx-auto max-h-[88svh] max-w-full rounded-lg object-contain" />;
}

function MediaPlaceholder({ alt, className }: { alt: string; className: string }) {
  return (
    <span
      className={`grid place-items-center bg-[linear-gradient(135deg,#38202a,#1b1820)] text-[#8e7b84] ${className}`}
      aria-label={`Aucune image pour ${alt}`}
    >
      <ImageIcon className="size-5" />
    </span>
  );
}
