import { strFromU8, unzipSync } from "fflate";

import type { PageFormat } from "@/lib/studio";

export type ImportedWritingDocument = {
  title: string;
  pages: string[];
  sourceFormat: "txt" | "html" | "docx" | "odt";
  pageFormat: PageFormat;
};

const PAGE_BREAK = "\uE000EFS_PAGE_BREAK\uE001";
const wordHighlightColors: Record<string, string> = {
  black: "#000000", blue: "#0000ff", cyan: "#00ffff", darkBlue: "#000080",
  darkCyan: "#008080", darkGray: "#808080", darkGreen: "#008000",
  darkMagenta: "#800080", darkRed: "#800000", darkYellow: "#808000",
  green: "#00ff00", lightGray: "#c0c0c0", magenta: "#ff00ff", red: "#ff0000",
  white: "#ffffff", yellow: "#ffff00",
};

export async function readWritingDocument(file: File): Promise<ImportedWritingDocument> {
  const title = file.name.replace(/\.[^.]+$/, "").trim() || "Texte importé";
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("fr");
  if (extension === "txt") {
    return { title, pages: textPages(await file.text()), sourceFormat: "txt", pageFormat: "free" };
  }
  if (extension === "html" || extension === "htm") {
    return { title, pages: htmlPages(await file.text()), sourceFormat: "html", pageFormat: "free" };
  }
  if (extension !== "docx" && extension !== "odt") {
    throw new Error("Format non pris en charge. Utilisez .docx, .odt, .txt, .html ou .htm.");
  }

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Le document est endommagé ou illisible.");
  }
  if (extension === "docx") {
    const xml = archive["word/document.xml"];
    if (!xml) throw new Error("Le contenu du document Word est manquant.");
    const documentXml = strFromU8(xml);
    return {
      title,
      pages: docxPages(documentXml),
      sourceFormat: "docx",
      pageFormat: docxPageFormat(documentXml),
    };
  }
  const xml = archive["content.xml"];
  if (!xml) throw new Error("Le contenu du document ODT est manquant.");
  const contentXml = strFromU8(xml);
  const stylesXml = archive["styles.xml"] ? strFromU8(archive["styles.xml"]) : "";
  return {
    title,
    pages: odtPages(contentXml, stylesXml),
    sourceFormat: "odt",
    pageFormat: odtPageFormat(contentXml, stylesXml),
  };
}

export function removeImportedFormatting(pages: string[]) {
  return pages.map((html) => {
    if (!html) return "";
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const blocks = [...parsed.body.children];
    if (!blocks.length) return `<p>${escapeHtml(parsed.body.textContent ?? "") || "<br>"}</p>`;
    return blocks.map((block) => {
      if (block.localName === "hr") return "<hr>";
      if (block.localName === "ul" || block.localName === "ol") {
        const ordered = block.localName === "ol";
        return [...block.querySelectorAll(":scope > li")]
          .map((item, index) => `<p>${ordered ? `${index + 1}.` : "•"} ${escapeHtml(item.textContent ?? "") || "<br>"}</p>`)
          .join("");
      }
      if (block.localName === "table") {
        return [...block.querySelectorAll("tr")]
          .map((row) => `<p>${escapeHtml([...row.querySelectorAll("th,td")].map((cell) => cell.textContent ?? "").join("\t")) || "<br>"}</p>`)
          .join("");
      }
      return `<p>${escapeHtml(block.textContent ?? "") || "<br>"}</p>`;
    }).join("");
  });
}

