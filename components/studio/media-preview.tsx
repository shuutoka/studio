"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { loadMedia } from "@/lib/studio-db";

export function MediaPreview({
  mediaId,
  alt,
  className = "",
  expandable = false,
}: {
  mediaId?: string | null;
  alt: string;
  className?: string;
  expandable?: boolean;
}) {
  if (!mediaId) return <MediaPlaceholder alt={alt} className={className} />;
  return <LoadedMediaPreview key={mediaId} mediaId={mediaId} alt={alt} className={className} expandable={expandable} />;
}

function LoadedMediaPreview({ mediaId, alt, className, expandable }: { mediaId: string; alt: string; className: string; expandable: boolean }) {
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
    return <img src={url} alt={alt} className={`object-cover ${className}`} />;
  }

  return (
    <>
      <button className={`group relative block cursor-zoom-in overflow-hidden ${className}`} onClick={() => setOpen(true)} aria-label={`Agrandir ${alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94svh] max-w-[94vw] border-white/10 bg-[#09080c]/96 p-2 sm:max-w-6xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="mx-auto max-h-[90svh] max-w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
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
