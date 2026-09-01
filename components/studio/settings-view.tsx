"use client";

import { useRef, useState } from "react";
import {
  Accessibility,
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  FileArchive,
  Globe2,
  Keyboard,
  Laptop,
  Palette,
  Plus,
  Search,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/studio/color-picker";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { playInterfaceSound } from "@/lib/interface-sound";
import {
  createDefaultSettings, createId, STANDARD_FONTS, type StudioSettings,
  type WritingColorMode,
} from "@/lib/studio";
import { isModifierKey, shortcutFromEvent } from "@/lib/shortcuts";

type SettingsSection = "backup" | "fonts" | "appearance" | "writing";

export function SettingsView({
  settings,
  updateSettings,
  onUploadFont,
  onRemoveFont,
  onSaveDrive,
  onLoadDrive,
  driveBusy = false,
}: {
  settings: StudioSettings;
  updateSettings: (mutate: (draft: StudioSettings) => void) => void;
  onUploadFont: (file: File) => Promise<void>;
  onRemoveFont: (fontId: string) => Promise<void>;
  onSaveDrive?: () => Promise<void>;
  onLoadDrive?: () => Promise<void>;
  driveBusy?: boolean;
}) {
  const [section, setSection] = useState<SettingsSection>("backup");
  const [allColor, setAllColor] = useState(settings.paperBackground);
  const [zoomDraft, setZoomDraft] = useState<number | null>(null);
  const [fontSearch, setFontSearch] = useState("");
  const [scanningFonts, setScanningFonts] = useState(false);
  const zoomDraftRef = useRef(settings.zoom);
  const sections = [
    { id: "backup" as const, label: "Sauvegarde", icon: FileArchive },
    { id: "fonts" as const, label: "Polices d’écriture", icon: Type },
    { id: "appearance" as const, label: "Apparence et accessibilité", icon: Accessibility },
    { id: "writing" as const, label: "Écriture et raccourcis", icon: Keyboard },
  ];
  const fontQuery = fontSearch.trim().toLocaleLowerCase("fr");
  const matchesFont = (name: string, family: string) => !fontQuery || `${name} ${family}`.toLocaleLowerCase("fr").includes(fontQuery);

  async function enableLocalFonts() {
    const queryLocalFonts = (window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family: string; fullName?: string }>>;
    }).queryLocalFonts;
    if (!queryLocalFonts) {
      toast.error("Ce navigateur ne permet pas de consulter les polices du PC. Utilisez une version récente de Chrome ou Edge.");
      return;
    }
    setScanningFonts(true);
    try {
      const localFonts = await queryLocalFonts.call(window);
      const families = [...new Set(localFonts.map((font) => font.family.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "fr"));
      updateSettings((draft) => {
        const previous = new Map(draft.systemFonts.map((font) => [font.family.toLocaleLowerCase("fr"), font]));
        draft.systemFonts = families.map((family) => {
          const existing = previous.get(family.toLocaleLowerCase("fr"));
          return existing ?? { id: systemFontId(family), name: family, family, enabled: true };
        });
      });
      toast.success(`${families.length} police${families.length > 1 ? "s" : ""} du PC disponible${families.length > 1 ? "s" : ""} dans l’éditeur.`);
    } catch (error) {
      toast.error(error instanceof DOMException && error.name === "NotAllowedError"
        ? "L’autorisation d’accéder aux polices du PC a été refusée."
        : "Les polices du PC n’ont pas pu être analysées.");
    } finally {
      setScanningFonts(false);
    }
  }

  return (
    <div className="studio-page flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#ef6977]">Préférences</div>
          <h1 className="text-3xl font-bold tracking-[-.035em] text-white">Paramètres du Studio</h1>
          <p className="mt-2 text-sm text-[#8f8996]">Ces réglages sont inclus dans la sauvegarde globale.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="grid content-start gap-1 rounded-2xl border border-white/8 bg-[#131218] p-2">
            {sections.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${section === item.id ? "bg-[#ef4f5f]/12 text-[#ff8a95]" : "text-[#9993a0] hover:bg-white/5 hover:text-white"}`}
                  onClick={() => setSection(item.id)}
                >
                  <Icon className="size-4" /> {item.label}
                </button>
              );
            })}
          </aside>

          <section className="min-w-0 rounded-2xl border border-white/8 bg-[#131218] p-5 sm:p-7">
            {section === "backup" && (
              <SettingsPanel icon={Save} title="Sauvegarde" description="Un fichier unique contient tous les projets, images, polices et paramètres.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Type de fichier">
                    <Select value={settings.backupExtension} onValueChange={(value: "efs" | "zip") => updateSettings((draft) => { draft.backupExtension = value; })}>
                      <SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="efs">.efs — format du Studio</SelectItem><SelectItem value="zip">.zip — archive classique</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="Nom du fichier">
                    <div className="flex items-center gap-2"><Input value={settings.backupFilename} className="border-white/10 bg-black/20" onChange={(event) => updateSettings((draft) => { draft.backupFilename = event.target.value; })} /><span className="text-xs text-[#77717f]">.{settings.backupExtension}</span></div>
                  </Field>
                  <Field label="Raccourci de sauvegarde" className="sm:col-span-2">
                    <ShortcutRecorder value={settings.shortcuts.save} onChange={(value) => updateSettings((draft) => { draft.shortcuts.save = value; })} />
                  </Field>
                  <Field label="Google Drive — identifiant client OAuth" className="sm:col-span-2">
                    <Input value={settings.googleDriveClientId} placeholder="000000000000-….apps.googleusercontent.com" className="border-white/10 bg-black/20" onChange={(event) => updateSettings((draft) => { draft.googleDriveClientId = event.target.value; })} />
                  </Field>
                  <div className="flex flex-wrap gap-2 sm:col-span-2"><Button className="bg-[#ef4f5f] text-white" disabled={driveBusy || !settings.googleDriveClientId.trim()} onClick={() => void onSaveDrive?.()}><CloudUpload /> Sauvegarder sur Drive</Button><Button variant="outline" className="border-white/10 bg-transparent" disabled={driveBusy || !settings.googleDriveClientId.trim()} onClick={() => void onLoadDrive?.()}><CloudDownload /> Charger depuis Drive</Button></div>
                </div>
                <InfoBox icon={Download}>Le format .efs est une archive ZIP non compressée avec une extension propre à Enfer Fatal Studio.</InfoBox>
                <InfoBox icon={Globe2}>Créez un identifiant OAuth « Application Web » dans Google Cloud, activez l’API Google Drive et ajoutez l’adresse du Studio aux origines JavaScript autorisées. Le Studio demande uniquement l’accès aux fichiers qu’il crée ou que vous ouvrez.</InfoBox>
              </SettingsPanel>
            )}

            {section === "fonts" && (
              <SettingsPanel icon={Type} title="Polices d’écriture" description="Activez les polices intégrées, celles de votre ordinateur ou ajoutez vos propres fichiers.">
                <div className="mb-6 flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-[#ef4f5f] px-3 text-sm font-medium text-white hover:bg-[#ff6675]">
                    <Upload className="size-4" /> Ajouter une police
                    <input className="hidden" type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadFont(file); event.target.value = ""; }} />
                  </label>
                  <Button variant="outline" className="border-white/10 bg-transparent" disabled={scanningFonts} onClick={() => void enableLocalFonts()}>
                    <Laptop /> {scanningFonts ? "Analyse en cours…" : "Activer les polices de ce PC"}
                  </Button>
                  {settings.systemFonts.length > 0 && <Button variant="ghost" onClick={() => updateSettings((draft) => { draft.systemFonts = []; })}><Trash2 /> Oublier les polices du PC</Button>}
                  <Button asChild variant="outline" className="border-white/10 bg-transparent">
                    <a href="https://fonts.google.com/" target="_blank" rel="noreferrer"><Globe2 /> Parcourir Google Fonts <ExternalLink className="size-3" /></a>
                  </Button>
                </div>
                <div className="relative mb-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#77717f]" /><Input aria-label="Rechercher une police" value={fontSearch} placeholder="Rechercher une police…" className="border-white/10 bg-black/20 pl-9" onChange={(event) => setFontSearch(event.target.value)} /></div>
                <InfoBox icon={Laptop}>L’accès aux polices installées utilise une autorisation de Chrome ou Edge. Seul leur nom est enregistré ; les fichiers ne sont ni copiés ni envoyés.</InfoBox>
                <div className="grid gap-2">
                  {STANDARD_FONTS.filter((font) => matchesFont(font.label, font.family)).map((font) => {
                    const enabled = settings.enabledStandardFonts.includes(font.id);
                    return <FontRow key={font.id} name={font.label} family={font.family} badge="Par défaut" enabled={enabled} onToggle={(checked) => updateSettings((draft) => { draft.enabledStandardFonts = checked ? [...new Set([...draft.enabledStandardFonts, font.id])] : draft.enabledStandardFonts.filter((id) => id !== font.id); })} />;
                  })}
                  {settings.systemFonts.filter((font) => matchesFont(font.name, font.family)).map((font) => (
                    <FontRow key={font.id} name={font.name} family={font.family} badge="PC" enabled={font.enabled} onToggle={(checked) => updateSettings((draft) => { const target = draft.systemFonts.find((item) => item.id === font.id); if (target) target.enabled = checked; })} />
                  ))}
                  {settings.customFonts.filter((font) => matchesFont(font.name, font.family)).map((font) => (
                    <FontRow key={font.id} name={font.name} family={font.family} badge="Ajoutée" enabled={font.enabled} onToggle={(checked) => updateSettings((draft) => { const target = draft.customFonts.find((item) => item.id === font.id); if (target) target.enabled = checked; })} onDelete={() => void onRemoveFont(font.id)} />
                  ))}
                  {![...STANDARD_FONTS, ...settings.systemFonts, ...settings.customFonts].some((font) => matchesFont("label" in font ? font.label : font.name, font.family)) && <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#77717f]">Aucune police ne correspond à cette recherche.</p>}
                </div>
              </SettingsPanel>
            )}

            {section === "appearance" && (
              <SettingsPanel icon={Palette} title="Apparence et accessibilité" description="Adaptez le contraste, la taille de l’interface, le son et les fonds d’écriture.">
                <div className="grid gap-6">
                  <Field label="Thème de l’interface">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["normal", "dark", "light"] as const).map((theme) => (
                        <button key={theme} className={`rounded-xl border p-4 text-left transition ${settings.theme === theme ? "border-[#ef4f5f]/50 bg-[#ef4f5f]/8" : "border-white/8 bg-black/15 hover:border-white/15"}`} onClick={() => updateSettings((draft) => { draft.theme = theme; })}>
                          <span className="block font-medium text-white">{theme === "normal" ? "Normal" : theme === "dark" ? "Sombre" : "Clair"}</span>
                          <span className="mt-1 block text-xs text-[#77717f]">{theme === "normal" ? "Palette actuelle" : theme === "dark" ? "Contraste renforcé" : "Interface lumineuse"}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label={`Zoom de l’interface — ${zoomDraft ?? settings.zoom} %`}>
                    <div className="grid gap-3">
                      <div className="flex items-center gap-4">
                        <input
                          aria-label="Zoom de l’interface"
                          type="range"
                          min={75}
                          max={150}
                          step={5}
                          value={zoomDraft ?? settings.zoom}
                          className="h-2 min-w-0 flex-1 cursor-pointer accent-[#ef4f5f]"
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            zoomDraftRef.current = value;
                            setZoomDraft(value);
                          }}
                          onPointerUp={() => {
                            const value = zoomDraftRef.current;
                            updateSettings((draft) => { draft.zoom = value; });
                            setZoomDraft(null);
                          }}
                          onKeyUp={() => {
                            const value = zoomDraftRef.current;
                            updateSettings((draft) => { draft.zoom = value; });
                            setZoomDraft(null);
                          }}
                        />
                        <span className="w-12 text-right font-mono text-xs text-[#c8c2cf]">{zoomDraft ?? settings.zoom} %</span>
                      </div>
                      <div className="flex flex-wrap gap-2">{[75, 90, 100, 125, 150].map((value) => <Button key={value} size="sm" variant={settings.zoom === value ? "default" : "outline"} className={settings.zoom === value ? "bg-[#ef4f5f] text-white" : "border-white/10 bg-transparent"} onClick={() => { zoomDraftRef.current = value; setZoomDraft(null); updateSettings((draft) => { draft.zoom = value; }); }}>{value} %</Button>)}</div>
                    </div>
                  </Field>
                  <Field label="Son des boutons">
                    <Select value={settings.interfaceSound} onValueChange={(value: StudioSettings["interfaceSound"]) => { updateSettings((draft) => { draft.interfaceSound = value; }); playInterfaceSound(value); }}>
                      <SelectTrigger className="w-full border-white/10 bg-black/20 sm:w-72"><Volume2 className="size-4" /><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="soft">Doux</SelectItem><SelectItem value="mechanical">Mécanique</SelectItem><SelectItem value="digital">Numérique</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 rounded-xl border border-white/8 bg-black/15 p-4 sm:grid-cols-2">
                    <ColorField label="Fond du mode libre" value={settings.freeBackground} mode={settings.freeColorMode} onChange={(value) => updateSettings((draft) => { draft.freeBackground = value; draft.freeColorMode = colorModeFor(value); })} onModeChange={(mode) => updateSettings((draft) => { draft.freeColorMode = mode; draft.freeBackground = mode === "light" ? "#ffffff" : "#15131a"; })} />
                    <ColorField label="Fond des feuilles" value={settings.paperBackground} mode={settings.paperColorMode} onChange={(value) => updateSettings((draft) => { draft.paperBackground = value; draft.paperColorMode = colorModeFor(value); })} onModeChange={(mode) => updateSettings((draft) => { draft.paperColorMode = mode; draft.paperBackground = mode === "light" ? "#ffffff" : "#15131a"; })} />
                    <div className="sm:col-span-2 flex flex-wrap items-end gap-2 border-t border-white/7 pt-4">
                      <ColorField label="Modifier tous les fonds" value={allColor} onChange={setAllColor} compact />
                      <Button variant="outline" className="border-white/10 bg-transparent" onClick={() => updateSettings((draft) => { const mode = colorModeFor(allColor); draft.freeBackground = allColor; draft.paperBackground = allColor; draft.freeColorMode = mode; draft.paperColorMode = mode; })}>Appliquer à tous</Button>
                      <Button variant="ghost" onClick={() => updateSettings((draft) => { const defaults = createDefaultSettings(); draft.freeBackground = defaults.freeBackground; draft.paperBackground = defaults.paperBackground; draft.freeColorMode = defaults.freeColorMode; draft.paperColorMode = defaults.paperColorMode; draft.customColors = []; })}><RotateCcw /> Restaurer</Button>
                    </div>
                  </div>
                  <Field label={`Couleurs personnalisées — ${settings.customColors.length}/3`}>
                    <div className="flex flex-wrap gap-2">
                      {settings.customColors.map((color) => <div key={color} className="flex items-center gap-1 rounded-lg border border-white/9 bg-black/20 p-1"><button aria-label={`Utiliser ${color}`} className="size-8 rounded-md border border-white/15" style={{ backgroundColor: color }} onClick={() => setAllColor(color)} /><Button aria-label={`Supprimer ${color}`} size="icon-xs" variant="ghost" onClick={() => updateSettings((draft) => { draft.customColors = draft.customColors.filter((item) => item !== color); })}><Trash2 /></Button></div>)}
                      <Button size="sm" variant="outline" className="border-white/10 bg-transparent" disabled={settings.customColors.length >= 3 || settings.customColors.includes(allColor)} onClick={() => updateSettings((draft) => { draft.customColors.push(allColor); })}><Plus /> Enregistrer la couleur</Button>
                    </div>
                  </Field>
                </div>
              </SettingsPanel>
            )}

            {section === "writing" && (
              <SettingsPanel icon={Keyboard} title="Écriture et raccourcis" description="Personnalisez les actions rapides et vos caractères fréquents.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Mode focus"><ShortcutRecorder value={settings.shortcuts.focus} onChange={(value) => updateSettings((draft) => { draft.shortcuts.focus = value; })} /></Field>
                  <Field label="Saut de page"><ShortcutRecorder value={settings.shortcuts.pageBreak} onChange={(value) => updateSettings((draft) => { draft.shortcuts.pageBreak = value; })} /></Field>
                  <Field label="Tiret cadratin"><ShortcutRecorder value={settings.shortcuts.emDash} onChange={(value) => updateSettings((draft) => { draft.shortcuts.emDash = value; })} /></Field>
                  <Field label="Style de guillemets"><Select value={settings.quoteStyle} onValueChange={(value: "straight" | "french") => updateSettings((draft) => { draft.quoteStyle = value; })}><SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="french">« Guillemets français »</SelectItem><SelectItem value="straight">&quot;Guillemets droits&quot;</SelectItem></SelectContent></Select></Field>
                </div>
                <div className="mt-7 border-t border-white/7 pt-6">
                  <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-medium text-white">Raccourcis de caractères personnalisés</h3><p className="mt-1 text-xs text-[#77717f]">Pour une touche seule, choisissez un appui simple ou double.</p></div><Button variant="outline" className="border-white/10 bg-transparent" onClick={() => updateSettings((draft) => { draft.characterShortcuts.push({ id: createId("shortcut"), character: "…", shortcut: "", pressMode: "single" }); })}><Plus /> Ajouter</Button></div>
                  <div className="grid gap-2">
                    {settings.characterShortcuts.map((binding) => (
                      <div key={binding.id} className="grid gap-2 rounded-xl border border-white/8 bg-black/15 p-3 sm:grid-cols-[100px_1fr_150px_auto]">
                        <Input aria-label="Caractère inséré" value={binding.character} className="border-white/10 bg-white/3 text-center text-lg" onChange={(event) => updateSettings((draft) => { const target = draft.characterShortcuts.find((item) => item.id === binding.id); if (target) target.character = event.target.value; })} />
                        <ShortcutRecorder value={binding.shortcut} onChange={(value) => updateSettings((draft) => { const target = draft.characterShortcuts.find((item) => item.id === binding.id); if (target) target.shortcut = value; })} />
                        <Select value={binding.pressMode} onValueChange={(value: "single" | "double") => updateSettings((draft) => { const target = draft.characterShortcuts.find((item) => item.id === binding.id); if (target) target.pressMode = value; })}><SelectTrigger className="w-full border-white/10 bg-white/3"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Appui simple</SelectItem><SelectItem value="double">Appui double</SelectItem></SelectContent></Select>
                        <Button aria-label="Supprimer le raccourci" variant="ghost" size="icon" onClick={() => updateSettings((draft) => { draft.characterShortcuts = draft.characterShortcuts.filter((item) => item.id !== binding.id); })}><Trash2 /></Button>
                      </div>
                    ))}
                    {!settings.characterShortcuts.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-[#77717f]">Aucun raccourci personnalisé.</p>}
                  </div>
                </div>
              </SettingsPanel>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function systemFontId(family: string) {
  let hash = 0;
  for (const character of family.toLocaleLowerCase("fr")) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `system-${Math.abs(hash).toString(36)}`;
}

function SettingsPanel({ icon: Icon, title, description, children }: { icon: typeof Save; title: string; description: string; children: React.ReactNode }) {
  return <div><div className="mb-7 flex items-start gap-3 border-b border-white/7 pb-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]"><Icon className="size-5" /></span><div><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-[#8f8996]">{description}</p></div></div>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${className}`}>{label}{children}</label>;
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Input
    data-shortcut-recorder="true"
    readOnly
    value={value}
    placeholder="Cliquez puis pressez les touches"
    className="cursor-pointer border-white/10 bg-black/20 font-mono text-xs"
    onKeyDown={(event) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.currentTarget.blur();
        return;
      }
      if (isModifierKey(event.key)) return;
      const shortcut = shortcutFromEvent(event);
      if (shortcut) {
        onChange(shortcut);
        event.currentTarget.blur();
      }
    }}
    onFocus={(event) => event.currentTarget.select()}
  />;
}

