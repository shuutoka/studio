import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enfer Fatal Studio",
  description: "Un studio local-first pour organiser et écrire vos projets narratifs.",
  manifest: "./manifest.webmanifest",
  applicationName: "Enfer Fatal Studio",
  appleWebApp: {
    capable: true,
    title: "EF Studio",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "./favicon.svg",
    shortcut: "./favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
