# Conversations

Par défaut, chaque question est indépendante. Pour qu'une question tienne compte des précédentes (« Et pendant la grossesse ? »), il faut une conversation. Deux façons de la tenir :

| | Historique chez vous | Gardée par le serveur |
|---|---|---|
| Ouverture | `client.startConversation()` | `client.startConversation({ store: true })` |
| Ce qui part à chaque tour | la question et l'historique récent | la question et l'id `conv_…` |
| Conservation chez PharmAssistant | rien | jusqu'à 90 jours après la dernière activité |
| Reprise plus tard, ailleurs | à vous de garder l'historique | `client.resumeConversation(id)` |
| Relecture et suppression par l'API | non | `client.conversations` |

## Historique chez vous

```ts
const conv = client.startConversation();

await conv.ask("Amoxicilline et allaitement ?");
const reponse = await conv.ask("Et pendant la grossesse ?");

console.log(conv.history);       // [{ role: "user", content: … }, …]
```

L'historique garde les 12 derniers échanges, comme le serveur (`maxHistoryTurns` pour un autre nombre). Les repères `[S1]` en sont retirés, et une demande de précision y figure pour que la question corrigée la suive. `conv.reset()` repart de zéro.

Pour garder l'historique d'une session à l'autre, sauvegardez `conv.history` et repassez-le en `history` :

```ts
const historique = conv.history;
const suite = await client.ask("Et chez l'enfant ?", { history: historique });
```

## Gardée par le serveur

```ts
const conv = client.startConversation({ store: true });
await conv.ask("Amoxicilline et allaitement ?");
const identifiant = conv.id;                 // conv_…, à conserver

// plus tard, dans un autre processus
const suite = client.resumeConversation(identifiant!);
await suite.ask("Et chez le nourrisson de moins d'un mois ?");
```

`conv.id` vaut `null` jusqu'à la première réponse. Une conversation inconnue (supprimée, purgée après 90 jours d'inactivité, ou appartenant à une autre clé) lève [`ConversationNotFoundError`](erreurs.md#les-exceptions), sans décompte.

## Options par défaut

Les options passées à l'ouverture s'appliquent à chaque tour ; celles d'un tour les complètent :

```ts
const conv = client.startConversation({ mode: "detailed", citations: "inline", associatedSale: false });
await conv.ask("Tramadol et sertraline ?");
await conv.ask("Et avec le millepertuis ?", { mode: "standard" });
```

`store`, `history` et `conversationId` sont gérés par la conversation : les passer à un tour lève `TypeError`.

## Gérer les conversations gardées

```ts
for (const c of await client.conversations.list(20)) {      // la plus récemment active d'abord
  console.log(c.id, c.updated_at, c.message_count, c.title);
}

const detail = await client.conversations.retrieve("conv_…");
for (const message of detail.messages) console.log(message.role, ":", message.content.slice(0, 80));

await client.conversations.delete("conv_…");                  // immédiat et définitif
```

Depuis une conversation ouverte : `await conv.delete()` l'efface côté serveur et repart à zéro.

## Sans l'objet conversation

Les mêmes mécanismes existent directement sur `ask` :

```ts
const ouverture = await client.ask("Amoxicilline et allaitement ?", { store: true });
const suite = await client.ask("Et pendant la grossesse ?", { conversationId: ouverture.conversation_id! });
```

## En flux

`conv.askStream(…)` met la conversation à jour dès l'événement `done`. Voir [Réponse en flux](flux.md#dans-une-conversation).
