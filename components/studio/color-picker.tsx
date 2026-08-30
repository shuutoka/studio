"use client";

import { useMemo, useState } from "react";
import { Palette } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DEFAULT_PRESETS = [
  "#ffffff", "#f7f4ed", "#f4e7d3", "#d9e8f5", "#dcebd8", "#f2dce5",
  "#29262b", "#15131a", "#111016", "#243247", "#263c32", "#4a2632",
];

type ColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  presets?: string[];
};

export function ColorPicker({
  value,
  onChange,
  label,
  className,
  presets = DEFAULT_PRESETS,
}: ColorPickerProps) {
  const normalizedValue = normalizeHex(value) ?? "#000000";
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const displayedHex = hexDraft ?? normalizedValue.toUpperCase();
  const rgb = useMemo(() => hexToRgb(normalizedValue), [normalizedValue]);

  function applyColor(nextColor: string) {
    const normalized = normalizeHex(nextColor);
    if (!normalized) return;
    setHexDraft(null);
    onChange(normalized);
  }

  function updateRgb(channel: "red" | "green" | "blue", rawValue: string) {
    const next = { ...rgb, [channel]: clampChannel(Number(rawValue)) };
    applyColor(rgbToHex(next.red, next.green, next.blue));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          title={label}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("relative shrink-0 text-[#aaa4b4] hover:bg-white/7 hover:text-white", className)}
        >
          <Palette className="size-4" />
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 size-2.5 rounded-full border border-black/35 shadow-sm"
            style={{ backgroundColor: normalizedValue }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 border-white/10 bg-[#1b1821] text-[#eeeaf2]">
        <PopoverHeader className="mb-4">
          <PopoverTitle>{label}</PopoverTitle>
        </PopoverHeader>

        <div className="grid grid-cols-6 gap-2" aria-label="Couleurs prédéfinies">
          {presets.map((preset) => (
            <button
              key={preset}
              aria-label={`Choisir ${preset}`}
              aria-pressed={normalizedValue === preset.toLowerCase()}
              type="button"
              className="aspect-square rounded-md border border-white/15 shadow-sm outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#ef4f5f] aria-pressed:ring-2 aria-pressed:ring-[#ef4f5f]"
              style={{ backgroundColor: preset }}
              onClick={() => applyColor(preset)}
            />
          ))}
        </div>

        <label className="mt-4 grid gap-1.5 text-[11px] font-medium text-[#aaa4b4]">
          Couleur HEX
          <Input
            aria-label="Valeur HEX"
            value={displayedHex}
            maxLength={7}
            className="border-white/10 bg-black/20 font-mono uppercase"
            onChange={(event) => {
              const next = event.target.value;
              setHexDraft(next.toUpperCase());
              const normalized = normalizeHex(next);
              if (normalized) onChange(normalized);
            }}
            onBlur={() => setHexDraft(null)}
          />
        </label>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <RgbField label="R" value={rgb.red} onChange={(next) => updateRgb("red", next)} />
          <RgbField label="V" value={rgb.green} onChange={(next) => updateRgb("green", next)} />
          <RgbField label="B" value={rgb.blue} onChange={(next) => updateRgb("blue", next)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RgbField({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-[11px] font-medium text-[#aaa4b4]">
      {label}
      <Input
        aria-label={`Canal ${label}`}
        type="number"
        min={0}
        max={255}
        value={value}
        className="border-white/10 bg-black/20 px-2 text-center font-mono"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function normalizeHex(value: string) {
  const candidate = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function hexToRgb(hex: string) {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function clampChannel(value: number) {
  return Math.min(255, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));
}
