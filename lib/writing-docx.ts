import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { DOCX_MIME } from "@/lib/writing-document";
import { footerFormatForType, formatFooterText } from "@/lib/writing-footer";
import { PAGE_FORMATS, type FooterFormat, type FooterType, type PageFormat } from "@/lib/studio";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const WORDPROCESSING_DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PICTURE_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const EFS_FOOTER_TARGET = "efs-footer.xml";
const STUDIO_QUICK_FORMAT_STYLE_IDS = new Set(["Normal", "Title", "Subtitle", "Heading1", "Heading2", "Heading3", "Heading4"]);
const RETIRED_QUICK_FORMAT_STYLES = new Set(["chapter", "chapitre"]);

export type DocxOutlineEntry = { level: number; label: string };
export type DocxDrawingOverlay = {
  pageIndex: number;
  anchorBlockId: string;
  pngBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
};

export async function ensureStudioDocxStyles(blob: Blob): Promise<Blob> {
  const archive = await readDocx(blob);
  if (!archive["word/document.xml"]) return blob;
  const template = parseXml(studioStylesXml());
  const stylesPath = "word/styles.xml";
  const styles = archive[stylesPath]
    ? parseXml(strFromU8(archive[stylesPath]))
    : parseXml(studioStylesXml());
  let changed = !archive[stylesPath];

  if (archive[stylesPath]) {
    const existingStyles = new Map(elementsByLocalName(styles, "style")
      .map((item) => [attribute(item, "styleId"), item] as const)
      .filter(([id]) => Boolean(id)));
    for (const style of elementsByLocalName(template, "style")) {
      const id = attribute(style, "styleId");
      if (!id || existingStyles.has(id)) continue;
      const importedStyle = styles.importNode(style, true);
      styles.documentElement.append(importedStyle);
      existingStyles.set(id, importedStyle);
      changed = true;
    }
  }

  for (const style of elementsByLocalName(styles, "style")) {
    const styleId = attribute(style, "styleId");
    const styleName = attribute(directChild(style, "name"), "val");
    if (STUDIO_QUICK_FORMAT_STYLE_IDS.has(styleId)) {
      changed = ensureQuickFormatStyle(styles, style) || changed;
    }
    if (isRetiredQuickFormatStyle(styleId, styleName)) {
      changed = removeRetiredQuickFormatStyle(style) || changed;
    }
  }

  const relationships = ensureRelationships(archive);
  const hasStylesRelationship = directChildren(relationships.documentElement, "Relationship")
    .some((item) => item.getAttribute("Type")?.endsWith("/styles"));
  if (!hasStylesRelationship) {
    const usedIds = new Set(directChildren(relationships.documentElement, "Relationship").map((item) => item.getAttribute("Id") ?? ""));
    const relationship = relationships.createElementNS(PACKAGE_REL_NS, "Relationship");
    relationship.setAttribute("Id", uniqueRelationshipId(usedIds, "rIdEfsStyles"));
    relationship.setAttribute("Type", `${OFFICE_REL_NS}/styles`);
    relationship.setAttribute("Target", "styles.xml");
    relationships.documentElement.append(relationship);
    changed = true;
  }

  const contentTypes = ensureContentTypes(archive);
  const hasStylesContentType = directChildren(contentTypes.documentElement, "Override")
    .some((item) => item.getAttribute("PartName") === "/word/styles.xml");
  if (!hasStylesContentType) {
    const override = contentTypes.createElementNS(CONTENT_TYPES_NS, "Override");
    override.setAttribute("PartName", "/word/styles.xml");
    override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml");
    contentTypes.documentElement.append(override);
    changed = true;
  }

  if (!changed) return blob;
  archive[stylesPath] = strToU8(serializeXml(styles));
  archive["word/_rels/document.xml.rels"] = strToU8(serializeXml(relationships));
  archive["[Content_Types].xml"] = strToU8(serializeXml(contentTypes));
  return docxBlob(zipSync(archive, { level: 6 }));
}

export async function extractDocxText(blob: Blob): Promise<string> {
  const archive = await readDocx(blob);
  const documentBytes = archive["word/document.xml"];
  if (!documentBytes) return "";
  const documentXml = parseXml(strFromU8(documentBytes));
  const body = elementsByLocalName(documentXml, "body")[0];
  if (!body) return "";
  return elementsByLocalName(body, "p").map(docxParagraphText).join("\n");
}

