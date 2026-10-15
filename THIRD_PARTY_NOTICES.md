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

## Typo.js et dictionnaire Hunspell français

La correction orthographique locale utilise **Typo.js**, conformément au modèle
de fournisseur `proofing` documenté par SuperDoc, et le dictionnaire français
du projet `wooorm/dictionaries`. Les fichiers `.aff` et `.dic` sont copiés dans
le site statique pendant la compilation et restent exécutés uniquement dans le navigateur.

- Typo.js : licence BSD-3-Clause ;
- dictionnaire français : licence MPL-2.0.

Les textes de licence correspondants sont publiés avec les dictionnaires dans
le dossier `proofing` du site généré.
