"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import { loadMedia } from "@/lib/studio-db";

export function MediaPreview({
  mediaId,
  alt,
  className = "",
}: {
  mediaId?: string | null;
  alt: string;
  className?: string;
}) {
  if (!mediaId) return <MediaPlaceholder alt={alt} className={className} />;
  return <LoadedMediaPreview key={mediaId} mediaId={mediaId} alt={alt} className={className} />;
}

function LoadedMediaPreview({ mediaId, alt, className }: { mediaId: string; alt: string; className: string }) {
  const [url, setUrl] = useState<string | null>(null);

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

  // Blob URLs come from the local IndexedDB media store, so Next Image cannot optimize them.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={`object-cover ${className}`} />;
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
