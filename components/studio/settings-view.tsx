"use client";

import { useState } from "react";
import {
  Accessibility,
  Download,
  ExternalLink,
  FileArchive,
  Globe2,
  Keyboard,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  Upload,
  Volume2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { createDefaultSettings, createId, STANDARD_FONTS, type StudioSettings } from "@/lib/studio";
import { shortcutFromEvent } from "@/lib/shortcuts";

type SettingsSection = "backup" | "fonts" | "appearance" | "writing";

export function SettingsView({
  settings,
  updateSettings,
  onUploadFont,
  onRemoveFont,
}: {
  settings: StudioSettings;
  updateSettings: (mutate: (draft: StudioSettings) => void) => void;
  onUploadFont: (file: File) => Promise<void>;
  onRemoveFont: (fontId: string) => Promise<void>;
}) {
  const [section, setSection] = useState<SettingsSection>("backup");
  const [allColor, setAllColor] = useState(settings.paperBackground);
  const sections = [
    { id: "backup" as const, label: "Sauvegarde", icon: FileArchive },
    { id: "fonts" as const, label: "Polices d’écriture", icon: Type },
    { id: "appearance" as const, label: "Apparence et accessibilité", icon: Accessibility },
    { id: "writing" as const, label: "Écriture et raccourcis", icon: Keyboard },
  ];

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
                </div>
                <InfoBox icon={Download}>Le format .efs est une archive ZIP non compressée avec une extension propre à Enfer Fatal Studio.</InfoBox>
              </SettingsPanel>
            )}

            {section === "fonts" && (
              <SettingsPanel icon={Type} title="Polices d’écriture" description="Activez les polices intégrées ou ajoutez vos propres fichiers de police.">
                <div className="mb-6 flex flex-wrap gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-[#ef4f5f] px-3 text-sm font-medium text-white hover:bg-[#ff6675]">
                    <Upload className="size-4" /> Ajouter une police
                    <input className="hidden" type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUploadFont(file); event.target.value = ""; }} />
                  </label>
                  <Button asChild variant="outline" className="border-white/10 bg-transparent">
                    <a href="https://fonts.google.com/" target="_blank" rel="noreferrer"><Globe2 /> Parcourir Google Fonts <ExternalLink className="size-3" /></a>
                  </Button>
                </div>
                <div className="grid gap-2">
                  {STANDARD_FONTS.map((font) => {
                    const enabled = settings.enabledStandardFonts.includes(font.id);
                    return <FontRow key={font.id} name={font.label} family={font.family} badge="Intégrée" enabled={enabled} onToggle={(checked) => updateSettings((draft) => { draft.enabledStandardFonts = checked ? [...new Set([...draft.enabledStandardFonts, font.id])] : draft.enabledStandardFonts.filter((id) => id !== font.id); })} />;
                  })}
                  {settings.customFonts.map((font) => (
                    <FontRow key={font.id} name={font.name} family={font.family} badge="Ajoutée" enabled={font.enabled} onToggle={(checked) => updateSettings((draft) => { const target = draft.customFonts.find((item) => item.id === font.id); if (target) target.enabled = checked; })} onDelete={() => void onRemoveFont(font.id)} />
                  ))}
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
                  <Field label={`Zoom de l’interface — ${settings.zoom} %`}>
                    <div className="flex items-center gap-4"><Slider min={75} max={150} step={5} value={[settings.zoom]} onValueChange={([value]) => updateSettings((draft) => { draft.zoom = value; })} /><Button size="sm" variant="outline" className="border-white/10 bg-transparent" onClick={() => updateSettings((draft) => { draft.zoom = 100; })}>100 %</Button></div>
                  </Field>
                  <Field label="Son des boutons">
                    <Select value={settings.interfaceSound} onValueChange={(value: StudioSettings["interfaceSound"]) => updateSettings((draft) => { draft.interfaceSound = value; })}>
                      <SelectTrigger className="w-full border-white/10 bg-black/20 sm:w-72"><Volume2 className="size-4" /><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="soft">Doux</SelectItem><SelectItem value="mechanical">Mécanique</SelectItem><SelectItem value="digital">Numérique</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-4 rounded-xl border border-white/8 bg-black/15 p-4 sm:grid-cols-2">
                    <ColorField label="Fond du mode libre" value={settings.freeBackground} onChange={(value) => updateSettings((draft) => { draft.freeBackground = value; })} />
                    <ColorField label="Fond des feuilles" value={settings.paperBackground} onChange={(value) => updateSettings((draft) => { draft.paperBackground = value; })} />
                    <div className="sm:col-span-2 flex flex-wrap items-end gap-2 border-t border-white/7 pt-4">
                      <ColorField label="Modifier tous les fonds" value={allColor} onChange={setAllColor} compact />
                      <Button variant="outline" className="border-white/10 bg-transparent" onClick={() => updateSettings((draft) => { draft.freeBackground = allColor; draft.paperBackground = allColor; })}>Appliquer à tous</Button>
                      <Button variant="ghost" onClick={() => updateSettings((draft) => { const defaults = createDefaultSettings(); draft.freeBackground = defaults.freeBackground; draft.paperBackground = defaults.paperBackground; draft.customColors = []; })}><RotateCcw /> Restaurer</Button>
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

