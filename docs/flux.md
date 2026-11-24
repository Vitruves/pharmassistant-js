# Réponse en flux

Une réponse prend quelques secondes, davantage en mode Détaillé. `askStream` rend le texte au fil de la rédaction, comme le chat de PharmAssistant. Il prend les mêmes options qu'[`ask`](questions.md#les-options).

## Le plus simple

```ts
const flux = client.askStream("Amoxicilline et allaitement ?");

for await (const texte of flux.textStream) process.stdout.write(texte);
const reponse = await flux.finalAnswer();

console.log("\n", reponse.patient_advice);
```

`askStream` rend aussitôt un `AnswerStream` ; la requête part à la première lecture. `finalAnswer()` rend la même [`Answer`](questions.md#lire-la-réponse) qu'`ask`. Les blocs « Au comptoir » (`patient_advice`) et vente associée (`associated_sale`), les points clés et les sources n'arrivent pas dans le texte du flux : ils sont dans cette réponse finale.

## Suivre chaque étape

Le flux est une suite d'événements `{ event, data }` :

| Événement | `data` | Raccourci |
|---|---|---|
| `start` | `id` (= identifiant de requête), `mode`, `question`, `conversation_id` | `flux.requestId` |
| `status` | `state` : `routing` (choix des bases), `tools_running` (consultation), `generating` (rédaction) | |
| `references` | `references` : registre numéroté, seulement en `citations: "inline"`, avant le premier mot | `flux.references` |
| `chunk` | `text` : fragment de la réponse | `flux.textStream` |
| `done` | la réponse complète (`Answer`) | `flux.answer` |

```ts
const etats = { routing: "Choix des sources", tools_running: "Consultation", generating: "Rédaction" };

const flux = client.askStream("Tramadol et sertraline ?", { citations: "inline" });
for await (const { event, data } of flux) {
  if (event === "status") console.log(`[${etats[data.state]}…]`);
  else if (event === "references") console.log(`${data.references.length} sources consultées`);
  else if (event === "chunk") process.stdout.write(data.text);
  else if (event === "done") console.log("\n", data.title);
}
```

Le type `StreamEvent` est une union discriminée : après `event === "chunk"`, TypeScript sait que `data.text` existe.

## Annuler

```ts
const flux = client.askStream("Amoxicilline et allaitement ?");
setTimeout(() => flux.abort(), 5_000);

try {
  for await (const texte of flux.textStream) process.stdout.write(texte);
} catch (erreur) {
  if ((erreur as Error).name !== "AbortError") throw erreur;
}
```

Un `signal` passé en option annule de la même façon. Sortir d'une boucle `for await` par `break` ferme aussi la connexion.

## Le délai en flux

En flux, `timeout` mesure l'inactivité, pas la durée totale : une longue réponse détaillée qui arrive mot après mot n'est jamais coupée, un serveur muet l'est. Voir [Configuration](configuration.md#délais).

## Les erreurs

- Un refus avant la rédaction (clé, portée, quota, conversation inconnue) est levé à la première lecture, avant tout événement : même exception qu'avec `ask`.
- Une erreur pendant la rédaction arrive comme un événement `error` : le client lève l'[exception typée](erreurs.md#les-exceptions) correspondante, avec l'identifiant de requête. La requête n'est pas décomptée.
- Un flux coupé avant `done` (réseau) lève `APIConnectionError` avec le code `stream_interrupted`. La requête a pu être décomptée.

```ts
import { PharmAssistantError } from "pharmassistant";

try {
  for await (const texte of client.askStream("Amoxicilline et allaitement ?").textStream) {
    process.stdout.write(texte);
  }
} catch (erreur) {
  if (erreur instanceof PharmAssistantError) console.error(`\n${erreur}`);
  else throw erreur;
}
```

Le client réessaie seul les refus de pré-vol qui ne coûtent rien (rafale, 5xx), jamais un flux commencé. Voir [Nouveaux essais](erreurs.md#nouveaux-essais-automatiques).

## Dans une conversation

```ts
const conv = client.startConversation();
await conv.askStream("Amoxicilline et allaitement ?").finalAnswer();
// la conversation est à jour dès l'événement done
await conv.ask("Et pendant la grossesse ?");
```

Pour relayer le flux vers un navigateur depuis votre serveur : la recette [Next.js](recettes.md#relayer-le-flux-avec-nextjs).
