import { strToU8, zipSync } from "fflate";

import { safeFilename } from "@/lib/project-file";
import {
  stripHtml, type FooterType, type PageFormat, type StudioPage, type StudioProject, type StudioVolume,
} from "@/lib/studio";

export type WritingExportFormat = "doc" | "docx" | "odt" | "pdf" | "print" | "html" | "txt";
export type WritingExportResult = "download" | "print";

type ManuscriptPage = {
  page: StudioPage;
  format: PageFormat;
  pageNumber: number;
};

type Manuscript = {
  projectName: string;
  volume: StudioVolume;
  pages: ManuscriptPage[];
  footerType: FooterType;
  footerText: string;
};

type EmbeddedImage = {
  src: string;
  bytes: Uint8Array;
  extension: "png" | "jpg" | "gif" | "webp";
  mimeType: string;
  name: string;
  relationshipId: string;
  index: number;
};

const PAGE_DIMENSIONS_MM: Record<PageFormat, { width: number; height: number }> = {
  free: { width: 210, height: 297 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  pocket: { width: 110, height: 178 },
  novel: { width: 140, height: 216 },
  large: { width: 170, height: 240 },
};

const allowedExportElements = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4",
  "HR", "I", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG",
  "SUB", "SUP", "U", "UL",
]);

const blockElements = new Set(["BLOCKQUOTE", "DIV", "H1", "H2", "H3", "H4", "LI", "OL", "P", "PRE", "UL"]);

export function getManuscriptPageCount(project: StudioProject, volumeId: string) {
  return createManuscript(project, volumeId).pages.length;
}

/** @deprecated Use getManuscriptPageCount. */
export const getWrittenPageCount = getManuscriptPageCount;

export function getManuscriptFilename(project: StudioProject, volumeId: string) {
  const volume = project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) return safeFilename(project.name);
  return safeFilename(`${project.name}-${volume.title}`).replace(/-+/g, "-");
}

export function exportProjectWriting(
  project: StudioProject,
  volumeId: string,
  format: WritingExportFormat,
): WritingExportResult {
  const manuscript = createManuscript(project, volumeId);
  if (!manuscript.pages.length) throw new Error("Ce manuscrit ne contient aucune page.");
  const filename = getManuscriptFilename(project, volumeId);

  if (format === "txt") {
    download(new Blob([buildPlainText(manuscript)], { type: "text/plain;charset=utf-8" }), `${filename}.txt`);
    return "download";
  }
  if (format === "html" || format === "doc") {
    const html = buildHtml(manuscript);
    const mime = format === "doc" ? "application/msword" : "text/html;charset=utf-8";
    download(new Blob([html], { type: mime }), `${filename}.${format}`);
    return "download";
  }
  if (format === "docx") {
    download(buildDocx(manuscript), `${filename}.docx`);
    return "download";
  }
  if (format === "odt") {
    download(buildOdt(manuscript), `${filename}.odt`);
    return "download";
  }

  openPrintDialog(buildHtml(manuscript), format === "pdf" ? "pdf" : "print");
  return "print";
}

function createManuscript(project: StudioProject, volumeId: string): Manuscript {
  const volume = project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) throw new Error("Le manuscrit sélectionné est introuvable.");
  const pages: ManuscriptPage[] = [];
  let pageNumber = 0;

  volume.chapters.forEach((chapter) => {
    chapter.pages.forEach((page) => {
      if (!page.ignoreProjectFooter) pageNumber += 1;
      pages.push({
        page,
        format: page.formatOverride ?? project.defaultPageFormat,
        pageNumber,
      });
    });
  });

  return {
    projectName: project.name,
    volume,
    pages,
    footerType: project.footerType,
    footerText: project.footerText,
  };
}

function buildPlainText(manuscript: Manuscript) {
  return manuscript.pages.map((item) => {
    const parts = [];
    parts.push(htmlToPlainText(item.page.content));
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    if (footer) parts.push("", footer);
    return parts.join("\n").trim();
  }).join("\f");
}

