# Référence

Tout ce qui s'importe depuis `pharmassistant`. Les guides en donnent l'usage ; ici, chaque nom avec sa signature. La même information apparaît au survol dans votre éditeur.

## `PharmAssistant`

```text
new PharmAssistant(options?: ClientOptions)
new PharmAssistant(apiKey: string, options?: ClientOptions)
```

`ClientOptions` : `apiKey`, `baseUrl`, `timeout`, `maxRetries`, `defaultHeaders`, `fetch`, `logger`, `dangerouslyAllowBrowser`. Voir [Configuration](configuration.md).

| Membre | Rend |
|---|---|
| `ask(question, options?: AskOptions)` | `Promise<`[`Answer`](#answer)`>` |
| `askStream(question, options?: AskOptions)` | [`AnswerStream`](#answerstream) |
| `me(options?: { signal })` | `Promise<`[`KeyInfo`](#keyinfo)`>` |
| `health(options?: { signal })` | `Promise<Health>`, sans authentification |
| `conversations.list(limit = 50)` | `Promise<ConversationSummary[]>` |
| `conversations.retrieve(conversationId)` | `Promise<ConversationDetail>` |
| `conversations.delete(conversationId)` | `Promise<ConversationDeleted>` |
| `startConversation(options?: ConversationOptions)` | [`Conversation`](#conversation) |
| `resumeConversation(conversationId, defaults?)` | [`Conversation`](#conversation), gardée par le serveur |
| `withOptions(options)` | copie du client, même clé |
| `baseUrl`, `timeout`, `maxRetries` | réglages en vigueur |
| `conversations(limit)`, `conversation(id)`, `deleteConversation(id)` | appels hérités du [fichier unique](fichier-unique.md) |

`AskOptions` : `mode`, `citations`, `store`, `conversationId`, `history`, `suggestions`, `patientAdvice`, `associatedSale`, `signal`, `timeout`. Voir [Poser une question](questions.md#les-options).

## `Conversation`

| Membre | Rend |
|---|---|
| `ask(question, options?)` | `Promise<Answer>`, dans la suite de l'échange |
| `askStream(question, options?)` | `AnswerStream`, la conversation se met à jour à `done` |
| `id` | `conv_…` (gardée par le serveur), sinon `null` |
| `isStored` | `true` si gardée par le serveur |
| `history` | historique local (copie) |
| `lastAnswer` | dernière `Answer` |
| `delete()` | `Promise<void>` : efface côté serveur et repart à zéro |
| `reset()` | repart à zéro sans rien effacer |

`ConversationOptions` : les options d'`AskOptions` sauf `conversationId`, `history` et `signal`, plus `store` et `maxHistoryTurns`. Guide : [Conversations](conversations.md).

## `Answer`

Les champs du JSON (`AskResponse`) : `id`, `object`, `created_at`, `status`, `mode`, `question`, `title`, `answer`, `key_points`, `patient_advice`, `associated_sale`, `clarification`, `suggestions`, `tools_used`, `sources`, `citations`, `references`, `passages`, `conversation_id`, `usage`.

| Membre | Rend |
|---|---|
| `rateLimit` | `RateLimit \| null` (hors JSON) |
| `requestId` | `string` |
| `needsClarification` | `boolean` |
| `correctedQuestion(correction)` | `string` |
| `allSources()` | `SourceRef[]`, sans doublon |
| `reference(n)` | `Reference \| null` |
| `iterCitations()` | `Generator<Citation>` |
| `answerWithoutMarkers()` | `string \| null` |
| `new Answer(json, rateLimit?)` | relit une réponse sauvegardée |

Guides : [Lire la réponse](questions.md#lire-la-réponse), [Sources et citations](citations.md).

## Types de la réponse

| Type | Champs |
|---|---|
| `KeyPoint` | `polarity`, `text` |
| `SourceRef` | `title`, `url` |
| `Reference` | `n`, `tool`, `title`, `url`, `empty`, `query` |
| `Passage` | `index`, `n`, `quote`, `before`, `after`, `record`, `record_title` |
| `RecordLine` | `label`, `value`, `cited` |
| `Clarification` | `word`, `corrections`, `message` |
| `Usage` | `elapsed_ms`, `daily_requests_used`, `daily_requests_limit` |
| `Citation` | `rank`, `n`, `reference`, `passage`, `start`, `end` |
| `RateLimit` | `limit`, `remaining`, `resetAt` |
| `ConversationSummary` | `id`, `title`, `message_count`, `created_at`, `updated_at` |
| `ConversationDetail` | `id`, `object`, `title`, `created_at`, `updated_at`, `messages` |
| `ConversationMessage` | `role`, `content`, `created_at` |
| `ConversationDeleted` | `id`, `object`, `deleted` |
| `Health` | `status`, `service`, `version` |

## `KeyInfo`

Les champs du JSON (`KeyInfoResponse`) : `id`, `name`, `key_hint`, `pharmacy_slug`, `daily_limit`, `monthly_limit`, `daily_detailed_limit`, `limits_locked`, `scopes`, `active`, `expires_at`, `created_at`, `last_used_at`, `daily_requests_used`, `daily_detailed_used`, `month_requests_used` ; calculés : `dailyRemaining`, `monthlyRemaining` (`null` sans plafond) ; `hasScope(scope)`. Un plafond `null` veut dire illimité, `scopes` à `null` veut dire toutes les portées.

## `AnswerStream`

| Membre | Rend |
|---|---|
| `for await (const evt of flux)` | `StreamEvent`, une seule fois ; la requête part à la première lecture |
| `textStream` | `AsyncIterable<string>`, les seuls fragments de texte |
| `finalAnswer()` | `Promise<Answer>`, après avoir consommé le reste |
| `requestId` | après `start` |
| `references` | après `references` (`citations: "inline"`) |
| `answer` | après `done` |
| `rateLimit` | en-têtes de quota |
| `abort()` | arrête le flux et libère la connexion |

`StreamEvent` : union discriminée `{ event: "start" \| "status" \| "references" \| "chunk" \| "done", data }`. `EVENEMENTS` : la liste des événements du protocole. Guide : [Réponse en flux](flux.md).

## Erreurs

`PharmAssistantError` et ses sous-classes : `ConfigurationError`, `APIConnectionError`, `APITimeoutError`, `APIStatusError`, `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`, `ConversationNotFoundError`, `InvalidRequestError`, `RateLimitError`, `QuotaExceededError`, `ServerError`. Propriétés : `code`, `message`, `status`, `requestId`, `details`, `aide`, `headers` ; `RateLimitError.retryAfter`, `QuotaExceededError.resetAt`.

`CODES` : pour chaque code connu, `{ status, sens, aide, decompte }`.

Guide : [Erreurs, quotas et nouveaux essais](erreurs.md).

## Fonctions et constantes

| Nom | Rôle |
|---|---|
| `correctedQuestion(mot, question, correction)` | la règle de correction du chat, en fonction libre |
| `DEFAULT_BASE_URL` | `https://api.pharmassistant.fr` |
| `DEFAULT_TIMEOUT` | `300000` (ms) |
| `DEFAULT_MAX_RETRIES` | `2` |
| `MAX_HISTORY_TURNS` | `12` |
| `VERSION` | version du paquet |