function FontRow({ name, family, badge, enabled, onToggle, onDelete }: { name: string; family: string; badge: string; enabled: boolean; onToggle: (checked: boolean) => void; onDelete?: () => void }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3"><span className="grid size-9 place-items-center rounded-lg bg-white/5 text-lg text-white" style={{ fontFamily: family }}>Aa</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-white">{name}</span><span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#77717f]">{badge}</span></div><p className="mt-0.5 truncate text-xs text-[#77717f]" style={{ fontFamily: family }}>Aperçu de la police d’écriture</p></div><Switch checked={enabled} onCheckedChange={onToggle} />{onDelete && <Button aria-label={`Supprimer ${name}`} size="icon-sm" variant="ghost" className="text-[#77717f] hover:text-[#ff7885]" onClick={onDelete}><Trash2 /></Button>}</div>;
}

function ColorField({ label, value, onChange, mode, onModeChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; mode?: WritingColorMode; onModeChange?: (mode: WritingColorMode) => void; compact?: boolean }) {
  return <div className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${compact ? "min-w-44" : ""}`}><span>{label}</span>{mode && onModeChange && <span className="grid grid-cols-2 gap-1 rounded-lg border border-white/9 bg-black/20 p-1">{(["light", "dark"] as const).map((value) => <button key={value} type="button" className={`rounded-md px-2 py-1.5 text-xs transition ${mode === value ? "bg-[#ef4f5f] text-white" : "text-[#8f8996] hover:bg-white/5"}`} onClick={() => onModeChange(value)}>{value === "light" ? "Mode clair" : "Mode sombre"}</button>)}</span>}<span className="flex items-center gap-2 rounded-lg border border-white/9 bg-black/20 p-2"><ColorPicker label={label} value={value} onChange={onChange} /><span className="font-mono text-xs text-[#c8c2cf]">{value.toUpperCase()}</span></span></div>;
}

function colorModeFor(color: string): WritingColorMode {
  const value = color.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 < 145 ? "dark" : "light";
}

function InfoBox({ icon: Icon, children }: { icon: typeof Download; children: React.ReactNode }) {
  return <div className="mt-6 flex gap-3 rounded-xl border border-[#4ca9ad]/20 bg-[#4ca9ad]/6 p-4 text-xs leading-5 text-[#9fbec0]"><Icon className="mt-0.5 size-4 shrink-0" />{children}</div>;
}