function textPages(text: string) {
  return ensurePages(text.split("\f").map((page) => page.split(/\r?\n/).map((line) => line ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>").join("")));
}

function htmlPages(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const pages: string[] = [];
  let current = "";
  for (const node of [...parsed.body.childNodes]) {
    if (!(node instanceof Element)) {
      current += node.textContent ? escapeHtml(node.textContent) : "";
      continue;
    }
    const style = node.getAttribute("style")?.toLocaleLowerCase("en") ?? "";
    const explicitBreak = node.matches("hr.page-break");
    if (explicitBreak) { pages.push(current); current = ""; continue; }
    const breakBefore = /(?:page-break-before|break-before)\s*:\s*(?:always|page)/.test(style);
    const breakAfter = /(?:page-break-after|break-after)\s*:\s*(?:always|page)/.test(style);
    if (breakBefore) { pages.push(current); current = ""; }
    current += node.outerHTML;
    if (breakAfter) { pages.push(current); current = ""; }
  }
  pages.push(current);
  return ensurePages(pages);
}

function docxPages(xml: string) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const body = firstByLocalName(documentXml, "body");
  if (!body) return [""];
  const pages: string[] = [];
  let current = "";
  for (const element of [...body.children]) {
    if (element.localName === "tbl") {
      const rows = byLocalName(element, "tr").map((row) => `<tr>${byLocalName(row, "tc").map((cell) => {
        const contents = directChildren(cell, "p").map((paragraph) => renderDocxParagraph(paragraph)).join("");
        return `<td>${contents || "<p><br></p>"}</td>`;
      }).join("")}</tr>`).join("");
      current += `<table><tbody>${rows}</tbody></table>`;
      continue;
    }
    if (element.localName !== "p") continue;
    const properties = directChild(element, "pPr");
    if (properties && directChild(properties, "pageBreakBefore") && current) {
      pages.push(current);
      current = "";
    }
    const rendered = renderDocxParagraph(element);
    const parts = rendered.split(PAGE_BREAK);
    current += parts.shift() ?? "";
    for (const part of parts) {
      pages.push(current);
      current = part;
    }
  }
  pages.push(current);
  return ensurePages(pages);
}

function renderDocxParagraph(paragraph: Element) {
  const properties = directChild(paragraph, "pPr");
  const styleName = attribute(directChild(properties, "pStyle"), "val").toLocaleLowerCase("fr");
  const heading = /heading\s*1|titre\s*1|title$/.test(styleName)
    ? "h1"
    : /heading\s*2|titre\s*2|chapitre/.test(styleName)
      ? "h2"
      : /heading\s*3|titre\s*3/.test(styleName)
        ? "h3"
        : "p";
  const styles = docxParagraphStyles(properties);
  let contents = "";
  for (const node of [...paragraph.children]) {
    if (node.localName === "r") contents += renderDocxRun(node);
    else if (node.localName === "hyperlink") contents += directChildren(node, "r").map(renderDocxRun).join("");
  }
  const numbered = Boolean(properties && firstByLocalName(properties, "numPr"));
  const tag = numbered ? "li" : heading;
  const style = styleAttribute(styles);
  const segments = contents.split(PAGE_BREAK);
  const rendered = segments.map((segment) => `<${tag}${style}>${segment || "<br>"}</${tag}>`).join(PAGE_BREAK);
  return numbered ? rendered.replaceAll(`<li${style}>`, `<ul><li${style}>`).replaceAll("</li>", "</li></ul>") : rendered;
}

function renderDocxRun(run: Element) {
  const properties = directChild(run, "rPr");
  let html = "";
  for (const node of [...run.children]) {
    if (node.localName === "t" || node.localName === "delText") html += escapeHtml(node.textContent ?? "");
    else if (node.localName === "tab") html += "&emsp;";
    else if (node.localName === "br") html += attribute(node, "type") === "page" ? PAGE_BREAK : "<br>";
    else if (node.localName === "lastRenderedPageBreak") html += PAGE_BREAK;
  }
  if (!html) return "";
  return html.split(PAGE_BREAK).map((segment) => formatDocxRunSegment(segment, properties)).join(PAGE_BREAK);
}

function formatDocxRunSegment(segment: string, properties: Element | undefined) {
  if (!segment) return "";
  let html = segment;
  if (docxPropertyEnabled(properties, "b")) html = `<strong>${html}</strong>`;
  if (docxPropertyEnabled(properties, "i")) html = `<em>${html}</em>`;
  if (docxPropertyEnabled(properties, "u")) html = `<u>${html}</u>`;
  if (docxPropertyEnabled(properties, "strike") || docxPropertyEnabled(properties, "dstrike")) html = `<s>${html}</s>`;
  const vertical = attribute(directChild(properties, "vertAlign"), "val");
  if (vertical === "superscript") html = `<sup>${html}</sup>`;
  if (vertical === "subscript") html = `<sub>${html}</sub>`;
  const styles = docxRunStyles(properties);
  return styles.length ? `<span${styleAttribute(styles)}>${html}</span>` : html;
}

function docxParagraphStyles(properties: Element | undefined) {
  if (!properties) return [];
  const styles: string[] = [];
  const alignment = attribute(directChild(properties, "jc"), "val");
  const alignmentMap: Record<string, string> = { both: "justify", center: "center", left: "left", right: "right", distribute: "justify" };
  if (alignmentMap[alignment]) styles.push(`text-align:${alignmentMap[alignment]}`);
  const indentation = directChild(properties, "ind");
  const left = twipsToPt(attribute(indentation, "left") || attribute(indentation, "start"));
  const right = twipsToPt(attribute(indentation, "right") || attribute(indentation, "end"));
  const firstLine = twipsToPt(attribute(indentation, "firstLine"));
  const hanging = twipsToPt(attribute(indentation, "hanging"));
  if (left) styles.push(`margin-left:${left}pt`);
  if (right) styles.push(`margin-right:${right}pt`);
  if (firstLine) styles.push(`text-indent:${firstLine}pt`);
  if (hanging) styles.push(`text-indent:-${hanging}pt`);
  const spacing = directChild(properties, "spacing");
  const before = twipsToPt(attribute(spacing, "before"));
  const after = twipsToPt(attribute(spacing, "after"));
  const line = Number(attribute(spacing, "line"));
  if (before) styles.push(`margin-top:${before}pt`);
  if (after) styles.push(`margin-bottom:${after}pt`);
  if (Number.isFinite(line) && line > 0) styles.push(`line-height:${Math.round((line / 240) * 1000) / 1000}`);
  return styles;
}

function docxRunStyles(properties: Element | undefined) {
  if (!properties) return [];
  const styles: string[] = [];
  const color = attribute(directChild(properties, "color"), "val");
  if (/^[0-9a-f]{6}$/i.test(color)) styles.push(`color:#${color}`);
  const highlight = attribute(directChild(properties, "highlight"), "val");
  const shading = attribute(directChild(properties, "shd"), "fill");
  const background = wordHighlightColors[highlight] ?? (/^[0-9a-f]{6}$/i.test(shading) ? `#${shading}` : "");
  if (background) styles.push(`background-color:${background}`);
  const halfPoints = Number(attribute(directChild(properties, "sz"), "val"));
  if (Number.isFinite(halfPoints) && halfPoints > 0) styles.push(`font-size:${halfPoints / 2}pt`);
  const fonts = directChild(properties, "rFonts");
  const family = attribute(fonts, "ascii") || attribute(fonts, "hAnsi") || attribute(fonts, "cs");
  if (family) styles.push(`font-family:${safeFontFamily(family)}`);
  return styles;
}

function docxPageFormat(xml: string): PageFormat {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const pageSize = firstByLocalName(documentXml, "pgSz");
  const width = Number(attribute(pageSize, "w"));
  const height = Number(attribute(pageSize, "h"));
  if (!width || !height) return "a4";
  return inferPageFormat(width * 25.4 / 1440, height * 25.4 / 1440);
}

type OdtStyle = { text: string[]; paragraph: string[]; breakBefore: boolean; breakAfter: boolean };

function odtPages(contentXml: string, stylesXml: string) {
  const documentXml = new DOMParser().parseFromString(contentXml, "application/xml");
  const styleDocument = stylesXml ? new DOMParser().parseFromString(stylesXml, "application/xml") : null;
  const styles = collectOdtStyles([documentXml, ...(styleDocument ? [styleDocument] : [])]);
  const officeText = firstByLocalName(documentXml, "text");
  if (!officeText) return [""];
  const pages: string[] = [];
  let current = "";
  for (const element of [...officeText.children]) {
    const rendered = renderOdtBlock(element, styles);
    if (!rendered) continue;
    const parts = rendered.split(PAGE_BREAK);
    current += parts.shift() ?? "";
    for (const part of parts) {
      pages.push(current);
      current = part;
    }
  }
  pages.push(current);
  return ensurePages(pages);
}

function renderOdtBlock(element: Element, styles: Map<string, OdtStyle>): string {
  const style = styles.get(attribute(element, "style-name"));
  const before = style?.breakBefore ? PAGE_BREAK : "";
  const after = style?.breakAfter ? PAGE_BREAK : "";
  if (element.localName === "h") {
    const level = Math.min(3, Math.max(1, Number(attribute(element, "outline-level")) || 1));
    return `${before}<h${level}${styleAttribute(style?.paragraph ?? [])}>${renderOdtInline(element, styles) || "<br>"}</h${level}>${after}`;
  }
  if (element.localName === "p") {
    return `${before}<p${styleAttribute(style?.paragraph ?? [])}>${renderOdtInline(element, styles) || "<br>"}</p>${after}`;
  }
  if (element.localName === "list") {
    const items = directChildren(element, "list-item").map((item) => `<li>${[...item.children].map((child) => renderOdtInline(child, styles)).join("") || "<br>"}</li>`).join("");
    return `${before}<ul>${items}</ul>${after}`;
  }
  if (element.localName === "table") {
    const rows = byLocalName(element, "table-row").map((row) => `<tr>${directChildren(row, "table-cell").map((cell) => `<td>${[...cell.children].map((child) => renderOdtBlock(child, styles)).join("")}</td>`).join("")}</tr>`).join("");
    return `${before}<table><tbody>${rows}</tbody></table>${after}`;
  }
  return "";
}

function renderOdtInline(parent: Element, styles: Map<string, OdtStyle>): string {
  let html = "";
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) { html += escapeHtml(node.textContent ?? ""); continue; }
    if (!(node instanceof Element)) continue;
    if (node.localName === "soft-page-break") { html += PAGE_BREAK; continue; }
    if (node.localName === "line-break") { html += "<br>"; continue; }
    if (node.localName === "tab") { html += "&emsp;"; continue; }
    if (node.localName === "s") { html += "&nbsp;".repeat(Math.max(1, Number(attribute(node, "c")) || 1)); continue; }
    const content = renderOdtInline(node, styles) || escapeHtml(node.textContent ?? "");
    const style = styles.get(attribute(node, "style-name"));
    if (node.localName === "span" && style?.text.length) html += content.split(PAGE_BREAK).map((segment) => segment ? `<span${styleAttribute(style.text)}>${segment}</span>` : "").join(PAGE_BREAK);
    else html += content;
  }
  return html;
}

