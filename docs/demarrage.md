# Démarrage

## Installer

```bash
npm install pharmassistant
```

Aucune dépendance : le client s'appuie sur le `fetch` natif. Node.js 20 ou plus récent, Deno, Bun, Cloudflare Workers ; voir [Environnements](environnements.md). Les types TypeScript sont inclus, en ESM comme en CommonJS.

## Obtenir une clé

La clé (`pa_…`) se retire sur le portail dont le lien vous est envoyé par email, après acceptation des [conditions d'utilisation de l'API](https://pharmassistant.fr/developpeurs). Pour en obtenir une : [contact@pharmassistant.fr](mailto:contact@pharmassistant.fr).

Elle n'est montrée qu'une fois. Une clé perdue se régénère depuis le portail, ce qui invalide aussitôt l'ancienne.

## Poser la clé

Le client la lit dans la variable d'environnement `PHARMASSISTANT_API_KEY` :

```bash
export PHARMASSISTANT_API_KEY=pa_votre_cle
```

Vous pouvez aussi la passer au constructeur, lue depuis votre propre configuration :

```ts
import { PharmAssistant } from "pharmassistant";

const client = new PharmAssistant({ apiKey: process.env.MA_CLE_PHARMASSISTANT });
```

Jamais dans le code versionné, jamais dans un navigateur ni une application mobile : la clé donne accès au quota de votre intégration. Une clé absente ou mal formée lève [`ConfigurationError`](erreurs.md#les-exceptions) dès la création du client, avant tout appel réseau.

## Première question

```ts
import { PharmAssistant } from "pharmassistant";

const client = new PharmAssistant();

const reponse = await client.ask("Amoxicilline et allaitement ?");

console.log(reponse.title);
console.log(reponse.answer);              // markdown, prêt à afficher
console.log(reponse.patient_advice);      // discours à tenir au patient
for (const point of reponse.key_points) {
  console.log(point.polarity === "positive" ? "✔" : "✘", point.text);
}
for (const source of reponse.allSources()) {
  console.log(source.title, source.url);
}
```

En CommonJS : `const { PharmAssistant } = require("pharmassistant");`. Tous les champs de la réponse sont décrits dans [Poser une question](questions.md#lire-la-réponse).

## Vérifier sa clé

```ts
const etat = await client.me();
console.log(etat.name, `${etat.daily_requests_used} / ${etat.daily_limit ?? "illimité"}`);
console.log("Reste aujourd'hui :", etat.dailyRemaining);
```

## Un seul client

Le client ne garde aucun état entre deux questions : créez-en un pour toute l'application et partagez-le.

## Et ensuite

- Afficher la réponse au fil de l'eau : [Réponse en flux](flux.md).
- Enchaîner les questions : [Conversations](conversations.md).
- Gérer proprement les plafonds et les pannes : [Erreurs, quotas et nouveaux essais](erreurs.md).
- Intégrer dans Express, Next.js ou un Worker : [Recettes](recettes.md).
