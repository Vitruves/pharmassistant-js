# Journal des versions

## 1.0.0

Première version publiée sur npm.

- Client `PharmAssistant` : `ask`, `askStream`, `me`, `health`, `conversations.list / retrieve / delete`, `withOptions`.
- Réponses typées (`Answer`, `KeyInfo`) : les champs du JSON de l'API, plus `iterCitations`, `answerWithoutMarkers`, `allSources`, `correctedQuestion`, `rateLimit`.
- Réponse en flux (`AnswerStream`) : `textStream`, `finalAnswer()`, `abort()`, événements `{ event, data }` typés ; délai d'inactivité plutôt que durée totale.
- Conversations suivies (`startConversation`, `resumeConversation`), historique chez le client ou gardé par le serveur.
- Erreurs typées, chacune avec son `aide` et son `requestId` ; nouveaux essais automatiques sur connexion impossible, rafale et 5xx, jamais sur ce qui a pu être décompté.
- Aucune dépendance ; Node.js 20+, Deno, Bun, Cloudflare Workers ; ESM et CommonJS, types inclus ; refus explicite dans un navigateur.
- Compatible avec le code écrit pour le fichier unique servi par l'API.
