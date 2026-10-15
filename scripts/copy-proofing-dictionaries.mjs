import { copyFile, mkdir, rm } from "node:fs/promises";

const destination = new URL("../public/proofing/", import.meta.url);

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

await Promise.all([
  copyFile(new URL("../node_modules/dictionary-fr/index.aff", import.meta.url), new URL("fr.aff", destination)),
  copyFile(new URL("../node_modules/dictionary-fr/index.dic", import.meta.url), new URL("fr.dic", destination)),
  copyFile(new URL("../node_modules/dictionary-fr/license", import.meta.url), new URL("fr-LICENSE.txt", destination)),
]);
