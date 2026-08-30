import { strToU8, zipSync } from "fflate";

import { safeFilename } from "@/lib/project-file";
import {
  stripHtml, type FooterType, type PageFormat, type StudioPage, type StudioProject, type StudioVolume,
} from "@/lib/studio";

export type WritingExportFormat = "doc" | "docx" | "odt" | "pdf" | "html" | "txt";
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

const PAGE_DIMENSIONS_MM: Record<PageFormat, { width: number; height: number }> = {
  free: { width: 210, height: 297 },
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  pocket: { width: 110, height: 178 },
  novel: { width: 140, height: 216 },
  large: { width: 170, height: 240 },
};

const allowedExportElements = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FONT", "H1", "H2", "H3",
  "HR", "I", "LI", "OL", "P", "SPAN", "STRIKE", "STRONG", "U", "UL",
]);

const blockElements = new Set(["BLOCKQUOTE", "DIV", "H1", "H2", "H3", "LI", "OL", "P", "UL"]);

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

  openPrintDialog(buildHtml(manuscript));
  return "print";
}

function createManuscript(project: StudioProject, volumeId: string): Manuscript {
  const volume = project.volumes.find((candidate) => candidate.id === volumeId);
  if (!volume) throw new Error("Le manuscrit sélectionné est introuvable.");
  const pages: ManuscriptPage[] = [];
  let pageNumber = 0;

  volume.chapters.forEach((chapter) => {
    chapter.pages.forEach((page) => {
      pageNumber += 1;
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
${pageRules}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#222}body{font:12pt/1.55 Georgia,"Times New Roman",serif}.manuscript-page{position:relative;width:var(--page-width);height:var(--page-height);margin:0 auto;padding:18mm;overflow:hidden;overflow-wrap:anywhere}.hard-page-break{height:0;break-before:page;page-break-before:always}.page-content h1,.page-content h2,.page-content h3{line-height:1.25}.page-content blockquote{margin-left:1.5em;border-left:3px solid #aaa;padding-left:1em}.manuscript-page footer{position:absolute;right:18mm;bottom:8mm;left:18mm;text-align:center;font-size:9pt;color:#666}@media screen{body{padding:24px;background:#e7e4e8}.manuscript-page{margin-bottom:24px;background:#fff;box-shadow:0 8px 30px #0002}}@media print{.manuscript-page{margin:0}.hard-page-break{display:block}}
</style></head><body>${pages}</body></html>`;
}

function buildDocx(manuscript: Manuscript) {
  const pageXml = manuscript.pages.map((item, index) => {
    const parts = [];
    parts.push(...htmlToDocxParagraphs(item.page.content));
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    if (footer) parts.push(docxParagraph([documentTextNode(footer)], { color: "666666", size: 18 }, "120", "center"));
    if (index < manuscript.pages.length - 1) parts.push(docxSectionBreak(item.format));
    return parts.join("");
  }).join("");
  const finalSection = docxSectionProperties(manuscript.pages.at(-1)?.format ?? "a4");
  const archive = zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${pageXml}${finalSection}</w:body></w:document>`),
  }, { level: 6 });
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
};

function htmlToDocxParagraphs(html: string) {
  const body = parseRichHtml(html);
  if (!body) return [docxParagraph([documentTextNode(stripHtml(html))])];
  return docxContainerParagraphs(body);
}

function docxContainerParagraphs(container: ParentNode): string[] {
  const paragraphs: string[] = [];
  let inlineNodes: Node[] = [];
  const flushInline = () => {
    if (!inlineNodes.length) return;
    paragraphs.push(docxParagraph(inlineNodes));
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
        paragraphs.push(docxParagraph([...item.childNodes], {}, "120", undefined, node.tagName === "OL" ? `${index + 1}. ` : "• "));
      });
    } else if (node.tagName === "DIV" && [...node.children].some((child) => blockElements.has(child.tagName))) {
      paragraphs.push(...docxContainerParagraphs(node));
    } else {
      const headingSize = node.tagName === "H1" ? 32 : node.tagName === "H2" ? 28 : node.tagName === "H3" ? 24 : undefined;
      paragraphs.push(docxParagraph([...node.childNodes], { bold: Boolean(headingSize), size: headingSize }, node.tagName === "BLOCKQUOTE" ? "360" : "120"));
    }
  });
  flushInline();
  return paragraphs.length ? paragraphs : [docxParagraph([documentTextNode("")])];
}

