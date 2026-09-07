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
  icon: [
    {
      url: "./favicon-32.png",
      sizes: "32x32",
      type: "image/png",
    },
    {
      url: "./icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
  ],
  shortcut: "./favicon-32.png",
  apple: {
    url: "./apple-touch-icon.png",
    sizes: "180x180",
    type: "image/png",
  },
},

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
