"use client";

import { useEffect } from "react";

import { loadMedia } from "@/lib/studio-db";
import type { StudioFont } from "@/lib/studio";

export function useProjectFonts(fonts: StudioFont[]) {
  const fontSignature = JSON.stringify(
    fonts.map((font) => ({ family: font.family, mediaId: font.mediaId })),
  );

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const loadedFaces: FontFace[] = [];

    Promise.all(
      (JSON.parse(fontSignature) as Pick<StudioFont, "family" | "mediaId">[]).map(async (font) => {
        const media = await loadMedia(font.mediaId);
        if (!media || cancelled) return;
        const url = URL.createObjectURL(media.blob);
        urls.push(url);
        const face = new FontFace(font.family, `url(${url})`);
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        loadedFaces.push(face);
      }),
    ).catch(() => undefined);

    return () => {
      cancelled = true;
      loadedFaces.forEach((face) => document.fonts.delete(face));
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fontSignature]);
}
