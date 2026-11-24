# Publier une version

## Source

Ce dépôt est l'unique source du paquet npm `pharmassistant`. Le fichier servi par l'API (`/clients/pharmassistant.ts`) est un autre client, minimal, qui vit dans le dépôt de l'API et ne passe pas par ici.

La version vit dans `package.json` ; `src/version.ts` la recopie pour l'en-tête `User-Agent`. Un test exige que les deux soient égales et que `CHANGELOG.md` ait sa section, et le workflow de publication refuse un tag qui diffère.

## Vérifier en local

```bash
npm ci
npm run verifier          # types, tests, construction, publint, attw
npm run contrat           # réseau : le paquet face au schéma OpenAPI de l'API en service
node test/fumee.mjs && node test/fumee.cjs
```

`npm run contrat` tourne aussi chaque lundi en CI (`contrat.yml`) : rouge veut dire que l'API a évolué et que le paquet doit suivre.

## Mise en place (une seule fois)

npm n'accepte de déclarer un éditeur autorisé que pour un paquet qui existe déjà : la toute première version part donc de votre poste.

1. `npm login`, puis depuis ce dépôt, sur le tag `v1.0.0` : `npm publish --access public`. Le script `prepublishOnly` relance toutes les vérifications avant l'envoi.
2. Sur npmjs.com, page du paquet, Settings, « Trusted Publisher », GitHub Actions : owner `Vitruves`, repository `pharmassistant-js`, workflow `publish.yml`, environment `npm`. La déclaration expire si aucune publication ne l'utilise sous deux jours : faites-la quand la version suivante est prête à partir.
3. Toujours dans Settings, « Publishing access » : « Require two-factor authentication and disallow tokens ». Plus aucun jeton ne peut publier, seul le workflow le peut.
4. GitHub, Settings, Environments : créer `npm` (règle conseillée : « Required reviewers » = vous).

## Chaque version suivante

1. Changer le paquet, monter `version` dans `package.json` et `src/version.ts` (semver : correctif, ajout compatible, rupture), ajouter sa section au `CHANGELOG.md`, `npm run verifier`.
2. Une option nouvelle n'est publiée qu'une fois servie par l'API en production : le paquet ne doit jamais annoncer un champ que le serveur ignore.
3. Commiter, pousser : la CI vérifie types, tests et construction sous Node 20, 22 et 24, Bun et Deno.
4. Release GitHub avec le tag `vX.Y.Z` (égal à la version) : le workflow reteste, vérifie le tag et publie sur npm, avec l'attestation de provenance.

Une version publiée sur npm ne se remplace jamais : une erreur se corrige par la version suivante.
