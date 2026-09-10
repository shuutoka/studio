# Enfer Fatal Studio

Prototype d’un studio d’écriture local-first conçu pour GitHub Pages. Les projets
sont conservés dans le navigateur et peuvent être sauvegardés dans une archive
globale `.efs` ou `.zip`.

## Fonctions disponibles

- accueil multi-projets avec progression et statistiques ;
- types de projet : manga/BD, roman, script et écriture libre, avec surcharge par page ;
- volumes et chapitres structurés dans de véritables documents DOCX ;
- pagination, sections, marges, en-têtes, pieds de page, tableaux et images gérés par SuperDoc ;
- éditeur DOCX natif : styles de titres, polices, tailles, mise en forme, couleurs, listes, recherche et règle ;
- ajout de polices personnalisées TTF, OTF, WOFF et WOFF2 ;
- fiches de personnages avancées avec recherche, tags, images réordonnables, portrait principal, tenues et relations ;
- images importées optimisées en WebP, carrousel et visionneuse en grille, liste, image ou texte ;
- arbres narratifs sur canevas quadrillé avec huit points d’ancrage par boîte ;
- diagrammes de relations dont les bulles grandissent selon le nombre de liens et se connectent en deux clics ;
- gestion des tableaux : dossiers, ordre, duplication, apparence, bannière et historique restaurable ;
- bibliothèque générale des personnages de tous les projets ;
- objectifs en colonnes « À faire / En cours / Terminé » ;
- carnet de notes ;
- suppression confirmée des projets, personnages, pages, notes et objectifs ;
- copie de récupération automatique dans IndexedDB ;
- état `Enregistré` / `Non enregistré` ;
- avertissement du navigateur avant de quitter avec des changements non sauvegardés ;
- sauvegarde globale de tous les projets dans un fichier `.efs` non compressé ou `.zip` ;
- sauvegarde et chargement `.efs` sur Google Drive avec accès limité aux fichiers du Studio ;
- écran d’ouverture proposant un fichier du PC, un espace vide ou la copie locale de secours ;
- bouton et état de sauvegarde toujours visibles, avec raccourci configurable ;
- paramètres inclus dans la sauvegarde : format, nom, thèmes, zoom, sons et raccourcis ;
- gestion globale des polices intégrées et personnalisées ;
- cartes projet personnalisables par couleur et bannière ;
- mode focus pour l’écriture et navigation par styles de titres ;
- enregistrement automatique du DOCX dans IndexedDB ;
- export fidèle en DOCX, impression/PDF depuis le volume ouvert et export TXT ;
- import DOCX sans conversion HTML ; import ODT, TXT ou HTML converti en DOCX ;
- informations légales accessibles en permanence, politique de confidentialité et consentement du formulaire de feedback ;
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

## Licence

L’espace d’écriture utilise `superdoc` et `@superdoc/react`, distribués sous
licence **GNU AGPL version 3**. En conséquence, cette version du Studio est
distribuée sous la même licence AGPL-3.0. Le dépôt public et le code source
correspondant à la version proposée sur le site doivent rester accessibles.
Consultez `LICENSE` et `THIRD_PARTY_NOTICES.md` ; une utilisation propriétaire
du moteur nécessite une licence commerciale distincte auprès de SuperDoc.

## Publier sur GitHub Pages

1. Créer un dépôt GitHub et y envoyer le contenu de ce dossier.
2. Ouvrir **Settings → Pages** dans le dépôt.
3. Choisir **GitHub Actions** comme source de publication.
4. Envoyer une modification sur la branche `main` ou démarrer manuellement le
   workflow **Publier sur GitHub Pages**.

Le workflow adapte automatiquement le chemin des fichiers, aussi bien pour un
dépôt classique (`utilisateur.github.io/enfer-fatal-studio/`) que pour un dépôt
racine (`utilisateur.github.io`).

## Informations légales

Les mentions affichées par l’application sont centralisées dans
`lib/legal.ts`. La configuration fournie correspond à une publication gratuite
et non professionnelle sous le pseudonyme **Shuutoka**, hébergée par GitHub
Pages avec un nom de domaine enregistré chez OVH. Une version directement
consultable est générée à l’adresse `/legal/`.

Avant publication, adaptez ce fichier si le statut de l’éditeur change. En cas
d’utilisation professionnelle ou commerciale, il faudra notamment remplacer le
pseudonyme par l’identité légale complète et ajouter les informations
d’immatriculation, de contact et de TVA applicables.

## Contenu d’une sauvegarde

```text
enfer-fatal-studio.efs
├── manifest.json
├── studio.json
└── media/
    ├── images, tenues et médias des tableaux
    ├── polices personnalisées
    └── documents DOCX natifs des volumes
```

Le fichier `.efs` est une archive ZIP non compressée portant une extension propre
au Studio. Le format porte un numéro de version afin de permettre les migrations
futures. La version 7 ajoute les DOCX natifs des volumes. Les anciennes archives
`.efstudio.zip` et les sauvegardes EFS antérieures restent importables ; les
anciens manuscrits HTML sont convertis à leur première ouverture.
