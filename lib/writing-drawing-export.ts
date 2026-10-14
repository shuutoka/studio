import { applyDocxDrawingOverlays, type DocxDrawingOverlay } from "@/lib/writing-docx";
import { PAGE_FORMATS, type PageFormat, type WritingDrawingStroke } from "@/lib/studio";

export type RenderedDrawingAnchor = {
  blockId?: string;
  paragraphIndex?: number;
};

/**
 * Rasterizes the Studio's page-relative pen strokes and embeds one transparent
 * full-page image for every annotated page. The image is anchored to the first
 * OOXML paragraph laid out on that page, so Word and compatible editors keep
 * the marks over the text instead of adding them as an appendix.
 */
export async function exportDocxWithDrawings(
  blob: Blob,
  drawings: WritingDrawingStroke[],
  pageFormat: PageFormat,
  renderedPageAnchors: ReadonlyMap<number, RenderedDrawingAnchor> = new Map(),
) {
  if (!drawings.length) return blob;

  const pages = new Map<number, WritingDrawingStroke[]>();
  for (const drawing of drawings) {
    const list = pages.get(drawing.pageIndex) ?? [];
    list.push(drawing);
    pages.set(drawing.pageIndex, list);
  }

  const overlays: DocxDrawingOverlay[] = [];
  const format = PAGE_FORMATS[pageFormat].height ? PAGE_FORMATS[pageFormat] : PAGE_FORMATS.a4;

  for (const [pageIndex, strokes] of [...pages].sort(([left], [right]) => left - right)) {
    const renderedAnchor = renderedPageAnchors.get(pageIndex);
    const storedAnchor = strokes.find((stroke) => stroke.anchorBlockId || Number.isFinite(stroke.anchorParagraphIndex));
    overlays.push({
      pageIndex,
      anchorBlockId: renderedAnchor?.blockId ?? storedAnchor?.anchorBlockId,
      anchorParagraphIndex: renderedAnchor?.paragraphIndex ?? storedAnchor?.anchorParagraphIndex,
      pngBytes: await rasterizeDrawingPage(strokes, format.width, format.height ?? PAGE_FORMATS.a4.height!),
      widthPx: format.width,
      heightPx: format.height ?? PAGE_FORMATS.a4.height!,
    });
  }

  return applyDocxDrawingOverlays(blob, overlays);
}

async function rasterizeDrawingPage(
  strokes: WritingDrawingStroke[],
  pageWidth: number,
  pageHeight: number,
) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, Math.max(1, 1_600 / pageWidth));
  canvas.width = Math.round(pageWidth * scale);
  canvas.height = Math.round(pageHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer les dessins pour le DOCX.");

  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    if (stroke.points.length === 1) {
      const point = stroke.points[0];
      context.lineTo(point.x * canvas.width + 0.01, point.y * canvas.height);
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.size * scale;
    context.stroke();
  }

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("L’image des annotations n’a pas pu être créée.")), "image/png");
  });
  return new Uint8Array(await png.arrayBuffer());
}