function buildHtml(manuscript: Manuscript) {
  const title = `${manuscript.projectName} — ${manuscript.volume.title}`;
  const pageRules = Object.entries(PAGE_DIMENSIONS_MM).map(([format, dimensions]) =>
    `@page page-${format}{size:${dimensions.width}mm ${dimensions.height}mm;margin:0}.manuscript-page.format-${format}{page:page-${format}}`,
  ).join("");
  const pages = manuscript.pages.map((item) => {
    const dimensions = PAGE_DIMENSIONS_MM[item.format];
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    const content = sanitizeRichHtml(item.page.content) || "<p><br></p>";
    return `<section class="manuscript-page format-${item.format}" style="--page-width:${dimensions.width}mm;--page-height:${dimensions.height}mm"><div class="page-content">${content}</div>${footer ? `<footer>${escapeXml(footer)}</footer>` : ""}</section>`;
  }).join('<div class="hard-page-break" style="page-break-before:always;mso-break-type:page-break"></div>');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>
${pageRules}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#222}body{font:12pt/1.55 Georgia,"Times New Roman",serif}.manuscript-page{position:relative;width:var(--page-width);height:var(--page-height);margin:0 auto;padding:18mm;overflow:hidden;overflow-wrap:anywhere}.hard-page-break{height:0;break-before:page;page-break-before:always}.page-content h1,.page-content h2,.page-content h3,.page-content h4{line-height:1.25}.page-content blockquote{margin-left:1.5em;border-left:3px solid #aaa;padding-left:1em}.page-content img{display:block;max-width:100%;height:auto;margin:1em auto}.page-content pre{white-space:pre-wrap;font-family:monospace}.manuscript-page footer{position:absolute;right:18mm;bottom:8mm;left:18mm;text-align:center;font-size:9pt;color:#666}@media screen{body{padding:24px;background:#e7e4e8}.manuscript-page{margin-bottom:24px;background:#fff;box-shadow:0 8px 30px #0002}}@media print{.manuscript-page{margin:0}.hard-page-break{display:block}}
</style></head><body>${pages}</body></html>`;
}

function collectEmbeddedImages(manuscript: Manuscript) {
  const images: EmbeddedImage[] = [];
  const seen = new Set<string>();
  manuscript.pages.forEach((item) => {
    const body = parseRichHtml(item.page.content);
    body?.querySelectorAll("img").forEach((element) => {
      const src = element.getAttribute("src") ?? "";
      if (!src || seen.has(src)) return;
      const match = src.match(/^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i);
      if (!match) return;
      const rawExtension = match[1].toLowerCase();
      const extension = rawExtension === "jpeg" ? "jpg" : rawExtension as EmbeddedImage["extension"];
      const binary = window.atob(match[2].replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const index = images.length + 1;
      images.push({
        src,
        bytes,
        extension,
        mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
        name: `image${index}.${extension}`,
        relationshipId: `rIdImage${index}`,
        index,
      });
      seen.add(src);
    });
  });
  return images;
}

function buildDocx(manuscript: Manuscript) {
  const embeddedImages = collectEmbeddedImages(manuscript);
  const imagesBySource = new Map(embeddedImages.map((image) => [image.src, image]));
  const pageXml = manuscript.pages.map((item, index) => {
    const parts = [];
    parts.push(...htmlToDocxParagraphs(item.page.content, imagesBySource));
    if (index < manuscript.pages.length - 1) parts.push(docxSectionBreak(item.format, `rIdFooter${index + 1}`));
    return parts.join("");
  }).join("");
  const finalSection = docxSectionProperties(manuscript.pages.at(-1)?.format ?? "a4", false, `rIdFooter${manuscript.pages.length}`);
  const imageContentTypes = [...new Map(embeddedImages.map((image) => [image.extension, image.mimeType])).entries()]
    .map(([extension, mimeType]) => `<Default Extension="${extension}" ContentType="${mimeType}"/>`).join("");
  const documentRelationships = [
    ...embeddedImages.map((image) => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${image.name}"/>`),
    ...manuscript.pages.map((_, index) => `<Relationship Id="rIdFooter${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer${index + 1}.xml"/>`),
  ].join("");
  const footerContentTypes = manuscript.pages.map((_, index) => `<Override PartName="/word/footer${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`).join("");
  const archiveFiles: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageContentTypes}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${footerContentTypes}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${documentRelationships}</Relationships>`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${pageXml}${finalSection}</w:body></w:document>`),
  };
  embeddedImages.forEach((image) => { archiveFiles[`word/media/${image.name}`] = image.bytes; });
  manuscript.pages.forEach((item, index) => {
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    archiveFiles[`word/footer${index + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${footer ? docxTextRun(footer, { color: "666666", size: 18 }) : ""}</w:p></w:ftr>`);
  });
  const archive = zipSync(archiveFiles, { level: 6 });
  return blobFromBytes(archive, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

type DocxRunStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  font?: string;
  size?: number;
  shading?: string;
  verticalAlign?: "subscript" | "superscript";
};

