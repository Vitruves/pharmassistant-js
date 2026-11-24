<p align="center">
  <a href="https://pharmassistant.fr">
    <img src="https://raw.githubusercontent.com/Vitruves/pharmassistant-js/main/.github/images/monogramme.png" alt="PharmAssistant" width="96">
  </a>
</p>

<h1 align="center">pharmassistant</h1>

<p align="center">
  Client JavaScript et TypeScript officiel de l'API <a href="https://pharmassistant.fr">PharmAssistant</a>, l'assistant pharmaceutique de l'officine.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pharmassistant"><img src="https://img.shields.io/npm/v/pharmassistant?color=17693F" alt="Version sur npm"></a>
  <a href="https://github.com/Vitruves/pharmassistant-js/actions/workflows/ci.yml"><img src="https://github.com/Vitruves/pharmassistant-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/dépendances-0-17693F" alt="Aucune dépendance">
  <img src="https://img.shields.io/badge/types-inclus-17693F" alt="Types inclus">
  <a href="https://github.com/Vitruves/pharmassistant-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/licence-MIT-17693F" alt="Licence MIT"></a>
</p>

<p align="center">
  <a href="https://github.com/Vitruves/pharmassistant-js/blob/main/docs/README.md">Documentation</a> ·
  <a href="https://github.com/Vitruves/pharmassistant-js/blob/main/docs/reference.md">Référence</a> ·
  <a href="https://github.com/Vitruves/pharmassistant-js/blob/main/docs/recettes.md">Recettes</a> ·
  <a href="https://api.pharmassistant.fr/docs">API HTTP</a>
</p>

---

PharmAssistant répond aux questions du comptoir à partir des bases documentaires de référence, et cite ses sources. Ce paquet en fait quelques lignes de code : réponses typées, flux, conversations, citations dans le texte, erreurs qui disent quoi faire.

```bash
npm install pharmassistant
```

```ts
import { PharmAssistant } from "pharmassistant";

const client = new PharmAssistant();                 // clé lue dans PHARMASSISTANT_API_KEY

const reponse = await client.ask("Amoxicilline et allaitement ?");

console.log(reponse.answer);                         // markdown, prêt à afficher
console.log(reponse.patient_advice);                 // discours à tenir au patient
for (const source of reponse.allSources()) console.log("·", source.title, source.url);
```

Aucune dépendance. Node.js 20+, Deno, Bun, Cloudflare Workers ; ESM et CommonJS, types inclus. Côté serveur seulement : la clé ne doit jamais atteindre un navigateur. La clé se demande à [contact@pharmassistant.fr](mailto:contact@pharmassistant.fr) : voir [Démarrage](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/demarrage.md).

## En un coup d'œil

### Des réponses typées

Chaque réponse porte les champs du JSON de l'API, typés pour l'éditeur : titre, réponse markdown, points clés à polarité, discours patient, vente associée, pistes, sources, quota.

```ts
for (const point of reponse.key_points) console.log(point.polarity === "positive" ? "✔" : "✘", point.text);
console.log(reponse.rateLimit?.remaining, "questions restantes aujourd'hui");
```

→ [Poser une question](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/questions.md)

### Des sources citées phrase par phrase

```ts
const reponse = await client.ask("Ibuprofène et grossesse ?", { citations: "inline" });

for (const c of reponse.iterCitations()) {                 // [S1], [S2]… dans l'ordre du texte
  console.log(c.n, c.reference?.title, "→", c.passage?.quote ?? "");
}
```

Chaque repère renvoie à sa source et à l'extrait qui porte la phrase. Sans source, l'API le dit au lieu de répondre de mémoire.

→ [Sources et citations](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/citations.md)

### La réponse au fil de la rédaction

```ts
const flux = client.askStream("Tramadol et sertraline ?");
for await (const texte of flux.textStream) process.stdout.write(texte);
const reponse = await flux.finalAnswer();
```

Annulable (`flux.abort()`, `AbortSignal`), avec un délai d'inactivité plutôt qu'une durée totale : une longue réponse n'est jamais coupée en pleine rédaction.

→ [Réponse en flux](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/flux.md)

### Des échanges suivis

```ts
const conv = client.startConversation();
await conv.ask("Amoxicilline et allaitement ?");
await conv.ask("Et pendant la grossesse ?");             // tient compte de la question précédente
```

Historique chez vous, ou gardé par le serveur et repris plus tard (`store: true`).

→ [Conversations](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/conversations.md)

### Des erreurs qui disent quoi faire

```ts
import { PharmAssistantError, QuotaExceededError } from "pharmassistant";

try {
  await client.ask("Amoxicilline et allaitement ?");
} catch (erreur) {
  if (erreur instanceof QuotaExceededError) console.log(erreur.aide);   // « Attendez minuit (heure de Paris)… »
  else if (erreur instanceof PharmAssistantError) console.log(erreur.code, erreur.requestId);
  else throw erreur;
}
```

Rafales, pannes passagères et connexions impossibles sont réessayées seules, jamais ce qui a pu être décompté.

→ [Erreurs, quotas et nouveaux essais](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/erreurs.md)

### Partout côté serveur

Express, Next.js, Cloudflare Workers, traitement par lots, rendu HTML des citations, tests sans réseau : chaque cas a sa recette complète.

→ [Recettes](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/recettes.md) · [Environnements](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/environnements.md)

## Documentation

| Guide | Pour |
|---|---|
| [Démarrage](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/demarrage.md) | installer, poser la clé, première question |
| [Poser une question](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/questions.md) | options, champs de la réponse, demande de précision |
| [Sources et citations](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/citations.md) | références par base, repères `[S1]`, extraits |
| [Réponse en flux](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/flux.md) | texte au fil de l'eau, étapes, annulation |
| [Conversations](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/conversations.md) | historique local ou gardé par le serveur |
| [Erreurs, quotas et nouveaux essais](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/erreurs.md) | chaque exception et chaque code |
| [Configuration](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/configuration.md) | délais, annulation, journal, `fetch` fourni |
| [Environnements](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/environnements.md) | Node.js, Deno, Bun, Workers, Next.js |
| [Recettes](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/recettes.md) | Express, Next.js, Workers, lots, HTML, tests |
| [Référence](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/reference.md) | chaque classe, méthode et type |
| [Venir du fichier unique](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/fichier-unique.md) | passer du `curl -O` au paquet |

Le même client existe en Python : [pharmassistant-python](https://github.com/Vitruves/pharmassistant-python).

## Données patient

Les conditions d'utilisation de l'API interdisent d'y envoyer toute donnée identifiant un patient. Posez la question sur la situation clinique, jamais sur la personne : voir [Données patient](https://github.com/Vitruves/pharmassistant-js/blob/main/docs/confidentialite.md).

## Licence

MIT, voir [LICENSE](https://github.com/Vitruves/pharmassistant-js/blob/main/LICENSE). L'usage du service relève des [conditions d'utilisation de l'API](https://pharmassistant.fr/developpeurs).
