"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Minus, Moon, PanelBottom, Sigma, Sun } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FooterType, PageStatus, StudioSettings, StudioVolume } from "@/lib/studio";

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
  onPaperModeChange,
  onInsert,
  onApplyFooter,
}: {
  volume: StudioVolume;
  settings: StudioSettings;
  onStatusChange: (status: PageStatus) => void;
  onPaperModeChange: (mode: "light" | "dark") => void;
  onInsert: (text: string) => boolean;
  onApplyFooter: (type: FooterType, text: string) => Promise<void>;
}) {
  const [footerType, setFooterType] = useState<FooterType>(volume.footerType);
  const [footerText, setFooterText] = useState(volume.footerText);
  const [applyingFooter, setApplyingFooter] = useState(false);
  const [characterQuery, setCharacterQuery] = useState("");

  useEffect(() => {
    setFooterType(volume.footerType);
    setFooterText(volume.footerText);
  }, [volume.footerText, volume.footerType, volume.id]);

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
      await onApplyFooter(footerType, footerText);
      toast.success(footerType === "none" ? "Pied de page retiré." : "Pied de page appliqué au volume.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Le pied de page n’a pas pu être appliqué.");
    } finally {
      setApplyingFooter(false);
    }
  }

  return (
    <div className="writing-document-controls flex min-h-10 items-center gap-2 overflow-x-auto border-t border-white/6 px-3 py-1.5 sm:px-5">
      <Select value={volume.status} onValueChange={(value: PageStatus) => onStatusChange(value)}>
        <SelectTrigger size="sm" className="w-32 shrink-0 border-white/10 bg-white/3 text-xs" aria-label="État du manuscrit"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
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
              <Select value={footerType} onValueChange={(value: FooterType) => setFooterType(value)}>
                <SelectTrigger className="w-full border-white/10 bg-black/20"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Aucun</SelectItem><SelectItem value="page">Numérotation</SelectItem><SelectItem value="date">Date actuelle</SelectItem><SelectItem value="custom">Texte personnalisé</SelectItem></SelectContent>
              </Select>
            </label>
            {footerType === "custom" && <label className="grid gap-1.5 text-xs text-[#aaa4b4]">Texte<Input value={footerText} className="border-white/10 bg-black/20" onChange={(event) => setFooterText(event.target.value)} /></label>}
            <Button disabled={applyingFooter || (footerType === "custom" && !footerText.trim())} onClick={() => void applyFooter()}>{applyingFooter ? <LoaderCircle className="animate-spin" /> : <PanelBottom />} Appliquer</Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="h-5 w-px shrink-0 bg-white/8" />
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