function collectOdtStyles(documents: XMLDocument[]) {
  const styles = new Map<string, OdtStyle>();
  documents.forEach((documentXml) => byLocalName(documentXml, "style").forEach((styleElement) => {
    const name = attribute(styleElement, "name");
    if (!name) return;
    const textProperties = firstByLocalName(styleElement, "text-properties");
    const paragraphProperties = firstByLocalName(styleElement, "paragraph-properties");
    const text: string[] = [];
    const paragraph: string[] = [];
    if (attribute(textProperties, "font-weight") === "bold") text.push("font-weight:bold");
    if (attribute(textProperties, "font-style") === "italic") text.push("font-style:italic");
    if (attribute(textProperties, "text-underline-style") && attribute(textProperties, "text-underline-style") !== "none") text.push("text-decoration:underline");
    addSafeColor(text, "color", attribute(textProperties, "color"));
    addSafeColor(text, "background-color", attribute(textProperties, "background-color"));
    addSafeLength(text, "font-size", attribute(textProperties, "font-size"));
    const family = attribute(textProperties, "font-name") || attribute(textProperties, "font-family");
    if (family) text.push(`font-family:${safeFontFamily(family)}`);
    const alignment = attribute(paragraphProperties, "text-align");
    if (["left", "right", "center", "justify"].includes(alignment)) paragraph.push(`text-align:${alignment}`);
    addSafeLength(paragraph, "margin-left", attribute(paragraphProperties, "margin-left"));
    addSafeLength(paragraph, "margin-right", attribute(paragraphProperties, "margin-right"));
    addSafeLength(paragraph, "margin-top", attribute(paragraphProperties, "margin-top"));
    addSafeLength(paragraph, "margin-bottom", attribute(paragraphProperties, "margin-bottom"));
    addSafeLength(paragraph, "text-indent", attribute(paragraphProperties, "text-indent"));
    const breakBefore = attribute(paragraphProperties, "break-before") === "page";
    const breakAfter = attribute(paragraphProperties, "break-after") === "page";
    styles.set(name, { text, paragraph, breakBefore, breakAfter });
  }));
  return styles;
}