function docxParagraph(
  nodes: Node[],
  baseStyle: DocxRunStyle = {},
  spacingAfter = "120",
  alignment?: "center",
  prefix = "",
) {
  const paragraphProperties = `<w:pPr><w:spacing w:after="${spacingAfter}"/>${alignment ? `<w:jc w:val="${alignment}"/>` : ""}</w:pPr>`;
  const prefixRun = prefix ? docxTextRun(prefix, baseStyle) : "";
  return `<w:p>${paragraphProperties}${prefixRun}${nodes.map((node) => docxRuns(node, baseStyle)).join("")}</w:p>`;
}

function docxRuns(node: Node, inherited: DocxRunStyle): string {
  if (node.nodeType === Node.TEXT_NODE) return docxTextRun(node.textContent ?? "", inherited);
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return `<w:r><w:br/></w:r>`;
  if (node.tagName === "HR") return docxTextRun("────────", { ...inherited, color: "999999" });
  const style = docxElementStyle(node, inherited);
  return [...node.childNodes].map((child) => docxRuns(child, style)).join("");
}

function docxElementStyle(element: HTMLElement, inherited: DocxRunStyle): DocxRunStyle {
  const style = { ...inherited };
  if (["B", "STRONG"].includes(element.tagName) || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) style.bold = true;
  if (["I", "EM"].includes(element.tagName) || element.style.fontStyle === "italic") style.italic = true;
  if (element.tagName === "U" || element.style.textDecoration.includes("underline")) style.underline = true;
  if (element.tagName === "STRIKE" || element.style.textDecoration.includes("line-through")) style.strike = true;
  const color = normalizeExportColor(element.getAttribute("color") ?? element.style.color);
  if (color) style.color = color;
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
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(cleanXmlText(text))}</w:t></w:r>`;
}

function buildOdt(manuscript: Manuscript) {
  const dynamicStyles = new Map<string, string>();
  const pages = manuscript.pages.map((item, index) => {
    const parts = [`<text:p text:style-name="${index === 0 ? "First" : "Next"}-${item.format}"/>`];
    parts.push(...htmlToOdtParagraphs(item.page.content, dynamicStyles));
    const footer = pageFooter(manuscript, item.page, item.pageNumber);
    if (footer) parts.push(`<text:p text:style-name="Footer">${escapeXml(footer)}</text:p>`);
    return parts.join("");
  }).join("");
  const automaticStyles = [...dynamicStyles.entries()].map(([properties, name]) => `<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`).join("");
  const pageStartStyles = Object.keys(PAGE_DIMENSIONS_MM).map((format) =>
    `<style:style style:name="First-${format}" style:family="paragraph" style:master-page-name="Master-${format}"><style:paragraph-properties fo:margin="0mm" fo:line-height="0.1pt"/><style:text-properties fo:font-size="1pt"/></style:style><style:style style:name="Next-${format}" style:family="paragraph" style:master-page-name="Master-${format}"><style:paragraph-properties fo:break-before="page" fo:margin="0mm" fo:line-height="0.1pt"/><style:text-properties fo:font-size="1pt"/></style:style>`,
  ).join("");
  const pageLayouts = Object.entries(PAGE_DIMENSIONS_MM).map(([format, dimensions]) =>
    `<style:page-layout style:name="Layout-${format}"><style:page-layout-properties fo:page-width="${dimensions.width}mm" fo:page-height="${dimensions.height}mm" fo:margin="18mm"/></style:page-layout>`,
  ).join("");
  const masterPages = Object.keys(PAGE_DIMENSIONS_MM).map((format) =>
    `<style:master-page style:name="Master-${format}" style:page-layout-name="Layout-${format}"/>`,
  ).join("");
  const archive = zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "META-INF/manifest.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`),
    "content.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles>${pageStartStyles}<style:style style:name="Footer" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:color="#666666"/></style:style>${automaticStyles}</office:automatic-styles><office:body><office:text>${pages}</office:text></office:body></office:document-content>`),
    "styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles>${pageLayouts}</office:automatic-styles><office:master-styles>${masterPages}</office:master-styles></office:document-styles>`),
  }, { level: 0 });
  return blobFromBytes(archive, "application/vnd.oasis.opendocument.text");
}

