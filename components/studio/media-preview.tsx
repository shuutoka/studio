"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { loadMedia } from "@/lib/studio-db";

export function MediaPreview({
  mediaId,
  alt,
  className = "",
  expandable = false,
  gallery,
  fit = "cover",
}: {
  mediaId?: string | null;
  alt: string;
  className?: string;
  expandable?: boolean;
  gallery?: Array<{ id: string; alt: string }>;
  fit?: "cover" | "contain";
}) {
  if (!mediaId) return <MediaPlaceholder alt={alt} className={className} />;
  return <LoadedMediaPreview key={mediaId} mediaId={mediaId} alt={alt} className={className} expandable={expandable} gallery={gallery} fit={fit} />;
}

function LoadedMediaPreview({ mediaId, alt, className, expandable, gallery, fit }: { mediaId: string; alt: string; className: string; expandable: boolean; gallery?: Array<{ id: string; alt: string }>; fit: "cover" | "contain" }) {
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
          <LightboxCarousel items={items} initialIndex={currentIndex} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LightboxCarousel({ items, initialIndex }: { items: Array<{ id: string; alt: string }>; initialIndex: number }) {
  const [index, setIndex] = useState(initialIndex);
  const item = items[index] ?? items[0];

  function move(direction: number) {
    setIndex((current) => (current + direction + items.length) % items.length);
  }

  return <div className="relative grid min-h-[60svh] place-items-center" tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }}>
    <LightboxImage key={item.id} item={item} />
    {items.length > 1 && <><button type="button" aria-label="Image précédente" className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/65 text-white shadow-lg hover:bg-black/85" onClick={() => move(-1)}><ChevronLeft /></button><button type="button" aria-label="Image suivante" className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/65 text-white shadow-lg hover:bg-black/85" onClick={() => move(1)}><ChevronRight /></button><span className="absolute bottom-3 rounded-full bg-black/65 px-3 py-1 text-xs text-white">{index + 1} / {items.length}</span></>}
  </div>;
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
