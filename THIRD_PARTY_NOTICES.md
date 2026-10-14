# Composants tiers

## SuperDoc

L’espace d’écriture utilise **SuperDoc**, le moteur DOCX développé par les
contributeurs du projet SuperDoc.

- Source : <https://github.com/superdoc/docx-editor>
- Licence : GNU Affero General Public License, version 3 (`AGPL-3.0`)
- Paquets utilisés : `superdoc` et `@superdoc/react`

SuperDoc est exécuté localement dans le navigateur. Le Studio ne configure ni
service d’intelligence artificielle ni service de collaboration SuperDoc.

La distribution et la mise à disposition publique de cette version du Studio
relèvent de l’AGPL-3.0, dont le texte intégral figure dans `LICENSE`. Cela impose
notamment l’accès au code source correspondant de la version proposée aux
utilisateurs du site. Une distribution propriétaire nécessite une licence
commerciale distincte auprès de SuperDoc.

## nspell et dictionnaires Hunspell

La correction orthographique locale utilise **nspell** et les dictionnaires
du projet `wooorm/dictionaries`. Les fichiers `.aff` et `.dic` sont copiés dans
le site statique pendant la compilation et restent exécutés uniquement dans le
navigateur.

- nspell : licence MIT ;
- dictionnaire français : licence MPL-2.0 ;
- dictionnaire anglais : licences MIT et BSD ;
- dictionnaire espagnol : GPL-3.0, LGPL-3.0 ou MPL-1.1 ;
- dictionnaire allemand : GPL-2.0 ou GPL-3.0.

Les textes de licence correspondants sont publiés avec les dictionnaires dans
le dossier `proofing` du site généré.
