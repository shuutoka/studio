import { strFromU8, unzipSync } from "fflate";

export type ImportedWritingDocument = {
  title: string;
  pages: string[];
  sourceFormat: "txt" | "html" | "docx" | "odt";
};

export async function readWritingDocument(file: File): Promise<ImportedWritingDocument> {
  const title = file.name.replace(/\.[^.]+$/, "").trim() || "Texte importé";
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("fr");
  if (extension === "txt") return { title, pages: textPages(await file.text()), sourceFormat: "txt" };
  if (extension === "html" || extension === "htm") return { title, pages: htmlPages(await file.text()), sourceFormat: "html" };
  if (extension !== "docx" && extension !== "odt") throw new Error("Format non pris en charge. Utilisez .docx, .odt, .txt, .html ou .htm.");

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Le document est endommagé ou illisible.");
  }
  if (extension === "docx") {
    const xml = archive["word/document.xml"];
    if (!xml) throw new Error("Le contenu du document Word est manquant.");
    return { title, pages: docxPages(strFromU8(xml)), sourceFormat: "docx" };
  }
  const xml = archive["content.xml"];
  if (!xml) throw new Error("Le contenu du document ODT est manquant.");
  return { title, pages: odtPages(strFromU8(xml)), sourceFormat: "odt" };
}

function textPages(text: string) {
  return ensurePages(text.split("\f").map((page) => page.split(/\r?\n/).map((line) => line ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>").join("")));
}

function htmlPages(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const body = parsed.body.innerHTML;
  const parts = body.split(/<(?:div|p)[^>]*style=["'][^"']*page-break-(?:before|after)\s*:\s*always[^"']*["'][^>]*>|<hr[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>/gi);
  return ensurePages(parts);
}

function docxPages(xml: string) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const body = [...documentXml.getElementsByTagNameNS("*", "body")][0];
  if (!body) return [""];
  const pages: string[] = [];
  let current = "";
  for (const element of [...body.children]) {
    if (element.localName === "tbl") {
      const rows = [...element.getElementsByTagNameNS("*", "tr")].map((row) => `<tr>${[...row.getElementsByTagNameNS("*", "tc")].map((cell) => `<td>${escapeHtml(cell.textContent ?? "")}</td>`).join("")}</tr>`).join("");
      current += `<table><tbody>${rows}</tbody></table>`;
      continue;
    }
    if (element.localName !== "p") continue;
    const style = [...element.getElementsByTagNameNS("*", "pStyle")][0];
    const styleName = attribute(style, "val").toLocaleLowerCase("fr");
    const heading = /heading\s*1|titre\s*1/.test(styleName) ? "h1" : /heading\s*2|titre\s*2/.test(styleName) ? "h2" : /heading\s*3|titre\s*3/.test(styleName) ? "h3" : "p";
    let paragraph = "";
    for (const run of [...element.getElementsByTagNameNS("*", "r")]) {
      const hasPageBreak = [...run.getElementsByTagNameNS("*", "br")].some((br) => attribute(br, "type") === "page") || run.getElementsByTagNameNS("*", "lastRenderedPageBreak").length > 0;
      if (hasPageBreak) {
        if (paragraph) current += `<${heading}>${paragraph}</${heading}>`;
        pages.push(current);
        current = "";
        paragraph = "";
      }
      let text = [...run.getElementsByTagNameNS("*", "t")].map((node) => escapeHtml(node.textContent ?? "")).join("");
      if (!text) continue;
      const properties = [...run.getElementsByTagNameNS("*", "rPr")][0];
      if (properties?.getElementsByTagNameNS("*", "b").length) text = `<strong>${text}</strong>`;
      if (properties?.getElementsByTagNameNS("*", "i").length) text = `<em>${text}</em>`;
      if (properties?.getElementsByTagNameNS("*", "u").length) text = `<u>${text}</u>`;
      paragraph += text;
    }
    current += `<${heading}>${paragraph || "<br>"}</${heading}>`;
  }
  pages.push(current);
  return ensurePages(pages);
}

function odtPages(xml: string) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  const officeText = [...documentXml.getElementsByTagNameNS("*", "text")][0];
  if (!officeText) return [""];
  const html = [...officeText.children].flatMap((element) => {
    if (element.localName === "h") {
      const level = Math.min(3, Math.max(1, Number(attribute(element, "outline-level")) || 1));
      return [`<h${level}>${escapeHtml(element.textContent ?? "")}</h${level}>`];
    }
    if (element.localName === "p") return [`<p>${escapeHtml(element.textContent ?? "") || "<br>"}</p>`];
    return [];
  }).join("");
  return [html];
}

function attribute(element: Element | undefined, localName: string) {
  if (!element) return "";
  return [...element.attributes].find((item) => item.localName === localName)?.value ?? "";
}

function ensurePages(pages: string[]) {
  return pages.length ? pages : [""];
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