function htmlToDocxParagraphs(html: string, images: Map<string, EmbeddedImage>) {
  const body = parseRichHtml(html);
  if (!body) return [docxParagraph([documentTextNode(stripHtml(html))])];
  return docxContainerParagraphs(body, images);
}

function docxContainerParagraphs(container: ParentNode, images: Map<string, EmbeddedImage>): string[] {
  const paragraphs: string[] = [];
  let inlineNodes: Node[] = [];
  const flushInline = () => {
    if (!inlineNodes.length) return;
    paragraphs.push(docxParagraph(inlineNodes, {}, "120", undefined, "", 0, images));
    inlineNodes = [];
  };

  container.childNodes.forEach((node) => {
    if (!(node instanceof Element) || !blockElements.has(node.tagName)) {
      inlineNodes.push(node);
      return;
    }
    flushInline();
    if (node.tagName === "UL" || node.tagName === "OL") {
      [...node.children].filter((child) => child.tagName === "LI").forEach((item, index) => {
        paragraphs.push(docxParagraph([...item.childNodes], {}, "120", undefined, node.tagName === "OL" ? `${index + 1}. ` : "• ", 0, images));
      });
    } else if (node.tagName === "DIV" && [...node.children].some((child) => blockElements.has(child.tagName))) {
      paragraphs.push(...docxContainerParagraphs(node, images));
    } else {
      const headingSize = node.tagName === "H1" ? 32 : node.tagName === "H2" ? 28 : node.tagName === "H3" ? 24 : node.tagName === "H4" ? 22 : undefined;
      const element = node as HTMLElement;
      const alignment = docxAlignment(element.style.textAlign);
      const indent = node.tagName === "BLOCKQUOTE" ? 360 : cssIndentTwips(element.style.marginLeft || element.style.paddingLeft);
      paragraphs.push(docxParagraph([...node.childNodes], { bold: Boolean(headingSize), size: headingSize }, "120", alignment, "", indent, images));
    }
  });
  flushInline();
  return paragraphs.length ? paragraphs : [docxParagraph([documentTextNode("")])];
}

function docxParagraph(
  nodes: Node[],
  baseStyle: DocxRunStyle = {},
  spacingAfter = "120",
  alignment?: "left" | "center" | "right" | "both",
  prefix = "",
  indent = 0,
  images = new Map<string, EmbeddedImage>(),
) {
  const paragraphProperties = `<w:pPr><w:spacing w:after="${spacingAfter}"/>${alignment ? `<w:jc w:val="${alignment}"/>` : ""}${indent ? `<w:ind w:left="${indent}"/>` : ""}</w:pPr>`;
  const prefixRun = prefix ? docxTextRun(prefix, baseStyle) : "";
  return `<w:p>${paragraphProperties}${prefixRun}${nodes.map((node) => docxRuns(node, baseStyle, images)).join("")}</w:p>`;
}

function docxRuns(node: Node, inherited: DocxRunStyle, images: Map<string, EmbeddedImage>): string {
  if (node.nodeType === Node.TEXT_NODE) return docxTextRun(node.textContent ?? "", inherited);
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return `<w:r><w:br/></w:r>`;
  if (node.tagName === "HR") return docxTextRun("────────", { ...inherited, color: "999999" });
  if (node.tagName === "IMG") {
    const image = images.get(node.getAttribute("src") ?? "");
    return image ? docxImageRun(image, node.getAttribute("alt") ?? image.name) : "";
  }
  const style = docxElementStyle(node, inherited);
  return [...node.childNodes].map((child) => docxRuns(child, style, images)).join("");
}

