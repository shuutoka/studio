# Enfer Fatal Studio

Prototype d’un studio d’écriture local-first conçu pour GitHub Pages. Les projets
sont conservés dans le navigateur et peuvent être sauvegardés dans une archive
lisible `.efstudio.zip`.

## Fonctions disponibles

- accueil multi-projets avec progression et statistiques ;
- types de projet : manga/BD, roman, script et écriture libre, avec surcharge par page ;
- volumes, chapitres et pages vierges ;
- simulation des formats A4, A5, poche, roman standard et grand format ;
- éditeur enrichi : titres, polices, tailles, gras, italique, souligné, couleur et listes ;
- ajout de polices personnalisées TTF, OTF, WOFF et WOFF2 ;
- fiches de personnages avancées avec recherche, tags, images, tenues et relations ;
- bibliothèque générale des personnages de tous les projets ;
- objectifs en colonnes « À faire / En cours / Terminé » ;
- carnet de notes ;
- suppression confirmée des projets, personnages, pages, notes et objectifs ;
- copie de récupération automatique dans IndexedDB ;
- état `Enregistré` / `Non enregistré` ;
- avertissement du navigateur avant de quitter avec des changements non sauvegardés ;
- sauvegarde globale de tous les projets dans un fichier `.efs` non compressé ou `.zip` ;
- écran d’ouverture proposant un fichier du PC, un espace vide ou la copie locale de secours ;
- bouton et état de sauvegarde toujours visibles, avec raccourci configurable ;
- paramètres inclus dans la sauvegarde : format, nom, thèmes, zoom, sons et raccourcis ;
- gestion globale des polices intégrées et personnalisées ;
- visionneuse filtrable de toutes les images, avec agrandissement ;
- mode focus pour l’écriture, fonds personnalisables et pieds de page ;
- caractères spéciaux, guillemets et raccourcis d’écriture personnalisables ;
- export d’un manuscrit en DOC, DOCX, ODT, PDF, HTML ou TXT ;
- fonctionnement hors ligne progressif grâce au service worker.

La copie IndexedDB sert uniquement à récupérer le travail sur le même appareil.
Une archive ZIP téléchargée reste la sauvegarde de référence.

## Lancer le projet

Prérequis : Node.js 22 ou plus récent.

```bash
npm ci
npm run dev
```

## Vérifier la version de production

```bash
npm run lint
npm run build
```

Le site statique est généré dans `dist/client`.

## Publier sur GitHub Pages

1. Créer un dépôt GitHub et y envoyer le contenu de ce dossier.
2. Ouvrir **Settings → Pages** dans le dépôt.
3. Choisir **GitHub Actions** comme source de publication.
4. Envoyer une modification sur la branche `main` ou démarrer manuellement le
   workflow **Publier sur GitHub Pages**.

Le workflow adapte automatiquement le chemin des fichiers, aussi bien pour un
dépôt classique (`utilisateur.github.io/enfer-fatal-studio/`) que pour un dépôt
racine (`utilisateur.github.io`).

## Contenu d’une sauvegarde

```text
enfer-fatal-studio.efs
├── manifest.json
├── studio.json
└── media/
    ├── images et tenues
    └── polices personnalisées
```

Le fichier `.efs` est une archive ZIP non compressée portant une extension propre
au Studio. Le format porte un numéro de version afin de permettre les migrations
futures. Les anciennes archives `.efstudio.zip` restent importables.
