import { strToU8, zipSync } from "fflate";

import { safeFilename } from "@/lib/project-file";
import { stripHtml, type StudioProject } from "@/lib/studio";

export type WritingExportFormat = "doc" | "docx" | "odt" | "pdf" | "html" | "txt";

export function exportProjectWriting(project: StudioProject, format: WritingExportFormat) {
  const filename = safeFilename(project.name);
  if (format === "txt") {
    download(new Blob([buildPlainText(project)], { type: "text/plain;charset=utf-8" }), `${filename}.txt`);
    return;
  }
  if (format === "html" || format === "doc") {
    const html = buildHtml(project);
    const mime = format === "doc" ? "application/msword" : "text/html;charset=utf-8";
    download(new Blob([html], { type: mime }), `${filename}.${format}`);
    return;
  }
  if (format === "docx") {
    download(buildDocx(project), `${filename}.docx`);
    return;
  }
  if (format === "odt") {
    download(buildOdt(project), `${filename}.odt`);
    return;
  }
  download(buildPdf(project), `${filename}.pdf`);
}

function projectSections(project: StudioProject) {
  return project.volumes.flatMap((volume) => [
    { level: 1, title: volume.title, text: "" },
    ...volume.chapters.flatMap((chapter) => [
      { level: 2, title: chapter.title, text: "" },
      ...chapter.pages.map((page) => ({ level: 3, title: page.title, text: stripHtml(page.content) })),
    ]),
  ]);
}

function buildPlainText(project: StudioProject) {
  return [
    project.name,
    "=".repeat(project.name.length),
    "",
    ...projectSections(project).flatMap((section) => [
      `${"#".repeat(section.level)} ${section.title}`,
      section.text,
      "",
    ]),
  ].join("\n");
}

function buildHtml(project: StudioProject) {
  const body = project.volumes.map((volume) => `
    <h1>${escapeXml(volume.title)}</h1>
    ${volume.chapters.map((chapter) => `
      <h2>${escapeXml(chapter.title)}</h2>
      ${chapter.pages.map((page) => `
        <section><h3>${escapeXml(page.title)}</h3>${page.content}</section>
      `).join("")}
    `).join("")}
  `).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeXml(project.name)}</title><style>body{max-width:760px;margin:48px auto;font:12pt/1.6 Georgia,serif;color:#222}h1{page-break-before:always}h1:first-child{page-break-before:auto}section{page-break-after:always}</style></head><body><header><h1>${escapeXml(project.name)}</h1></header>${body}</body></html>`;
}

function buildDocx(project: StudioProject) {
  const paragraphs = [
    docxParagraph(project.name, "Title"),
    ...projectSections(project).flatMap((section) => [
      docxParagraph(section.title, `Heading${section.level}`),
      ...section.text.split(/\n+/).filter(Boolean).map((line) => docxParagraph(line)),
    ]),
  ].join("");
  const archive = zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }, { level: 6 });
  return blobFromBytes(archive, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

function docxParagraph(text: string, style?: string) {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildOdt(project: StudioProject) {
  const paragraphs = projectSections(project).map((section) =>
    `<text:h text:outline-level="${section.level}">${escapeXml(section.title)}</text:h>${section.text.split(/\n+/).filter(Boolean).map((line) => `<text:p>${escapeXml(line)}</text:p>`).join("")}`,
  ).join("");
  const archive = zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "META-INF/manifest.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`),
    "content.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:body><office:text><text:h text:outline-level="1">${escapeXml(project.name)}</text:h>${paragraphs}</office:text></office:body></office:document-content>`),
  }, { level: 0 });
  return blobFromBytes(archive, "application/vnd.oasis.opendocument.text");
}

function buildPdf(project: StudioProject) {
  const lines = wrapLines(buildPlainText(project), 92);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 50) pages.push(lines.slice(index, index + 50));
  if (!pages.length) pages.push([project.name]);
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageRefs = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((pageLines, index) => {
    const pageObject = 4 + index * 2;
    const streamObject = pageObject + 1;
    const stream = `BT /F1 11 Tf 50 792 Td 14 TL ${pageLines.map((line) => `(${escapePdf(line)}) Tj T*`).join(" ")} ET`;
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamObject} 0 R >>`;
    objects[streamObject] = `<< /Length ${latin1Bytes(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = latin1Bytes(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = latin1Bytes(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([latin1Bytes(pdf)], { type: "application/pdf" });
}

function wrapLines(text: string, width: number) {
  return text.split("\n").flatMap((paragraph) => {
    if (!paragraph) return [""];
    const words = paragraph.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    words.forEach((word) => {
      if (`${current} ${word}`.trim().length > width && current) {
        lines.push(current);
        current = word;
      } else current = `${current} ${word}`.trim();
    });
    if (current) lines.push(current);
    return lines;
  });
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapePdf(value: string) {
  return value.replace(/[^\x20-\xff]/g, "?").replace(/([\\()])/g, "\\$1");
}

function latin1Bytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
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
