import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
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
  delete legacyProject.volumes[0].footerType;
  delete legacyProject.volumes[0].footerText;
  legacyProject.volumes[0].chapters[0].pages[0].footerType = "custom";
  legacyProject.volumes[0].chapters[0].pages[0].footerText = "Brouillon confidentiel";

  const normalizedProject = normalizeProject(legacyProject);
  assert.equal(normalizedProject.footerType, "custom");
  assert.equal(normalizedProject.footerText, "Brouillon confidentiel");
  assert.equal(normalizedProject.volumes[0].footerType, "custom");
  assert.equal(normalizedProject.volumes[0].footerText, "Brouillon confidentiel");
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

test("counts native DOCX text and ignores stale Word pagination markers", async () => {
  const { JSDOM } = await import("jsdom");
  const { strToU8, zipSync } = await import("fflate");
  const { readWritingDocument } = await vite.ssrLoadModule("/lib/writing-import.ts");
  const { extractDocxText } = await vite.ssrLoadModule("/lib/writing-docx.ts");
  const dom = new JSDOM();
  const previousDOMParser = globalThis.DOMParser;
  const previousElement = globalThis.Element;
  const previousNode = globalThis.Node;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;

  try {
    const staleBreaks = "<w:lastRenderedPageBreak/>".repeat(26);
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Une seule page remplie</w:t>${staleBreaks}<w:tab/><w:t>avec du texte</w:t></w:r></w:p></w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(documentXml) });
    const file = new File([bytes], "page-test.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const imported = await readWritingDocument(file);
    const text = await extractDocxText(file);

    assert.equal(imported.pages.length, 1);
    assert.equal(text, "Une seule page remplie\tavec du texte");
  } finally {
    if (previousDOMParser) globalThis.DOMParser = previousDOMParser;
    else delete globalThis.DOMParser;
    if (previousElement) globalThis.Element = previousElement;
    else delete globalThis.Element;
    if (previousNode) globalThis.Node = previousNode;
    else delete globalThis.Node;
    dom.window.close();
  }
});