function odtPageFormat(contentXml: string, stylesXml: string): PageFormat {
  const source = stylesXml || contentXml;
  const parsed = new DOMParser().parseFromString(source, "application/xml");
  const layout = firstByLocalName(parsed, "page-layout-properties");
  const width = cssLengthToMm(attribute(layout, "page-width"));
  const height = cssLengthToMm(attribute(layout, "page-height"));
  return width && height ? inferPageFormat(width, height) : "a4";
}

function inferPageFormat(widthMm: number, heightMm: number): PageFormat {
  const landscape = widthMm > heightMm;
  const width = landscape ? heightMm : widthMm;
  const height = landscape ? widthMm : heightMm;
  const formats: Array<[PageFormat, number, number]> = [
    ["a4", 210, 297], ["a5", 148, 210], ["pocket", 110, 178],
    ["novel", 140, 216], ["large", 170, 240],
  ];
  const closest = formats.map(([format, expectedWidth, expectedHeight]) => ({
    format,
    score: Math.abs(width - expectedWidth) / expectedWidth + Math.abs(height - expectedHeight) / expectedHeight,
  })).sort((left, right) => left.score - right.score)[0];
  return closest && closest.score < 0.18 ? closest.format : "free";
}

function docxPropertyEnabled(properties: Element | undefined, name: string) {
  const property = directChild(properties, name);
  if (!property) return false;
  return !["0", "false", "off", "none"].includes(attribute(property, "val").toLocaleLowerCase("en"));
}