function SettingsPanel({ icon: Icon, title, description, children }: { icon: typeof Save; title: string; description: string; children: React.ReactNode }) {
  return <div><div className="mb-7 flex items-start gap-3 border-b border-white/7 pb-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ef4f5f]/10 text-[#ef6977]"><Icon className="size-5" /></span><div><h2 className="text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm text-[#8f8996]">{description}</p></div></div>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${className}`}>{label}{children}</label>;
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Input readOnly value={value} placeholder="Cliquez puis pressez les touches" className="cursor-pointer border-white/10 bg-black/20 font-mono text-xs" onKeyDown={(event) => { event.preventDefault(); const shortcut = shortcutFromEvent(event); if (shortcut) onChange(shortcut); }} onFocus={(event) => event.currentTarget.select()} />;
}

function FontRow({ name, family, badge, enabled, onToggle, onDelete }: { name: string; family: string; badge: string; enabled: boolean; onToggle: (checked: boolean) => void; onDelete?: () => void }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3"><span className="grid size-9 place-items-center rounded-lg bg-white/5 text-lg text-white" style={{ fontFamily: family }}>Aa</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-white">{name}</span><span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#77717f]">{badge}</span></div><p className="mt-0.5 truncate text-xs text-[#77717f]" style={{ fontFamily: family }}>Aperçu de la police d’écriture</p></div><Switch checked={enabled} onCheckedChange={onToggle} />{onDelete && <Button aria-label={`Supprimer ${name}`} size="icon-sm" variant="ghost" className="text-[#77717f] hover:text-[#ff7885]" onClick={onDelete}><Trash2 /></Button>}</div>;
}

function ColorField({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return <label className={`grid gap-2 text-xs font-medium text-[#aaa4b4] ${compact ? "min-w-44" : ""}`}>{label}<span className="flex items-center gap-2 rounded-lg border border-white/9 bg-black/20 p-2"><input type="color" value={value} className="size-8 cursor-pointer rounded border-0 bg-transparent" onChange={(event) => onChange(event.target.value)} /><span className="font-mono text-xs text-[#c8c2cf]">{value.toUpperCase()}</span></span></label>;
}

function InfoBox({ icon: Icon, children }: { icon: typeof Download; children: React.ReactNode }) {
  return <div className="mt-6 flex gap-3 rounded-xl border border-[#4ca9ad]/20 bg-[#4ca9ad]/6 p-4 text-xs leading-5 text-[#9fbec0]"><Icon className="mt-0.5 size-4 shrink-0" />{children}</div>;
}