export async function extractDocxOutline(blob: Blob): Promise<DocxOutlineEntry[]> {
  const archive = await readDocx(blob);
  const documentBytes = archive["word/document.xml"];
  if (!documentBytes) return [];
  const styles = collectStyles(archive["word/styles.xml"]);
  const documentXml = parseXml(strFromU8(documentBytes));
  const entries: DocxOutlineEntry[] = [];

  for (const paragraph of elementsByLocalName(documentXml, "p")) {
    const properties = directChild(paragraph, "pPr");
    const styleId = attribute(directChild(properties, "pStyle"), "val");
    const style = styles.get(styleId);
    const directOutlineValue = attribute(directChild(properties, "outlineLvl"), "val");
    const directOutline = directOutlineValue === "" ? Number.NaN : Number(directOutlineValue);
    const level = Number.isFinite(directOutline) && directOutline >= 0
      ? directOutline + 1
      : style?.level ?? inferHeadingLevel(styleId, style?.name ?? "");
    if (!level) continue;
    const label = elementsByLocalName(paragraph, "t").map((node) => node.textContent ?? "").join("")
      .replace(/\s+/gu, " ").trim();
    if (label) entries.push({ level: Math.min(6, Math.max(1, level)), label });
  }
  return entries;
}

export async function applyDocxFooter(
  blob: Blob,
  type: FooterType,
  text: string,
  format: FooterFormat,
  pageCount = 1,
): Promise<Blob> {
  const archive = await readDocx(blob);
  const documentBytes = archive["word/document.xml"];
  if (!documentBytes) throw new Error("Le contenu du document DOCX est manquant.");

  const relationships = ensureRelationships(archive);
  const relationshipElements = directChildren(relationships.documentElement, "Relationship");
  let footerRelationship = relationshipElements.find((item) => item.getAttribute("Target") === EFS_FOOTER_TARGET) ?? null;
  let relationshipId = footerRelationship?.getAttribute("Id") ?? "";

  if (type === "none") {
    if (relationshipId) {
      removeFooterReferences(archive, relationshipId);
      footerRelationship?.remove();
    }
    delete archive[`word/${EFS_FOOTER_TARGET}`];
    updateFooterContentType(archive, false);
    archive["word/_rels/document.xml.rels"] = strToU8(serializeXml(relationships));
    return docxBlob(zipSync(archive, { level: 6 }));
  }

  if (!footerRelationship) {
    const usedIds = new Set(relationshipElements.map((item) => item.getAttribute("Id") ?? ""));
    relationshipId = uniqueRelationshipId(usedIds);
    footerRelationship = relationships.createElementNS(PACKAGE_REL_NS, "Relationship");
    footerRelationship.setAttribute("Id", relationshipId);
    footerRelationship.setAttribute("Type", `${OFFICE_REL_NS}/footer`);
    footerRelationship.setAttribute("Target", EFS_FOOTER_TARGET);
    relationships.documentElement.append(footerRelationship);
  }

  setFooterReferences(archive, relationshipId);
  updateFooterContentType(archive, true);
  archive[`word/${EFS_FOOTER_TARGET}`] = strToU8(footerXml(type, text, format, pageCount));
  archive["word/_rels/document.xml.rels"] = strToU8(serializeXml(relationships));
  return docxBlob(zipSync(archive, { level: 6 }));
}

export async function applyDocxPageFormat(blob: Blob, pageFormat: PageFormat): Promise<Blob> {
  const format = PAGE_FORMATS[pageFormat];
  if (!format.height) throw new Error("Le format libre n’est pas disponible pour un document DOCX paginé.");
  const archive = await readDocx(blob);
  const documentBytes = archive["word/document.xml"];
  if (!documentBytes) throw new Error("Le contenu du document DOCX est manquant.");
  const documentXml = parseXml(strFromU8(documentBytes));
  let sections = elementsByLocalName(documentXml, "sectPr");
  if (!sections.length) {
    const body = elementsByLocalName(documentXml, "body")[0];
    if (!body) throw new Error("La structure du document DOCX est invalide.");
    const section = documentXml.createElementNS(WORD_NS, "w:sectPr");
    body.append(section);
    sections = [section];
  }
  for (const section of sections) {
    let pageSize = directChild(section, "pgSz");
    if (!pageSize) {
      pageSize = documentXml.createElementNS(WORD_NS, "w:pgSz");
      const firstPageProperty = [...section.children].find((child) => ["pgMar", "paperSrc", "pgBorders"].includes(child.localName));
      section.insertBefore(pageSize, firstPageProperty ?? null);
    }
    pageSize.setAttributeNS(WORD_NS, "w:w", String(Math.round(format.width * 15)));
    pageSize.setAttributeNS(WORD_NS, "w:h", String(Math.round(format.height * 15)));
    pageSize.removeAttributeNS(WORD_NS, "orient");
  }
  archive["word/document.xml"] = strToU8(serializeXml(documentXml));
  return docxBlob(zipSync(archive, { level: 6 }));
}

