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

test("exports every page from the selected manuscript, including blank pages", async () => {
  const { createBlankProject, createEmptyPage } = await vite.ssrLoadModule("/lib/studio.ts");
  const { getManuscriptFilename, getManuscriptPageCount } = await vite.ssrLoadModule("/lib/writing-export.ts");
  const project = createBlankProject("Projet Démon", "novel");
  const volume = project.volumes[0];
  volume.title = "Volume Été";
  volume.chapters[0].pages[0].content = "<p><strong>Une page écrite.</strong></p>";
  volume.chapters[0].pages.push(createEmptyPage(2));
  volume.chapters[0].pages.push({ ...createEmptyPage(3), content: "<p><br></p>" });

  assert.equal(getManuscriptPageCount(project, volume.id), 3);
  assert.equal(getManuscriptFilename(project, volume.id), "Projet-Demon-Volume-Ete");
});

test("migrates the former cream paper and page footer settings", async () => {
  const {
    createBlankProject, createDefaultSettings, normalizeProject, normalizeSettings,
  } = await vite.ssrLoadModule("/lib/studio.ts");
  const legacySettings = createDefaultSettings();
  legacySettings.schemaVersion = 1;
  legacySettings.zoom = 125;
  legacySettings.paperBackground = "#F7F4ED";
  legacySettings.systemFonts = [{ id: "system-test", name: "Police locale", family: "Police locale", enabled: true }];

  const normalizedSettings = normalizeSettings(legacySettings);
  assert.equal(normalizedSettings.zoom, 125);
  assert.equal(normalizedSettings.paperBackground, "#ffffff");
  assert.equal(normalizedSettings.paperColorMode, "light");
  assert.equal(normalizedSettings.writingCounters.words, true);
  assert.equal(normalizedSettings.writingCounters.symbols, true);
  assert.equal(normalizedSettings.writingCounters.pages, false);
  assert.equal(normalizedSettings.systemFonts[0].family, "Police locale");
  assert.ok(normalizedSettings.enabledStandardFonts.length > 15);

  const legacyProject = createBlankProject("Ancien projet", "novel");
  legacyProject.schemaVersion = 3;
  delete legacyProject.footerType;
  delete legacyProject.footerText;
  legacyProject.volumes[0].chapters[0].pages[0].footerType = "custom";
  legacyProject.volumes[0].chapters[0].pages[0].footerText = "Brouillon confidentiel";

  const normalizedProject = normalizeProject(legacyProject);
  assert.equal(normalizedProject.footerType, "custom");
  assert.equal(normalizedProject.footerText, "Brouillon confidentiel");
  assert.equal(normalizedProject.volumes[0].chapters[0].pages[0].ignoreProjectFooter, false);
});

test("the writing toolbar exposes the complete document controls", async () => {
  const { RichTextEditor } = await vite.ssrLoadModule("/components/studio/rich-text-editor.tsx");
  const html = renderToStaticMarkup(React.createElement(RichTextEditor, {
    pages: [{ id: "page-test", html: "", status: "draft", typeOverride: null, format: "a4", formatOverride: null, backgroundColor: "#ffffff", colorMode: "light", ignoreFooter: false, pageNumber: 1, position: 1 }],
    selectedPageId: "page-test",
    defaultFormat: "a4",
    defaultProjectType: "novel",
    customFonts: [],
    footerType: "page",
    footerText: "",
    onSelectPage() {},
    onChange() {},
    onPageBreak() {},
    onOverflow() {},
    onPullBackward() {},
    onFormatChange() {},
    onTypeChange() {},
    onStatusChange() {},
    onBackgroundChange() {},
    onColorModeChange() {},
    onFooterChange() {},
    onToggleIgnoreFooter() {},
    onDeletePage() {},
  }));

  assert.match(html, /aria-label="Couleur du texte"/);
  assert.match(html, /aria-label="Caractères spéciaux"/);
  assert.match(html, /aria-label="Ajouter une image"/);
  assert.match(html, /aria-label="Justifier"/);
  assert.match(html, /aria-label="Pied de page"/);
  assert.match(html, /aria-label="Taille personnalisée en points"/);
  assert.doesNotMatch(html, /type="color"/);
});

test("counts a complete writing volume", async () => {
  const { createBlankProject, createEmptyPage, getWritingDocumentStats } = await vite.ssrLoadModule("/lib/studio.ts");
  const project = createBlankProject("Compteurs", "novel");
  const volume = project.volumes[0];
  volume.chapters[0].pages[0].content = "<h1>Premier titre</h1><p>Deux mots</p>";
  volume.chapters[0].pages.push({ ...createEmptyPage(2), content: "<p>Troisième ligne.</p>" });
  const stats = getWritingDocumentStats(volume);

  assert.equal(stats.pages, 2);
  assert.equal(stats.paragraphs, 3);
  assert.equal(stats.words, 6);
  assert.ok(stats.symbols > stats.characters);
});

test("keeps the revised writing flow controls wired", async () => {
  const editorSource = await readFile(path.join(root, "components/studio/rich-text-editor.tsx"), "utf8");
  const settingsSource = await readFile(path.join(root, "components/studio/settings-view.tsx"), "utf8");

  assert.match(editorSource, /Titre H1/);
  assert.match(editorSource, /Chapitre — H2 centré/);
  assert.match(editorSource, /onPullBackward/);
  assert.match(editorSource, /passive: false/);
  assert.match(settingsSource, /Activer les polices de ce PC/);
  assert.match(settingsSource, /queryLocalFonts/);
});
