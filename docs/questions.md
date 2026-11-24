# Poser une question

`client.ask(question, options)` envoie une question et rend une [`Answer`](#lire-la-réponse) complète. Pour recevoir le texte au fil de la rédaction, voir [Réponse en flux](flux.md) : `askStream` prend exactement les mêmes options.

## Les options

```ts
const reponse = await client.ask("Tramadol et sertraline ?", {
  mode: "detailed",
  citations: "inline",
  patientAdvice: false,
  associatedSale: false,
  suggestions: false,
  timeout: 600_000,
});
```

| Option | Défaut | Effet |
|---|---|---|
| `mode` | `"standard"` | `"detailed"` : analyse exhaustive, entité par entité, plus lente ; exige la portée `ask:detailed` sur la clé et compte sur un éventuel sous-plafond Détaillé |
| `citations` | `"list"` | `"inline"` : repères `[S1]` dans le texte, registre et extraits ; voir [Sources et citations](citations.md) |
| `store` | `false` | `true` : la conversation est gardée par le serveur, la réponse porte `conversation_id` ; voir [Conversations](conversations.md) |
| `conversationId` | | poursuit une conversation gardée (`conv_…`) |
| `history` | | historique porté par vous ; exclusif de `store` et de `conversationId` |
| `suggestions` | `true` | `false` : sans pistes d'approfondissement |
| `patientAdvice` | `true` | `false` : sans discours patient, le champ reste `null` |
| `associatedSale` | `true` | `false` : sans conseil de vente associée, le champ reste `null` |
| `signal` | | `AbortSignal` pour annuler ; voir [Configuration](configuration.md#annuler) |
| `timeout` | celui du client | délai pour cet appel, en millisecondes |

La question elle-même fait 4 000 signes au plus. Les options sont vérifiées avant tout envoi : une valeur impossible (mode inconnu, `history` mêlé à `store`, option inconnue, question vide) lève `TypeError` sans rien consommer. Seules les options qui diffèrent du défaut partent dans la requête.

`history` accepte des objets ou des couples :

```ts
const reponse = await client.ask("Et chez l'enfant ?", {
  history: [
    ["user", "Posologie du paracétamol ?"],
    ["assistant", "Chez l'adulte, …"],
  ],
});
```

Le plus souvent, [`startConversation`](conversations.md) tient cet historique à votre place.

## Lire la réponse

Une `Answer` porte les champs du JSON de l'API, tels quels et typés ; `JSON.stringify(reponse)` rend le JSON d'origine.

| Champ | Type | Contenu |
|---|---|---|
| `answer` | `string \| null` | réponse en markdown, sans marqueur interne ; `null` sur une demande de précision |
| `title` | `string \| null` | titre court de l'échange |
| `key_points` | `KeyPoint[]` | puces à polarité : `polarity` (`positive` = recommandé, `negative` = à éviter), `text` |
| `patient_advice` | `string \| null` | discours prêt à tenir au patient (« Au comptoir ») |
| `associated_sale` | `string \| null` | conseil de vente associée |
| `suggestions` | `string[]` | pistes d'approfondissement, à reposer telles quelles |
| `sources` | `Record<string, SourceRef[]>` | références par base interrogée |
| `tools_used` | `string[]` | bases interrogées |
| `citations` | `"list" \| "inline"` | modèle de citation suivi |
| `references`, `passages` | tableaux | registre et extraits, en `citations: "inline"` |
| `status` | `"ok" \| "clarification_needed"` | voir plus bas |
| `clarification` | `Clarification \| null` | mot ambigu et corrections proposées |
| `conversation_id` | `string \| null` | id `conv_…` d'une conversation gardée |
| `mode`, `question`, `created_at` | `string` | rappel de la requête, horodatage ISO 8601 heure de Paris |
| `usage` | `Usage` | `elapsed_ms`, `daily_requests_used`, `daily_requests_limit` |
| `id` | `string` | identifiant de requête `req_…`, à joindre à toute demande de support |

Et, hors du JSON :

| Membre | Rend |
|---|---|
| `rateLimit` | en-têtes de quota : `limit`, `remaining`, `resetAt` (ou `null` pour une clé sans plafond) |
| `requestId` | l'`id`, sous un nom explicite |
| `needsClarification` | `true` sur une demande de précision |
| `correctedQuestion(correction)` | la question reformulée, voir plus bas |
| `allSources()` | toutes les références à plat, sans doublon |
| `iterCitations()`, `reference(n)`, `answerWithoutMarkers()` | voir [Sources et citations](citations.md) |

## Les puces à polarité

Dans `answer`, les puces sont déjà réécrites en `✔` et `✘` lisibles. `key_points` en donne la version structurée, pour un affichage maison :

```ts
for (const point of reponse.key_points) {
  const couleur = point.polarity === "positive" ? "vert" : "rouge";
  console.log(`[${couleur}] ${point.text}`);
}
```

## Demande de précision

Quand un mot de la question est ambigu, l'API ne répond pas au fond : `status` vaut `clarification_needed`, `answer` vaut `null`, et `clarification` propose des corrections.

```ts
let reponse = await client.ask("Collyre pour l'oeille ?");

if (reponse.needsClarification && reponse.clarification) {
  console.log(reponse.clarification.message);        // à montrer à l'utilisateur
  console.log(reponse.clarification.corrections);    // ["œil", "oreille"]
  const choix = reponse.clarification.corrections[0]!;
  reponse = await client.ask(reponse.correctedQuestion(choix));
}
```

`correctedQuestion` remplace le mot ambigu comme le fait le chat de PharmAssistant : première occurrence sans égard à la casse, sinon mot à mot sans égard aux accents, sinon correction ajoutée entre parenthèses. La même règle existe en fonction libre : `correctedQuestion(mot, question, correction)`.

## Les pistes d'approfondissement

Chaque piste est une question complète, prête à être reposée :

```ts
const suite = await client.ask(reponse.suggestions[0]!);
```

## Sauvegarder une réponse

```ts
import { Answer } from "pharmassistant";
import { readFile, writeFile } from "node:fs/promises";

await writeFile("reponse.json", JSON.stringify(reponse, null, 2));
const relue = new Answer(JSON.parse(await readFile("reponse.json", "utf8")));
console.log(relue.title);
```