test("keeps the revised writing flow controls wired", async () => {
  const editorSource = await readFile(path.join(root, "components/studio/rich-text-editor.tsx"), "utf8");
  const settingsSource = await readFile(path.join(root, "components/studio/settings-view.tsx"), "utf8");
  const workspaceSource = await readFile(path.join(root, "components/studio/writing-workspace.tsx"), "utf8");

  assert.match(editorSource, /Titre H1/);
  assert.doesNotMatch(editorSource, /Chapitre — H2 centré/);
  assert.match(editorSource, /onPullBackward/);
  assert.doesNotMatch(editorSource, /addEventListener\("wheel"/);
  assert.doesNotMatch(editorSource, /event\.preventDefault\(\).*scrollTop/s);
  assert.match(settingsSource, /Activer les polices de ce PC/);
  assert.match(settingsSource, /queryLocalFonts/);
  assert.match(workspaceSource, /--studio-viewport-height/);
  assert.match(workspaceSource, /maxHeight: normalWorkspaceHeight/);
  assert.match(workspaceSource, /overflow-hidden/);
});

test("creates and migrates persistent story boards", async () => {
  const { createBlankProject, createEmptyBoard, createId, normalizeProject } = await vite.ssrLoadModule("/lib/studio.ts");
  const project = createBlankProject("Chronologie", "novel");
  const board = createEmptyBoard("Ligne temporelle", "tree", 0);
  const first = { id: createId("node"), kind: "text", x: 40, y: 80, width: 240, height: 170, title: "Début", text: "Incident", color: "#26222d", imageId: null, characterId: null, characterIds: [] };
  const second = { ...first, id: createId("node"), x: 420, title: "Suite" };
  board.nodes.push(first, second);
  board.edges.push({ id: createId("edge"), sourceId: first.id, targetId: second.id, sourceAnchor: "right", targetAnchor: "left", label: "Puis", color: "#ef6977" });
  project.boards.push(board);
  project.boardFolders.push({ id: "folder-timeline", name: "Temporalité", order: 0 });
  project.boards[0].folderId = "folder-timeline";

  const normalized = normalizeProject(project);
  assert.equal(normalized.schemaVersion, 8);
  assert.equal(normalized.boards[0].name, "Ligne temporelle");
  assert.equal(normalized.boards[0].nodes.length, 2);
  assert.equal(normalized.boards[0].edges[0].label, "Puis");
  assert.equal(normalized.boards[0].edges[0].sourceAnchor, "right");
  assert.equal(normalized.boardFolders[0].name, "Temporalité");
});

test("exposes tree and relationship board controls", async () => {
  const source = await readFile(path.join(root, "components/studio/boards-workspace.tsx"), "utf8");
  assert.match(source, /Nouvel arbre/);
  assert.match(source, /Nouveau diagramme/);
  assert.match(source, /Boîte personnage/);
  assert.match(source, /Historique des actions/);
  assert.match(source, /Fork :/);
  assert.match(source, /treeAnchors/);
  assert.match(source, /relationshipEndpoints/);
  assert.match(source, /Connexion en cours/);
  assert.match(source, /Gérer les tableaux/);
  assert.match(source, /Créer un arbre/);
  assert.match(source, /Créer un diagramme/);
  assert.match(source, /Accueil des tableaux/);
  assert.match(source, /if \(!board\) return[\s\S]*?<CreateBoardDialog/);
});

test("wires manuscript import, Drive backups, WebP media and project card customization", async () => {
  const writingImport = await readFile(path.join(root, "lib/writing-import.ts"), "utf8");
  const drive = await readFile(path.join(root, "lib/google-drive.ts"), "utf8");
  const optimizer = await readFile(path.join(root, "lib/image-optimization.ts"), "utf8");
  const gallery = await readFile(path.join(root, "components/studio/media-gallery.tsx"), "utf8");
  const characters = await readFile(path.join(root, "components/studio/character-manager.tsx"), "utf8");
  const home = await readFile(path.join(root, "components/studio/studio-app.tsx"), "utf8");

  assert.match(writingImport, /docxPages/);
  assert.match(writingImport, /odtPages/);
  assert.match(drive, /drive\.file/);
  assert.match(drive, /uploadType=multipart/);
  assert.match(optimizer, /image\/webp/);
  assert.match(gallery, /Images uniquement/);
  assert.match(gallery, /centré et recadré/);
  assert.match(characters, /thumbnailImageId/);
  assert.match(characters, /moveCharacterImage/);
  assert.match(home, /Personnaliser la carte projet/);
});

test("ships the Pansement writing, Drive, feedback and image-link fixes", async () => {
  const { createDefaultSettings, normalizeSettings, PAGE_FORMATS } = await vite.ssrLoadModule("/lib/studio.ts");
  const writingImport = await readFile(path.join(root, "lib/writing-import.ts"), "utf8");
  const importButton = await readFile(path.join(root, "components/studio/writing-import-button.tsx"), "utf8");
  const editor = await readFile(path.join(root, "components/studio/rich-text-editor.tsx"), "utf8");
  const drive = await readFile(path.join(root, "lib/google-drive.ts"), "utf8");
  const app = await readFile(path.join(root, "components/studio/studio-app-v3.tsx"), "utf8");
  const settingsView = await readFile(path.join(root, "components/studio/settings-view.tsx"), "utf8");
  const feedback = await readFile(path.join(root, "lib/feedback.ts"), "utf8");
  const mediaPreview = await readFile(path.join(root, "components/studio/media-preview.tsx"), "utf8");

  assert.deepEqual([PAGE_FORMATS.a4.width, PAGE_FORMATS.a4.height], [794, 1123]);
  const settings = createDefaultSettings();
  settings.googleDriveApiKey = "picker-key";
  settings.googleDriveAppId = "123456";
  assert.equal(normalizeSettings(settings).googleDriveApiKey, "picker-key");
  assert.equal(normalizeSettings(settings).googleDriveAppId, "123456");
  assert.match(writingImport, /background-color/);
  assert.match(writingImport, /removeImportedFormatting/);
  assert.match(importButton, /Supprimer la mise en forme/);
  assert.match(importButton, /Format des pages/);
  assert.match(editor, /selectWholeDocument/);
  assert.match(drive, /PickerBuilder/);
  assert.match(drive, /setDeveloperKey/);
  assert.match(app, /Charger depuis Google Drive/);
  assert.match(settingsView, /Feedback/);
  assert.match(feedback, /formsubmit\.co\/ajax\/studio@report\.lotaku\.fr/);
  assert.match(mediaPreview, /Ajouter à une galerie/);
  assert.match(mediaPreview, /Déjà ajoutée à/);
});

test("renders the legal notice and requires feedback privacy consent", async () => {
  const { LegalInformation } = await vite.ssrLoadModule("/components/studio/legal-information.tsx");
  const html = renderToStaticMarkup(React.createElement(LegalInformation, { compact: true }));
  const app = await readFile(path.join(root, "components/studio/studio-app-v3.tsx"), "utf8");
  const settingsView = await readFile(path.join(root, "components/studio/settings-view.tsx"), "utf8");
  const serviceWorker = await readFile(path.join(root, "public/sw.js"), "utf8");

  assert.match(html, /Mentions légales/);
  assert.match(html, /Confidentialité et données personnelles/);
  assert.match(html, /Conditions d’utilisation/);
  assert.match(html, /GitHub, Inc\./);
  assert.match(html, /OVH SAS/);
  assert.match(html, /FormSubmit/);
  assert.match(html, /Google Drive/);
  assert.match(app, /Informations légales et confidentialité/);
  assert.match(app, /globalView === "legal"/);
  assert.match(settingsView, /privacyAccepted/);
  assert.match(settingsView, /J’accepte que les informations saisies/);
  assert.match(serviceWorker, /enfer-fatal-studio-writing-2/);
});

test("ships the native SuperDoc writing workspace and embeds documents in EFS backups", async () => {
  const workspace = await readFile(path.join(root, "components/studio/writing-workspace.tsx"), "utf8");
  const superdocEditor = await readFile(path.join(root, "components/studio/superdoc-writing-editor.tsx"), "utf8");
  const projectFile = await readFile(path.join(root, "lib/project-file.ts"), "utf8");
  const writingDocument = await readFile(path.join(root, "lib/writing-document.ts"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.dependencies["@superdoc/react"], "^2.8.0");
  assert.match(workspace, /SuperDocWritingEditor/);
  assert.doesNotMatch(workspace, /<RichTextEditor/);
  assert.match(superdocEditor, /excludeItems/);
  assert.match(superdocEditor, /"ai"/);
  assert.match(superdocEditor, /persistWritingDocument/);
  assert.match(writingDocument, /writing-docx/);
  assert.match(projectFile, /formatVersion:\s*8/);
});

test("keeps SuperDoc inside the Studio viewport without continuous fit-width feedback", async () => {
  const workspace = await readFile(path.join(root, "components/studio/writing-workspace.tsx"), "utf8");
  const editor = await readFile(path.join(root, "components/studio/superdoc-writing-editor.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(workspace, /min-w-0 max-w-full flex-1 overflow-hidden/);
  assert.match(editor, /w-0 min-w-0 max-w-full/);
  assert.match(editor, /zoom=\{\{ initial: 90, mode: "manual" \}\}/);
  assert.doesNotMatch(editor, /setMode\("fit-width"\)/);
  assert.doesNotMatch(editor, /responsiveTo:\s*"container"/);
  assert.match(editor, /comments:\s*false/);
  assert.match(editor, /ruler:\s*false/);
  assert.doesNotMatch(editor, /right:\s*\["ruler"/);
  assert.match(editor, /"formatting-marks"/);
  assert.match(editor, /Afficher les marques de mise en forme/);
  assert.match(css, /\.superdoc-writing-shell[\s\S]*contain: inline-size/);
  assert.match(css, /--sd-ui-toolbar-bg: #17151d/);
  assert.match(css, /\[data-v2-paint-wrapper="true"\][\s\S]*margin-inline: auto !important/);
  assert.match(css, /\.writing-workspace\.fixed[\s\S]*\.superdoc-layout\[data-v2-paint-wrapper="true"\][\s\S]*width: 100% !important/);
  assert.match(css, /\.writing-workspace\.fixed[\s\S]*\.superdoc__layers[\s\S]*\.v2-super-editor__stage[\s\S]*min-width: 0 !important/);
  assert.match(css, /\.sd-v2-local-selection-caret[\s\S]*background: #ef4f5f !important/);
  assert.match(css, /\.toolbar-dropdown-option:not\(\.sd-render\):hover[\s\S]*background: #44252d !important/);
  assert.match(css, /\.toolbar-dropdown-menu--render-only[\s\S]*\.toolbar-dropdown-option\.sd-render[\s\S]*background: transparent !important/);
  assert.match(css, /\.toolbar-dropdown-menu--render-only \.style-name[\s\S]*height: 44px[\s\S]*font-size: 15px !important/);
  assert.match(editor, /left: \["undo", "redo", "search"\]/);
  assert.match(editor, /center: \[\s*"linked-style", "zoom"/);
});

test("reconnects Writing 2.1 to Studio preferences and native DOCX metadata", async () => {
  const { createBlankProject, createDefaultSettings, normalizeProject, normalizeSettings } = await vite.ssrLoadModule("/lib/studio.ts");
  const workspace = await readFile(path.join(root, "components/studio/writing-workspace.tsx"), "utf8");
  const editor = await readFile(path.join(root, "components/studio/superdoc-writing-editor.tsx"), "utf8");
  const controls = await readFile(path.join(root, "components/studio/writing-document-controls.tsx"), "utf8");
  const exportDialog = await readFile(path.join(root, "components/studio/writing-export-button.tsx"), "utf8");
  const docx = await readFile(path.join(root, "lib/writing-docx.ts"), "utf8");
  const legacyExport = await readFile(path.join(root, "lib/writing-export.ts"), "utf8");
  const nativeExport = await readFile(path.join(root, "lib/writing-native-export.ts"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  const settings = normalizeSettings({ ...createDefaultSettings(), schemaVersion: 1 });
  const project = normalizeProject({ ...createBlankProject("Migration 2.1", "novel"), schemaVersion: 7 });
  assert.equal(settings.schemaVersion, 7);
  assert.equal(settings.writingTheme, "follow");
  assert.equal(project.schemaVersion, 8);
  assert.equal(project.volumes[0].status, "draft");
  assert.equal(project.volumes[0].footerFormat, "page-of-total");
  assert.deepEqual(project.volumes[0].documentOutline, []);

  assert.match(editor, /fontOptions/);
  assert.match(editor, /settings\.quoteStyle/);
  assert.match(editor, /settings\.characterShortcuts/);
  assert.match(editor, /interceptPageBreak/);
  assert.match(editor, /pageBreakShortcutRef/);
  assert.match(editor, /replayNativePageBreakShortcut/);
  assert.match(editor, /matchesConfiguredShortcut && matchesNativeShortcut/);
  assert.doesNotMatch(editor, /efs\.insert-page-break/);
  assert.doesNotMatch(editor, /pageBreakCommand/);
  assert.match(editor, /pendingBodyStyleResetRef/);
  assert.match(editor, /currentBlockId === pending\.sourceBlockId/);
  assert.match(editor, /executeAsync\("linked-style", "Normal"\)/);
  assert.match(editor, /restoreFocusAfterStyle/);
  assert.match(editor, /lastSelectionTargetRef/);
  assert.match(editor, /advanceSelectionTarget/);
  assert.match(editor, /extractDocxText\(blob\)/);
  assert.match(editor, /getPageMetricsSnapshot/);
  assert.match(editor, /subscribePageMetrics/);
  assert.match(editor, /getRenderedSuperDocPages/);
  assert.match(editor, /document\.createElement\("iframe"\)/);
  assert.match(editor, /buildPrintDocument\(documentTitle, pages\)/);
  assert.match(editor, /frameWindow\.print\(\)/);
  assert.doesNotMatch(editor, /efs-printing-writing-document/);
  assert.match(nativeExport, /active\?\.print\(filename\)/);
  assert.match(exportDialog, /getManuscriptFilename\(project, selectedVolumeId\)/);
  assert.doesNotMatch(css, /efs-printing-writing-document/);
  assert.match(editor, /stopImmediatePropagation/);
  assert.match(editor, /settings\.quoteStyle === "french"/);
  assert.match(controls, /Tiret cadratin/);
  assert.match(controls, /Caractères spéciaux/);
  assert.match(controls, /Pied de page du volume/);
  assert.match(controls, /PAGE_FOOTER_FORMATS/);
  assert.match(controls, /DATE_FOOTER_FORMATS/);
  assert.match(controls, /Aperçu :/);
  assert.match(controls, /Feuille claire/);
  assert.doesNotMatch(controls, /Thème du Studio/);
  assert.doesNotMatch(workspace, /onThemeChange/);
  assert.match(workspace, /volume\.documentOutline = snapshot\.outline/);
  assert.match(workspace, /ensureStudioDocxStyles/);
  assert.match(docx, /extractDocxOutline/);
  assert.match(docx, /applyDocxFooter/);
  assert.match(docx, /fldCharType=\"separate\"/);
  assert.match(docx, /w:dirty=\"true\"/);
  assert.match(docx, /ensureQuickFormatStyle/);
  assert.match(docx, /removeRetiredQuickFormatStyle/);
  assert.doesNotMatch(docx, /w:styleId="Chapter"/);
  assert.doesNotMatch(legacyExport, /w:styleId="Chapter"/);
  assert.match(css, /data-paper-color-mode="dark"[\s\S]*\.superdoc-page \*[\s\S]*-webkit-text-fill-color/);
  assert.match(css, /Dropdowns are teleported under <body>/);
  assert.doesNotMatch(editor, /ruler:\s*true/);
});

test("formats page numbers and dates for the native footer", async () => {
  const { footerFormatForType, formatFooterText } = await vite.ssrLoadModule("/lib/writing-footer.ts");
  const date = new Date(2026, 8, 11);

  assert.equal(footerFormatForType("date", "page-of-total"), "date-long");
  assert.equal(footerFormatForType("page", "date-short"), "page-of-total");
  assert.equal(formatFooterText("page", "page-of-total", "", 3, 12), "Page 3 / 12");
  assert.equal(formatFooterText("page", "number-only", "", 3, 12), "3");
  assert.equal(formatFooterText("date", "date-short", "", 1, 1, date), "11/09/2026");
  assert.equal(formatFooterText("date", "date-iso", "", 1, 1, date), "2026-09-11");
});
