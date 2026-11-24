# Venir du fichier unique

L'API sert aussi un client minimal en un seul fichier TypeScript, sans dépendance :

```bash
curl -O https://api.pharmassistant.fr/clients/pharmassistant.ts
```

Le paquet le remplace sans rien réécrire : même classe, mêmes méthodes, mêmes options, mêmes champs de réponse.

## Passer au paquet

1. Supprimez `pharmassistant.ts` (ou le `.js` compilé) de votre projet.
2. `npm install pharmassistant`.
3. Remplacez `from "./pharmassistant"` par `from "pharmassistant"`. Ce code fonctionne à l'identique avec les deux :

```ts
import { PharmAssistant, PharmAssistantError } from "pharmassistant";

const client = new PharmAssistant("pa_votre_cle");
const reponse = await client.ask("Amoxicilline et allaitement ?", { store: true });
console.log(reponse.answer);

for await (const { event, data } of client.askStream("Et pendant la grossesse ?",
  { conversationId: reponse.conversation_id! })) {
  if (event === "chunk") process.stdout.write(data.text);
}

await client.conversations(10);
await client.conversation(reponse.conversation_id!);
await client.deleteConversation(reponse.conversation_id!);

try {
  await client.ask("…");
} catch (e) {
  if (e instanceof PharmAssistantError) console.log(e.status, e.code, e.message);
}
```

## Ce qui change

| | Fichier unique | Paquet |
|---|---|---|
| Installation | copier un fichier, le compiler pour JavaScript | `npm install`, ESM et CommonJS prêts |
| Mise à jour | retélécharger le fichier | `npm update pharmassistant` |
| Réponses | objets JSON | les mêmes, plus `iterCitations`, `allSources`, `correctedQuestion`, `rateLimit` |
| Erreurs | `PharmAssistantError` seule, `message` préfixé `[statut] code:` | sous-classes par cas ; `message` est celui de l'API, plus `aide` et `requestId` |
| Nouveaux essais | aucun | rafale, 5xx, connexion impossible ; `maxRetries: 0` pour l'ancien comportement |
| Délai | `timeoutMs` | `timeout`, en millisecondes aussi (`timeoutMs` reste accepté) ; en flux, délai d'inactivité |
| Flux | générateur `{ event, data }` | le même, plus `textStream`, `finalAnswer()`, `abort()` |
| Conversations suivies, précision, citations | à la main | [`startConversation`](conversations.md), [`correctedQuestion`](questions.md#demande-de-précision), [`iterCitations`](citations.md) |

Le fichier unique reste servi et maintenu pour qui ne peut rien installer.
