import { copyFile, mkdir, rm } from "node:fs/promises";

const dictionaries = {
  de: "dictionary-de",
  en: "dictionary-en",
  es: "dictionary-es",
  fr: "dictionary-fr",
};
const destination = new URL("../public/proofing/", import.meta.url);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

await Promise.all(Object.entries(dictionaries).flatMap(([language, packageName]) => [
  copyFile(new URL(`../node_modules/${packageName}/index.aff`, import.meta.url), new URL(`${language}.aff`, destination)),
  copyFile(new URL(`../node_modules/${packageName}/index.dic`, import.meta.url), new URL(`${language}.dic`, destination)),
  copyFile(new URL(`../node_modules/${packageName}/license`, import.meta.url), new URL(`${language}-LICENSE.txt`, destination)),
]));
