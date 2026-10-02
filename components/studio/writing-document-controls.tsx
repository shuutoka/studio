"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LoaderCircle, MessageSquareText, Minus, Moon, PanelBottom, PencilLine,
  Sigma, SlidersHorizontal, Sun, Trash2, Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATE_FOOTER_FORMATS, footerFormatForType, formatFooterText, PAGE_FOOTER_FORMATS } from "@/lib/writing-footer";
import {
  PAGE_FORMATS,
  type FooterFormat, type FooterType, type PageFormat, type PageStatus,
  type StudioSettings, type StudioVolume,
} from "@/lib/studio";

const specialCharacterGroups = {
  Typographie: ["« ", " »", "“", "”", "‘", "’", "‹", "›", "—", "–", "…", "•", "·", "‑", "§", "¶", "†", "‡", "№"],
  "Accents et ligatures": ["À", "Á", "Â", "Ä", "Æ", "Ç", "È", "É", "Ê", "Ë", "Î", "Ï", "Ô", "Ö", "Œ", "Ù", "Û", "Ü", "Ÿ", "à", "â", "ä", "æ", "ç", "è", "é", "ê", "ë", "î", "ï", "ô", "ö", "œ", "ù", "û", "ü", "ÿ"],
  Mathématiques: ["±", "×", "÷", "≠", "≈", "≤", "≥", "∞", "√", "∑", "∏", "∫", "∂", "∆", "π", "µ", "°", "‰", "½", "¼", "¾", "⅓", "⅔"],
  Monnaies: ["€", "$", "£", "¥", "₩", "₹", "₽", "₿", "¢", "₫", "₴", "₦", "₱", "₪", "₡"],
  Flèches: ["←", "↑", "→", "↓", "↔", "↕", "⇐", "⇒", "⇔", "↗", "↘", "↙", "↖", "↩", "↪", "⟵", "⟶", "⟷"],
  Symboles: ["©", "®", "™", "✓", "✔", "✕", "✖", "★", "☆", "♥", "♡", "♦", "♣", "♠", "☀", "☁", "☂", "☕", "☎", "⚠", "♩", "♪", "♫"],
  Grec: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "φ", "χ", "ψ", "ω", "Γ", "Δ", "Θ", "Λ", "Σ", "Φ", "Ψ", "Ω"],
  Emoji: ["😀", "😃", "😄", "😁", "😂", "😊", "😍", "😘", "😎", "🤔", "😐", "😢", "😭", "😡", "😱", "🥳", "🤖", "👻", "😈", "👍", "👎", "👏", "🙏", "💪", "👀", "❤️", "💔", "✨", "🔥", "💧", "🌙", "☀️", "⭐", "🌍", "🎉", "🎵", "📌", "✍️", "📖", "💡"],
} satisfies Record<string, string[]>;

const statusLabels: Record<PageStatus, string> = {
  draft: "Brouillon",
  review: "À relire",
  done: "Terminé",
};

