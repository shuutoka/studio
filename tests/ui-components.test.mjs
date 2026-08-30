import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("exports only written pages from the selected manuscript", async () => {
  const { createBlankProject, createEmptyPage } = await vite.ssrLoadModule("/lib/studio.ts");
  const { getManuscriptFilename, getWrittenPageCount } = await vite.ssrLoadModule("/lib/writing-export.ts");
  const project = createBlankProject("Projet Démon", "novel");
  const volume = project.volumes[0];
  volume.title = "Volume Été";
  volume.chapters[0].pages[0].content = "<p><strong>Une page écrite.</strong></p>";
  volume.chapters[0].pages.push(createEmptyPage(2));
  volume.chapters[0].pages.push({ ...createEmptyPage(3), content: "<p><br></p>" });

  assert.equal(getWrittenPageCount(project, volume.id), 1);
  assert.equal(getManuscriptFilename(project, volume.id), "Projet-Demon-Volume-Ete");
});

test("the writing toolbar uses the bounded color picker", async () => {
  const { RichTextEditor } = await vite.ssrLoadModule("/components/studio/rich-text-editor.tsx");
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, {
    documentId: "page-test",
    html: "",
    format: "a4",
    customFonts: [],
    onChange() {},
  }));

  assert.match(html, /aria-label="Couleur du texte"/);
  assert.match(html, /aria-label="Caractères spéciaux"/);
  assert.doesNotMatch(html, /type="color"/);
});