function htmlToOdtParagraphs(html: string, styles: Map<string, string>) {
  const body = parseRichHtml(html);
  if (!body) return [`<text:p>${escapeXml(stripHtml(html))}</text:p>`];
  const paragraphs: string[] = [];
  let inlineNodes: Node[] = [];
  const flushInline = () => {
    if (!inlineNodes.length) return;
    paragraphs.push(`<text:p>${inlineNodes.map((node) => odtInline(node, styles)).join("")}</text:p>`);
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
        paragraphs.push(`<text:p>${escapeXml(prefix)}${[...item.childNodes].map((child) => odtInline(child, styles)).join("")}</text:p>`);
      });
    } else if (node.tagName === "DIV" && [...node.children].some((child) => blockElements.has(child.tagName))) {
      paragraphs.push(...htmlToOdtParagraphs(node.innerHTML, styles));
    } else if (["H1", "H2", "H3"].includes(node.tagName)) {
      paragraphs.push(`<text:h text:outline-level="${node.tagName.slice(1)}">${[...node.childNodes].map((child) => odtInline(child, styles)).join("")}</text:h>`);
    } else {
      paragraphs.push(`<text:p>${[...node.childNodes].map((child) => odtInline(child, styles)).join("")}</text:p>`);
    }
  });
  flushInline();
  return paragraphs.length ? paragraphs : ["<text:p/>"];
}

function odtInline(node: Node, styles: Map<string, string>): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeXml(cleanXmlText(node.textContent ?? ""));
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return "<text:line-break/>";
  if (node.tagName === "HR") return "────────";
  const properties: string[] = [];
  if (["B", "STRONG"].includes(node.tagName) || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600) properties.push('fo:font-weight="bold"');
  if (["I", "EM"].includes(node.tagName) || node.style.fontStyle === "italic") properties.push('fo:font-style="italic"');
  if (node.tagName === "U" || node.style.textDecoration.includes("underline")) properties.push('style:text-underline-style="solid" style:text-underline-width="auto"');
  if (node.tagName === "STRIKE" || node.style.textDecoration.includes("line-through")) properties.push('style:text-line-through-style="solid"');
  const color = normalizeExportColor(node.getAttribute("color") ?? node.style.color);
  if (color) properties.push(`fo:color="#${color}"`);
  const font = node.getAttribute("face") ?? node.style.fontFamily;
  if (font) properties.push(`fo:font-family="${escapeXml(font.replace(/["']/g, "").split(",")[0].trim())}"`);
  const size = htmlFontSize(node.getAttribute("size"), node.style.fontSize);
  if (size) properties.push(`fo:font-size="${size / 2}pt"`);
  const content = [...node.childNodes].map((child) => odtInline(child, styles)).join("");
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
      if (!["href", "style", "color", "size", "face"].includes(name) || name.startsWith("on")) element.removeAttribute(attribute.name);
    });
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) element.removeAttribute("href");
    }
  });
  return parsed.body;
}

function htmlToPlainText(html: string) {
  const body = parseRichHtml(html);
  if (!body) return stripHtml(html);
  body.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  body.querySelectorAll("p,div,h1,h2,h3,blockquote,li").forEach((element) => element.append("\n"));
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

function docxSectionProperties(format: PageFormat, nextPage = false) {
  const pageSize = docxPageSize(format);
  return `<w:sectPr>${nextPage ? '<w:type w:val="nextPage"/>' : ""}<w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"/><w:pgMar w:top="1021" w:right="1021" w:bottom="1021" w:left="1021"/></w:sectPr>`;
}

function docxSectionBreak(format: PageFormat) {
  return `<w:p><w:pPr>${docxSectionProperties(format, true)}</w:pPr></w:p>`;
}

function documentTextNode(value: string) {
  return document.createTextNode(value);
}

function openPrintDialog(html: string) {
  const printWindow = window.open("", "_blank", "width=960,height=760");
  if (!printWindow) throw new Error("La fenêtre d’impression a été bloquée par le navigateur.");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.addEventListener("load", () => window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 150), { once: true });
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
