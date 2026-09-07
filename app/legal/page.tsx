import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { LegalInformation } from "@/components/studio/legal-information";

export const metadata: Metadata = {
  title: "Informations légales — Enfer Fatal Studio",
  description: "Mentions légales, confidentialité et conditions d’utilisation d’Enfer Fatal Studio.",
  alternates: {
    canonical: "https://studio.lotaku.fr/legal/",
  },
};

export default function LegalPage() {
  return (
    <div data-studio-theme="normal" className="studio-shell flex min-h-svh flex-col bg-[#0c0b0f] text-[#eeeaf2]">
      <header className="sticky top-0 z-20 border-b border-white/7 bg-[#0c0b0f]/92 px-5 py-3 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a className="inline-flex items-center gap-2 text-sm text-[#aaa4b4] hover:text-white" href="../">
            <ArrowLeft className="size-4" /> Retour au Studio
          </a>
          <span className="text-xs font-semibold text-[#ef6977]">Enfer Fatal Studio</span>
        </div>
      </header>
      <LegalInformation />
    </div>
  );
}