function docxImageRun(image: EmbeddedImage, alt: string) {
  const width = 4_572_000;
  const height = 3_048_000;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${image.index}" name="${escapeXml(image.name)}" descr="${escapeXml(alt)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXml(image.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function docxElementStyle(element: HTMLElement, inherited: DocxRunStyle): DocxRunStyle {
  const style = { ...inherited };
  if (["B", "STRONG"].includes(element.tagName) || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) style.bold = true;
  if (["I", "EM"].includes(element.tagName) || element.style.fontStyle === "italic") style.italic = true;
  if (element.tagName === "U" || element.style.textDecoration.includes("underline")) style.underline = true;
  if (["S", "STRIKE"].includes(element.tagName) || element.style.textDecoration.includes("line-through")) style.strike = true;
  if (element.tagName === "SUB") style.verticalAlign = "subscript";
  if (element.tagName === "SUP") style.verticalAlign = "superscript";
  const color = normalizeExportColor(element.getAttribute("color") ?? element.style.color);
  if (color) style.color = color;
  const shading = normalizeExportColor(element.style.backgroundColor);
  if (shading) style.shading = shading;
  const font = element.getAttribute("face") ?? element.style.fontFamily;
  if (font) style.font = font.replace(/["']/g, "").split(",")[0].trim();
  const size = htmlFontSize(element.getAttribute("size"), element.style.fontSize);
  if (size) style.size = size;
  return style;
}

function docxTextRun(text: string, style: DocxRunStyle) {
  if (!text) return "";
  const properties = [
    style.bold ? "<w:b/>" : "",
    style.italic ? "<w:i/>" : "",
    style.underline ? '<w:u w:val="single"/>' : "",
    style.strike ? "<w:strike/>" : "",
    style.color ? `<w:color w:val="${style.color}"/>` : "",
    style.font ? `<w:rFonts w:ascii="${escapeXml(style.font)}" w:hAnsi="${escapeXml(style.font)}"/>` : "",
    style.size ? `<w:sz w:val="${style.size}"/><w:szCs w:val="${style.size}"/>` : "",
    style.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${style.shading}"/>` : "",
    style.verticalAlign ? `<w:vertAlign w:val="${style.verticalAlign}"/>` : "",
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(cleanXmlText(text))}</w:t></w:r>`;
}

function buildOdt(manuscript: Manuscript) {
  const dynamicStyles = new Map<string, string>();
  const embeddedImages = collectEmbeddedImages(manuscript);
  const imagesBySource = new Map(embeddedImages.map((image) => [image.src, image]));
  const pages = manuscript.pages.map((item, index) => {
    const parts = [`<text:p text:style-name="PageStart-${index + 1}"/>`];
    parts.push(...htmlToOdtParagraphs(item.page.content, dynamicStyles, imagesBySource));
    return parts.join("");
  }).join("");
  const automaticStyles = [...dynamicStyles.entries()].map(([properties, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`).join("");
  const pageStartStyles = manuscript.pages.map((_, index) =>
    `<style:style style:name="PageStart-${index + 1}" style:family="paragraph" style:master-page-name="MasterPage-${index + 1}"><style:paragraph-properties ${index ? 'fo:break-before="page" ' : ""}fo:margin="0mm" fo:line-height="0.1pt"/><style:text-properties fo:font-size="1pt"/></style:style>`,
  ).join("");
  const pageLayouts = Object.entries(PAGE_DIMENSIONS_MM).map(([format, dimensions]) =>
    `<style:page-layout style:name="Layout-${format}"><style:page-layout-properties fo:page-width="${dimensions.width}mm" fo:page-height="${dimensions.height}mm" fo:margin="18mm"/></style:page-layout>`,
  ).join("");
  const masterPages = manuscript.pages.map((item, index) => {
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    return `<style:master-page style:name="MasterPage-${index + 1}" style:page-layout-name="Layout-${item.format}"><style:footer><text:p text:style-name="Footer">${escapeXml(footer)}</text:p></style:footer></style:master-page>`;
  }).join("");
  const imageManifest = embeddedImages.map((image) => `<manifest:file-entry manifest:full-path="Pictures/${image.name}" manifest:media-type="${image.mimeType}"/>`).join("");
  const archiveFiles: Record<string, Uint8Array> = {
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "META-INF/manifest.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>${imageManifest}</manifest:manifest>`),
    "content.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"><office:automatic-styles>${pageStartStyles}${automaticStyles}</office:automatic-styles><office:body><office:text>${pages}</office:text></office:body></office:document-content>`),
    "styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:styles><style:style style:name="Footer" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style></office:styles><office:automatic-styles>${pageLayouts}</office:automatic-styles><office:master-styles>${masterPages}</office:master-styles></office:document-styles>`),
  };
  embeddedImages.forEach((image) => { archiveFiles[`Pictures/${image.name}`] = image.bytes; });
  const archive = zipSync(archiveFiles, { level: 0 });
  return blobFromBytes(archive, "application/vnd.oasis.opendocument.text");
}

function htmlToOdtParagraphs(html: string, styles: Map<string, string>, images: Map<string, EmbeddedImage>) {
  const body = parseRichHtml(html);
  if (!body) return [`<text:p>${escapeXml(stripHtml(html))}</text:p>`];
  const paragraphs: string[] = [];
  let inlineNodes: Node[] = [];
  const flushInline = () => {
    if (!inlineNodes.length) return;
    paragraphs.push(`<text:p>${inlineNodes.map((node) => odtInline(node, styles, images)).join("")}</text:p>`);
    inlineNodes = [];
  };
  body.childNodes.forEach((node) => {
    if (!(node instanceof Element) || !blockElements.has(node.tagName)) {
      inlineNodes.push(node);
      return;
    }
    flushInline();
    if (node.tagName === "UL" || node.tagName === "OL") {
      [...node.children].filter((child) => child.tagName === "LI").forEach((item, index) => {
        const prefix = node.tagName === "OL" ? `${index + 1}. ` : "• ";
        paragraphs.push(`<text:p>${escapeXml(prefix)}${[...item.childNodes].map((child) => odtInline(child, styles, images)).join("")}</text:p>`);
      });
    } else if (node.tagName === "DIV" && [...node.children].some((child) => blockElements.has(child.tagName))) {
      paragraphs.push(...htmlToOdtParagraphs(node.innerHTML, styles, images));
    } else if (["H1", "H2", "H3", "H4"].includes(node.tagName)) {
      paragraphs.push(`<text:h text:outline-level="${node.tagName.slice(1)}">${[...node.childNodes].map((child) => odtInline(child, styles, images)).join("")}</text:h>`);
    } else {
      paragraphs.push(`<text:p>${[...node.childNodes].map((child) => odtInline(child, styles, images)).join("")}</text:p>`);
    }
  });
  flushInline();
  return paragraphs.length ? paragraphs : ["<text:p/>"];
}

function odtInline(node: Node, styles: Map<string, string>, images: Map<string, EmbeddedImage>): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeXml(cleanXmlText(node.textContent ?? ""));
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "<text:line-break/>";
  if (node.tagName === "HR") return "────────";
  if (node.tagName === "IMG") {
    const image = images.get(node.getAttribute("src") ?? "");
    if (!image) return "";
    return `<draw:frame draw:name="${escapeXml(image.name)}" text:anchor-type="as-char" svg:width="120mm" svg:height="80mm"><draw:image xlink:href="Pictures/${image.name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
  }
  const properties: string[] = [];
  if (["B", "STRONG"].includes(node.tagName) || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600) properties.push('fo:font-weight="bold"');
  if (["I", "EM"].includes(node.tagName) || node.style.fontStyle === "italic") properties.push('fo:font-style="italic"');
  if (node.tagName === "U" || node.style.textDecoration.includes("underline")) properties.push('style:text-underline-style="solid" style:text-underline-width="auto"');
  if (["S", "STRIKE"].includes(node.tagName) || node.style.textDecoration.includes("line-through")) properties.push('style:text-line-through-style="solid"');
  if (node.tagName === "SUB") properties.push('style:text-position="sub 58%"');
  if (node.tagName === "SUP") properties.push('style:text-position="super 58%"');
  const backgroundColor = normalizeExportColor(node.style.backgroundColor);
  if (backgroundColor) properties.push(`fo:background-color="#${backgroundColor}"`);
  const color = normalizeExportColor(node.getAttribute("color") ?? node.style.color);
  if (color) properties.push(`fo:color="#${color}"`);
  const font = node.getAttribute("face") ?? node.style.fontFamily;
  if (font) properties.push(`fo:font-family="${escapeXml(font.replace(/["']/g, "").split(",")[0].trim())}"`);
  const size = htmlFontSize(node.getAttribute("size"), node.style.fontSize);
  if (size) properties.push(`fo:font-size="${size / 2}pt"`);
  const content = [...node.childNodes].map((child) => odtInline(child, styles, images)).join("");
  if (!properties.length) return content;
  const key = properties.sort().join(" ");
  let styleName = styles.get(key);
  if (!styleName) {
    styleName = `T${styles.size + 1}`;
    styles.set(key, styleName);
  }
  return `<text:span text:style-name="${styleName}">${content}</text:span>`;
}

function sanitizeRichHtml(html: string) {
  const body = parseRichHtml(html);
  return body?.innerHTML ?? escapeXml(stripHtml(html));
}

function parseRichHtml(html: string) {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  [...parsed.body.querySelectorAll("*")].forEach((element) => {
    if (!allowedExportElements.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (!["href", "style", "color", "size", "face", "src", "alt", "title"].includes(name) || name.startsWith("on")) element.removeAttribute(attribute.name);
    });
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute("href");
    }
    if (element instanceof HTMLImageElement && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(element.src)) element.remove();
  });
  return parsed.body;
}

function htmlToPlainText(html: string) {
  const body = parseRichHtml(html);
  if (!body) return stripHtml(html);
  body.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  body.querySelectorAll("p,div,h1,h2,h3,h4,pre,blockquote,li").forEach((element) => element.append("\n"));
  return (body.textContent ?? "").split("\n").map((line) => line.trim()).filter((line, index, lines) => line || lines[index - 1]).join("\n").trim();
}

function pageFooter(manuscript: Manuscript, page: StudioPage, pageNumber: number) {
  if (page.ignoreProjectFooter) return "";
  if (manuscript.footerType === "page") return `${pageNumber}`;
  if (manuscript.footerType === "date") return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date());
  if (manuscript.footerType === "custom") return manuscript.footerText;
  return "";
}