export function WritingDocumentControls({
  volume,
  settings,
  onStatusChange,
  onPageFormatChange,
  onPaperModeChange,
  onInsert,
  onApplyFooter,
  commentsVisible,
  onToggleComments,
  drawingEnabled,
  drawingColor,
  drawingSize,
  onDrawingEnabledChange,
  onDrawingColorChange,
  onDrawingSizeChange,
  onUndoDrawing,
  onClearDrawings,
}: {
  volume: StudioVolume;
  settings: StudioSettings;
  onStatusChange: (status: PageStatus) => void;
  onPageFormatChange: (format: PageFormat) => Promise<void>;
  onPaperModeChange: (mode: "light" | "dark") => void;
  onInsert: (text: string) => boolean;
  onApplyFooter: (type: FooterType, text: string, format: FooterFormat) => Promise<void>;
  commentsVisible: boolean;
  onToggleComments: () => void;
  drawingEnabled: boolean;
  drawingColor: string;
  drawingSize: number;
  onDrawingEnabledChange: (enabled: boolean) => void;
  onDrawingColorChange: (color: string) => void;
  onDrawingSizeChange: (size: number) => void;
  onUndoDrawing: () => void;
  onClearDrawings: () => void;
}) {
  const [footerType, setFooterType] = useState<FooterType>(volume.footerType);
  const [footerText, setFooterText] = useState(volume.footerText);
  const [footerFormat, setFooterFormat] = useState<FooterFormat>(
    footerFormatForType(volume.footerType, volume.footerFormat),
  );
  const [applyingFooter, setApplyingFooter] = useState(false);
  const [characterQuery, setCharacterQuery] = useState("");
  const [applyingPageFormat, setApplyingPageFormat] = useState(false);

  useEffect(() => {
    // The local draft is intentionally reset when another volume is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFooterType(volume.footerType);
    setFooterText(volume.footerText);
    setFooterFormat(footerFormatForType(volume.footerType, volume.footerFormat));
  }, [volume.footerFormat, volume.footerText, volume.footerType, volume.id]);

  const filteredCharacters = useMemo(() => Object.entries(specialCharacterGroups)
    .map(([group, characters]) => ({
      group,
      characters: characters.filter((character) => !characterQuery || `${group} ${character}`.toLocaleLowerCase("fr").includes(characterQuery.toLocaleLowerCase("fr"))),
    }))
    .filter((item) => item.characters.length), [characterQuery]);

  function insert(text: string) {
    if (!onInsert(text)) toast.error("Cliquez d’abord dans le document pour placer le curseur.");
  }

  async function applyFooter() {
    setApplyingFooter(true);
    try {
      await onApplyFooter(footerType, footerText, footerFormatForType(footerType, footerFormat));
      toast.success(footerType === "none" ? "Pied de page retiré." : "Pied de page appliqué au volume.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le pied de page n’a pas pu être appliqué.");
    } finally {
      setApplyingFooter(false);
    }
  }

  async function applyPageFormat(format: PageFormat) {
    setApplyingPageFormat(true);
    try {
      await onPageFormatChange(format);
      toast.success(`Format ${PAGE_FORMATS[format].label} appliqué au volume.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le format de feuille n’a pas pu être appliqué.");
    } finally {
      setApplyingPageFormat(false);
    }
  }

  return (
    <div className="writing-document-controls flex min-h-10 items-center gap-2 overflow-x-auto border-t border-white/6 px-3 py-1.5 sm:px-5">
      <Select value={volume.status} onValueChange={(value: PageStatus) => onStatusChange(value)}>
        <SelectTrigger size="sm" className="w-32 shrink-0 border-white/10 bg-white/3 text-xs" aria-label="État du manuscrit"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>

      <Select value={volume.pageFormat} disabled={applyingPageFormat} onValueChange={(value: PageFormat) => void applyPageFormat(value)}>
        <SelectTrigger size="sm" className="w-40 shrink-0 border-white/10 bg-white/3 text-xs" aria-label="Format de la feuille">
          {applyingPageFormat ? <LoaderCircle className="animate-spin" /> : <SelectValue />}
        </SelectTrigger>
        <SelectContent>{(["a4", "a5", "pocket", "novel", "large"] as const).map((value) => <SelectItem key={value} value={value}>{PAGE_FORMATS[value].label}</SelectItem>)}</SelectContent>
      </Select>

      <div className="flex shrink-0 items-center rounded-md border border-white/10 bg-white/3 p-0.5" aria-label="Couleur de la feuille">
        <Button aria-label="Feuille claire" title="Feuille claire" aria-pressed={settings.paperColorMode === "light"} size="icon-xs" variant={settings.paperColorMode === "light" ? "default" : "ghost"} className={settings.paperColorMode === "light" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => onPaperModeChange("light")}><Sun /></Button>
        <Button aria-label="Feuille sombre" title="Feuille sombre" aria-pressed={settings.paperColorMode === "dark"} size="icon-xs" variant={settings.paperColorMode === "dark" ? "default" : "ghost"} className={settings.paperColorMode === "dark" ? "bg-[#ef4f5f] text-white" : ""} onClick={() => onPaperModeChange("dark")}><Moon /></Button>
      </div>

      <Popover>
        <PopoverTrigger asChild><Button size="sm" variant="outline" className="shrink-0 border-white/10 bg-transparent text-xs"><PanelBottom /> Pied de page</Button></PopoverTrigger>
        <PopoverContent align="start" className="w-80 border-white/10 bg-[#1b1821] text-[#eeeaf2]">
          <PopoverHeader className="mb-4"><PopoverTitle>Pied de page du volume</PopoverTitle></PopoverHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Contenu
              <Select value={footerType} onValueChange={(value: FooterType) => {
                setFooterType(value);
                setFooterFormat((current) => footerFormatForType(value, current));
              }}>
                <SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="page">Numérotation</SelectItem><SelectItem value="date">Date actuelle</SelectItem><SelectItem value="custom">Texte personnalisé</SelectItem></SelectContent>
              </Select>
            </label>
            {(footerType === "page" || footerType === "date") && <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Format
              <Select value={footerFormatForType(footerType, footerFormat)} onValueChange={(value: FooterFormat) => setFooterFormat(value)}>
                <SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent>{(footerType === "page" ? PAGE_FOOTER_FORMATS : DATE_FOOTER_FORMATS).map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>}
            {footerType === "custom" && <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Texte<Input value={footerText} className="border-white/10 bg-black/20" onChange={(event) => setFooterText(event.target.value)} /></label>}
            {footerType !== "none" && <p className="rounded-md border border-white/7 bg-black/15 px-3 py-2 text-xs text-[#c8c2cf]">Aperçu : {formatFooterText(footerType, footerFormatForType(footerType, footerFormat), footerText, 1, 12)}</p>}
            <Button disabled={applyingFooter || (footerType === "custom" && !footerText.trim())} onClick={() => void applyFooter()}>{applyingFooter ? <LoaderCircle className="animate-spin" /> : <PanelBottom />} Appliquer</Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="h-5 w-px shrink-0 bg-white/8" />
      <Button
        size="sm"
        variant={commentsVisible ? "default" : "ghost"}
        className={commentsVisible ? "shrink-0 bg-[#ef4f5f] text-xs text-white" : "shrink-0 text-xs"}
        aria-pressed={commentsVisible}
        onClick={onToggleComments}
      ><MessageSquareText /> Commentaires</Button>

      <Button
        size="sm"
        variant={drawingEnabled ? "default" : "ghost"}
        className={drawingEnabled ? "shrink-0 bg-[#ef4f5f] text-xs text-white" : "shrink-0 text-xs"}
        aria-pressed={drawingEnabled}
        onClick={() => onDrawingEnabledChange(!drawingEnabled)}
      ><PencilLine /> {drawingEnabled ? "Dessin actif" : "Dessiner"}</Button>

      <Popover>
        <PopoverTrigger asChild><Button size="sm" variant="ghost" className="shrink-0 text-xs" aria-label="Options du dessin"><SlidersHorizontal /> Options</Button></PopoverTrigger>
        <PopoverContent align="start" className="w-80 border-white/10 bg-[#1b1821] text-[#eeeaf2]">
          <PopoverHeader className="mb-4"><PopoverTitle>Options du dessin</PopoverTitle></PopoverHeader>
          <div className="grid gap-4">
            <div><p className="mb-2 text-xs text-[#aaa4b4]">Couleur</p><div className="flex flex-wrap gap-2">{["#ef4f5f", "#ffb020", "#f3e55a", "#58c68a", "#5aa9ff", "#b783ff", "#29262b"].map((color) => <button key={color} type="button" aria-label={`Couleur ${color}`} aria-pressed={drawingColor === color} className="size-8 rounded-full border border-white/20 outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#ef4f5f] aria-pressed:ring-2 aria-pressed:ring-white" style={{ backgroundColor: color }} onClick={() => onDrawingColorChange(color)} />)}</div></div>
            <div><p className="mb-2 text-xs text-[#aaa4b4]">Épaisseur</p><div className="grid grid-cols-4 gap-2">{[{ value: 2, label: "Fine" }, { value: 4, label: "Normale" }, { value: 8, label: "Large" }, { value: 14, label: "Très large" }].map((item) => <button key={item.value} type="button" aria-pressed={drawingSize === item.value} className="grid h-10 place-items-center rounded-md border border-white/9 bg-white/3 text-[10px] text-[#aaa4b4] hover:bg-white/7 aria-pressed:border-[#ef4f5f]/60 aria-pressed:bg-[#ef4f5f]/10 aria-pressed:text-white" onClick={() => onDrawingSizeChange(item.value)}><span className="rounded-full bg-current" style={{ width: Math.max(4, item.value), height: Math.max(4, item.value) }} /><span className="sr-only">{item.label}</span></button>)}</div></div>
            <div className="flex gap-2"><Button variant="outline" className="flex-1 border-white/10 bg-transparent" disabled={!volume.documentDrawings.length} onClick={onUndoDrawing}><Undo2 /> Annuler un trait</Button><Button variant="ghost" className="text-[#d27a84]" disabled={!volume.documentDrawings.length} onClick={() => { if (window.confirm("Effacer toutes les annotations dessinées de ce volume ?")) onClearDrawings(); }}><Trash2 /> Tout effacer</Button></div>
            <p className="text-[11px] leading-4 text-[#77717f]">Les traits sont conservés dans la sauvegarde EFS et intégrés au DOCX exporté sous forme d’images transparentes placées sur les pages.</p>
          </div>
        </PopoverContent>
      </Popover>

      <Button size="sm" variant="ghost" className="shrink-0 text-xs" title={`Insérer un tiret cadratin (${settings.shortcuts.emDash})`} onClick={() => insert("—")}><Minus /> Tiret cadratin</Button>

      <Popover>
        <PopoverTrigger asChild><Button size="sm" variant="ghost" className="shrink-0 text-xs"><Sigma /> Caractères spéciaux</Button></PopoverTrigger>
        <PopoverContent align="start" className="max-h-[65svh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto border-white/10 bg-[#1b1821] text-[#eeeaf2]">
          <PopoverHeader className="mb-3"><PopoverTitle>Insérer un caractère</PopoverTitle></PopoverHeader>
          <Input value={characterQuery} placeholder="Rechercher un symbole…" className="mb-4 border-white/10 bg-black/20" onChange={(event) => setCharacterQuery(event.target.value)} />
          <div className="grid gap-4">
            {filteredCharacters.map(({ group, characters }) => <section key={group}><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#77717f]">{group}</h3><div className="flex flex-wrap gap-1">{characters.map((character) => <button key={character} type="button" title={`Insérer ${character}`} className="grid size-9 place-items-center rounded-md border border-white/7 bg-white/3 text-base text-[#d8d3dd] hover:border-[#ef6977]/40 hover:bg-[#ef6977]/10 hover:text-white" onClick={() => insert(character)}>{character}</button>)}</div></section>)}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
