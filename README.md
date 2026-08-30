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
- sauvegarde ZIP avec `Ctrl+S` et import d’une archive existante ;
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
Mon-Projet.efstudio.zip
├── manifest.json
├── project.json
└── media/
    ├── images et tenues
    └── polices personnalisées
```

Le format porte un numéro de version afin de pouvoir ajouter des migrations lors
des futures évolutions du Studio.