function htmlFontSize(htmlSize: string | null, cssSize: string) {
  const htmlSizes: Record<string, number> = { "1": 18, "2": 20, "3": 24, "4": 28, "5": 36, "6": 48, "7": 64 };
  if (htmlSize && htmlSizes[htmlSize]) return htmlSizes[htmlSize];
  const value = Number.parseFloat(cssSize);
  if (!Number.isFinite(value)) return undefined;
  if (cssSize.endsWith("pt")) return Math.round(value * 2);
  if (cssSize.endsWith("px")) return Math.round(value * 1.5);
  return undefined;
}

function normalizeExportColor(value: string) {
  if (!value) return "";
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) return hex.toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
  if (!rgb) return "";
  return rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function docxPageSize(format: PageFormat) {
  const dimensions = PAGE_DIMENSIONS_MM[format];
  return {
    width: Math.round(dimensions.width / 25.4 * 1440),
    height: Math.round(dimensions.height / 25.4 * 1440),
  };
}

function docxAlignment(value: string): "left" | "center" | "right" | "both" | undefined {
  if (value === "left" || value === "center" || value === "right") return value;
  if (value === "justify") return "both";
  return undefined;
}

function cssIndentTwips(value: string) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (value.endsWith("px")) return Math.round(amount * 15);
  if (value.endsWith("pt")) return Math.round(amount * 20);
  if (value.endsWith("em")) return Math.round(amount * 240);
  return 0;
}

function docxSectionProperties(format: PageFormat, nextPage = false, footerRelationshipId?: string) {
  const pageSize = docxPageSize(format);
  return `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ""}${footerRelationshipId ? `<w:footerReference w:type="default" r:id="${footerRelationshipId}"/>` : ""}<w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"/><w:pgMar w:top="1021" w:right="1021" w:bottom="1021" w:left="1021" w:footer="454"/></w:sectPr>`;
}

function docxSectionBreak(format: PageFormat, footerRelationshipId?: string) {
  return `<w:p><w:pPr>${docxSectionProperties(format, true, footerRelationshipId)}</w:pPr></w:p>`;
}

function documentTextNode(value: string) {
  return document.createTextNode(value);
}

function openPrintDialog(html: string, mode: "pdf" | "print") {
  const printWindow = window.open("", "_blank", "width=960,height=760");
  if (!printWindow) throw new Error("La fenêtre d’impression a été bloquée par le navigateur.");
  printWindow.opener = null;
  printWindow.addEventListener("load", () => window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 150), { once: true });
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = mode === "pdf" ? "Enregistrer le manuscrit en PDF" : "Imprimer le manuscrit";
}

function cleanXmlText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function blobFromBytes(bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}