function directChild(element: Element | undefined, localName: string) {
  return element ? [...element.children].find((child) => child.localName === localName) : undefined;
}

function directChildren(element: Element, localName: string) {
  return [...element.children].filter((child) => child.localName === localName);
}

function byLocalName(parent: Document | Element, localName: string) {
  return [...parent.getElementsByTagNameNS("*", localName)];
}

function firstByLocalName(parent: Document | Element, localName: string) {
  return byLocalName(parent, localName)[0];
}

function attribute(element: Element | undefined, localName: string) {
  if (!element) return "";
  return [...element.attributes].find((item) => item.localName === localName)?.value ?? "";
}

function styleAttribute(styles: string[]) {
  return styles.length ? ` style="${styles.join(";")}"` : "";
}

function twipsToPt(value: string) {
  const twips = Number(value);
  return Number.isFinite(twips) && twips ? Math.round((twips / 20) * 100) / 100 : 0;
}

function safeFontFamily(value: string) {
  return `'${value.replaceAll("'", "").replace(/[;{}]/g, "").trim()}'`;
}

function addSafeColor(styles: string[], property: string, value: string) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) styles.push(`${property}:${value}`);
}

function addSafeLength(styles: string[], property: string, value: string) {
  if (/^-?\d+(?:\.\d+)?(?:pt|px|cm|mm|in|pc|%)$/i.test(value)) styles.push(`${property}:${value}`);
}

function cssLengthToMm(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(mm|cm|in|pt|px)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toLocaleLowerCase("en");
  return unit === "mm" ? amount : unit === "cm" ? amount * 10 : unit === "in" ? amount * 25.4 : unit === "pt" ? amount * 25.4 / 72 : amount * 25.4 / 96;
}

function ensurePages(pages: string[]) {
  return pages.length ? pages : [""];
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