export async function applyDocxDrawingOverlays(blob: Blob, overlays: DocxDrawingOverlay[]): Promise<Blob> {
  if (!overlays.length) return blob;
  const archive = await readDocx(blob);
  const documentBytes = archive["word/document.xml"];
  if (!documentBytes) throw new Error("Le contenu du document DOCX est manquant.");

  const documentXml = parseXml(strFromU8(documentBytes));
  const relationships = ensureRelationships(archive);
  const usedRelationshipIds = new Set(
    directChildren(relationships.documentElement, "Relationship").map((item) => item.getAttribute("Id") ?? ""),
  );
  const paragraphs = elementsByLocalName(documentXml, "p");
  const usedMediaPaths = new Set(Object.keys(archive));
  let drawingId = Math.max(0, ...elementsByLocalName(documentXml, "docPr").map((item) => Number(attribute(item, "id")) || 0));
  let embedded = 0;

  for (const overlay of overlays) {
    const normalizedAnchor = overlay.anchorBlockId.toLocaleLowerCase("en");
    const paragraph = paragraphs.find((item) => attribute(item, "paraId").toLocaleLowerCase("en") === normalizedAnchor);
    if (!paragraph) continue;

    let mediaIndex = overlay.pageIndex + 1;
    let mediaPath = `word/media/efs-drawing-page-${mediaIndex}.png`;
    while (usedMediaPaths.has(mediaPath)) {
      mediaIndex += 1;
      mediaPath = `word/media/efs-drawing-page-${mediaIndex}.png`;
    }
    usedMediaPaths.add(mediaPath);

    const relationshipId = uniqueRelationshipId(usedRelationshipIds, "rIdEfsDrawing");
    usedRelationshipIds.add(relationshipId);
    const relationship = relationships.createElementNS(PACKAGE_REL_NS, "Relationship");
    relationship.setAttribute("Id", relationshipId);
    relationship.setAttribute("Type", `${OFFICE_REL_NS}/image`);
    relationship.setAttribute("Target", mediaPath.replace(/^word\//u, ""));
    relationships.documentElement.append(relationship);

    drawingId += 1;
    const widthEmu = Math.max(1, Math.round(overlay.widthPx * 9_525));
    const heightEmu = Math.max(1, Math.round(overlay.heightPx * 9_525));
    paragraph.append(createAnchoredDrawingRun(documentXml, {
      relationshipId,
      drawingId,
      name: `Annotations manuscrites — page ${overlay.pageIndex + 1}`,
      widthEmu,
      heightEmu,
    }));
    archive[mediaPath] = overlay.pngBytes;
    embedded += 1;
  }

  if (!embedded) {
    throw new Error("Les dessins n’ont pas pu être reliés aux pages du DOCX. Ouvrez le volume dans l’espace Écriture puis relancez l’export.");
  }

  const contentTypes = ensureContentTypes(archive);
  const hasPngType = directChildren(contentTypes.documentElement, "Default")
    .some((item) => item.getAttribute("Extension")?.toLocaleLowerCase("en") === "png");
  if (!hasPngType) {
    const pngType = contentTypes.createElementNS(CONTENT_TYPES_NS, "Default");
    pngType.setAttribute("Extension", "png");
    pngType.setAttribute("ContentType", "image/png");
    contentTypes.documentElement.append(pngType);
  }

  archive["word/document.xml"] = strToU8(serializeXml(documentXml));
  archive["word/_rels/document.xml.rels"] = strToU8(serializeXml(relationships));
  archive["[Content_Types].xml"] = strToU8(serializeXml(contentTypes));
  return docxBlob(zipSync(archive, { level: 6 }));
}

function createAnchoredDrawingRun(
  documentXml: XMLDocument,
  drawing: { relationshipId: string; drawingId: number; name: string; widthEmu: number; heightEmu: number },
) {
  const fragment = parseXml(`<root xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:wp="${WORDPROCESSING_DRAWING_NS}" xmlns:a="${DRAWING_NS}" xmlns:pic="${PICTURE_NS}"><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${drawing.widthEmu}" cy="${drawing.heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${drawing.drawingId}" name="${escapeXml(drawing.name)}" descr="${escapeXml(drawing.name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${PICTURE_NS}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawing.drawingId}" name="${escapeXml(drawing.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${escapeXml(drawing.relationshipId)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${drawing.widthEmu}" cy="${drawing.heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></root>`);
  const run = fragment.documentElement.firstElementChild;
  if (!run) throw new Error("L’image des annotations n’a pas pu être créée dans le DOCX.");
  return documentXml.importNode(run, true);
}

async function readDocx(blob: Blob) {
  try {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error("Le document DOCX est endommagé ou illisible.");
  }
}

function collectStyles(bytes?: Uint8Array) {
  const styles = new Map<string, { name: string; level: number | null }>();
  if (!bytes) return styles;
  const xml = parseXml(strFromU8(bytes));
  for (const style of elementsByLocalName(xml, "style")) {
    if (attribute(style, "type") !== "paragraph") continue;
    const id = attribute(style, "styleId");
    if (!id) continue;
    const name = attribute(directChild(style, "name"), "val");
    const outlineValue = attribute(directChild(directChild(style, "pPr"), "outlineLvl"), "val");
    const outline = outlineValue === "" ? Number.NaN : Number(outlineValue);
    styles.set(id, {
      name,
      level: Number.isFinite(outline) && outline >= 0 ? outline + 1 : inferHeadingLevel(id, name),
    });
  }
  return styles;
}

function inferHeadingLevel(styleId: string, styleName: string) {
  const value = `${styleId} ${styleName}`.toLocaleLowerCase("fr").replace(/[\s_-]+/gu, "");
  const match = value.match(/(?:heading|titre)([1-6])/u);
  if (match) return Number(match[1]);
  if (/chapter|chapitre/u.test(value)) return 1;
  return null;
}

function ensureRelationships(archive: Record<string, Uint8Array>) {
  const path = "word/_rels/document.xml.rels";
  if (archive[path]) return parseXml(strFromU8(archive[path]));
  return parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL_NS}"/>`);
}

function removeFooterReferences(archive: Record<string, Uint8Array>, relationshipId: string) {
  const documentXml = parseXml(strFromU8(archive["word/document.xml"]));
  for (const reference of elementsByLocalName(documentXml, "footerReference")) {
    if (attribute(reference, "id") === relationshipId) reference.remove();
  }
  archive["word/document.xml"] = strToU8(serializeXml(documentXml));
}

function setFooterReferences(archive: Record<string, Uint8Array>, relationshipId: string) {
  const documentXml = parseXml(strFromU8(archive["word/document.xml"]));
  let sections = elementsByLocalName(documentXml, "sectPr");
  if (!sections.length) {
    const body = elementsByLocalName(documentXml, "body")[0];
    if (!body) throw new Error("La structure du document DOCX est invalide.");
    const section = documentXml.createElementNS(WORD_NS, "w:sectPr");
    body.append(section);
    sections = [section];
  }
  for (const section of sections) {
    for (const reference of directChildren(section, "footerReference")) {
      if (!attribute(reference, "type") || attribute(reference, "type") === "default") reference.remove();
    }
    const reference = documentXml.createElementNS(WORD_NS, "w:footerReference");
    reference.setAttributeNS(WORD_NS, "w:type", "default");
    reference.setAttributeNS(OFFICE_REL_NS, "r:id", relationshipId);
    section.insertBefore(reference, section.firstChild);
  }
  archive["word/document.xml"] = strToU8(serializeXml(documentXml));
}

function updateFooterContentType(archive: Record<string, Uint8Array>, enabled: boolean) {
  const path = "[Content_Types].xml";
  const xml = ensureContentTypes(archive);
  const partName = `/word/${EFS_FOOTER_TARGET}`;
  const existing = directChildren(xml.documentElement, "Override").find((item) => item.getAttribute("PartName") === partName);
  if (!enabled) existing?.remove();
  else if (!existing) {
    const override = xml.createElementNS(CONTENT_TYPES_NS, "Override");
    override.setAttribute("PartName", partName);
    override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml");
    xml.documentElement.append(override);
  }
  archive[path] = strToU8(serializeXml(xml));
}

function footerXml(
  type: Exclude<FooterType, "none">,
  text: string,
  requestedFormat: FooterFormat,
  pageCount: number,
) {
  const format = footerFormatForType(type, requestedFormat);
  const totalPages = Math.max(1, Math.trunc(pageCount));
  const currentPage = fieldRun("PAGE", "1");
  const totalPageCount = fieldRun("NUMPAGES", String(totalPages));
  const pageContents = format === "number-of-total"
    ? `${currentPage}${textRun(" / ")}${totalPageCount}`
    : format === "page-only"
      ? `${textRun("Page ")}${currentPage}`
      : format === "number-only"
        ? currentPage
        : `${textRun("Page ")}${currentPage}${textRun(" / ")}${totalPageCount}`;
  const dateInstruction = format === "date-short"
    ? 'DATE \\@ "dd/MM/yyyy"'
    : format === "date-iso"
      ? 'DATE \\@ "yyyy-MM-dd"'
      : 'DATE \\@ "d MMMM yyyy"';
  const contents = type === "page"
    ? pageContents
    : type === "date"
      ? fieldRun(dateInstruction, formatFooterText("date", format))
      : textRun(text.trim());
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="${WORD_NS}"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120"/></w:pPr>${contents}</w:p></w:ftr>`;
}

function textRun(value: string) {
  return value ? `<w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>` : "";
}

function fieldRun(instruction: string, cachedResult: string) {
  return `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${escapeXml(instruction)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${textRun(cachedResult)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}

function uniqueRelationshipId(used: Set<string>, prefix = "rIdEfsFooter") {
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function ensureContentTypes(archive: Record<string, Uint8Array>) {
  const path = "[Content_Types].xml";
  return archive[path]
    ? parseXml(strFromU8(archive[path]))
    : parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CONTENT_TYPES_NS}"/>`);
}

function studioStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${WORD_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Titre"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Sous-titre"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Titre 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Titre 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="Titre 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="2"/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="Titre 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`;
}

function ensureQuickFormatStyle(styles: XMLDocument, style: Element) {
  let changed = false;
  for (const hiddenProperty of ["semiHidden", "unhideWhenUsed"]) {
    const property = directChild(style, hiddenProperty);
    if (!property) continue;
    property.remove();
    changed = true;
  }
  if (!directChild(style, "qFormat")) {
    style.append(styles.createElementNS(WORD_NS, "w:qFormat"));
    changed = true;
  }
  return changed;
}

function isRetiredQuickFormatStyle(styleId: string, styleName: string) {
  const normalizedId = styleId.trim().toLocaleLowerCase("fr");
  const normalizedName = styleName.trim().toLocaleLowerCase("fr");
  return RETIRED_QUICK_FORMAT_STYLES.has(normalizedId) || RETIRED_QUICK_FORMAT_STYLES.has(normalizedName);
}

function removeRetiredQuickFormatStyle(style: Element) {
  const quickFormat = directChild(style, "qFormat");
  if (!quickFormat) return false;
  quickFormat.remove();
  return true;
}

function docxParagraphText(paragraph: Element) {
  let text = "";
  const visit = (element: Element) => {
    for (const child of [...element.children]) {
      if (child.localName === "p") continue;
      if (child.localName === "t") text += child.textContent ?? "";
      else if (child.localName === "tab") text += "\t";
      else if (child.localName === "br" || child.localName === "cr") text += "\n";
      else if (child.localName === "noBreakHyphen") text += "‑";
      else if (child.localName === "sym") {
        const codePoint = Number.parseInt(attribute(child, "char"), 16);
        if (Number.isFinite(codePoint)) text += String.fromCodePoint(codePoint);
      } else visit(child);
    }
  };
  visit(paragraph);
  return text;
}

function parseXml(value: string) {
  const xml = new DOMParser().parseFromString(value, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("La structure XML du DOCX est invalide.");
  return xml;
}

function serializeXml(xml: XMLDocument) {
  return new XMLSerializer().serializeToString(xml);
}

function elementsByLocalName(root: ParentNode, name: string) {
  return [...root.querySelectorAll("*")].filter((element) => element.localName === name);
}

function directChildren(element: Element, name: string) {
  return [...element.children].filter((child) => child.localName === name);
}

function directChild(element: Element | undefined, name: string) {
  return element ? directChildren(element, name)[0] : undefined;
}

function attribute(element: Element | undefined | null, name: string) {
  if (!element) return "";
  return [...element.attributes].find((item) => item.localName === name)?.value ?? "";
}

function escapeXml(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function docxBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: DOCX_MIME });
}
