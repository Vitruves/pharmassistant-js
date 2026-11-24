# Erreurs, quotas et nouveaux essais

## Les exceptions

Toutes les erreurs du client héritent de `PharmAssistantError`, elle-même un `Error` :

```
PharmAssistantError
├── ConfigurationError          clé absente ou mal formée, URL invalide, navigateur
├── APIConnectionError          réseau, réponse illisible, flux coupé
│   └── APITimeoutError         délai dépassé
└── APIStatusError              l'API a refusé ou échoué
    ├── AuthenticationError     401
    ├── PermissionDeniedError   403
    ├── NotFoundError           404
    │   └── ConversationNotFoundError
    ├── InvalidRequestError     422
    ├── RateLimitError          429 anti-rafale
    ├── QuotaExceededError      429 plafond atteint
    └── ServerError             5xx
```

Deux cas restent hors de cette famille : une option invalide lève `TypeError` avant tout envoi, et une annulation par l'appelant rejette l'`AbortError` standard.

Chaque erreur porte :

| Propriété | Contenu |
|---|---|
| `code` | code machine stable, voir le tableau plus bas |
| `message` | explication en français, celle de l'API |
| `status` | statut HTTP, `null` pour une erreur côté client |
| `requestId` | identifiant `req_…`, à joindre à toute demande de support |
| `details` | sur `InvalidRequestError` : le motif champ par champ |
| `aide` | ce qu'il faut faire, en une phrase |
| `headers` | en-têtes de la réponse HTTP |

Et, selon la classe : `RateLimitError.retryAfter` (secondes avant de réessayer) et `QuotaExceededError.resetAt` (prochaine remise à zéro du compteur journalier, ou `null` pour une clé sans plafond journalier). Le plafond mensuel revient le 1er du mois : distinguez-le par `code`.

`String(erreur)` assemble tout cela, prêt pour un journal :

```
QuotaExceededError [429] daily_limit_reached: Plafond journalier de la clé atteint (100 requêtes). …
Aide : Attendez minuit (heure de Paris), ou relevez le plafond depuis le portail s'il n'est pas verrouillé. Requête non décomptée.
Requête : req_9f2c4a1b6d8e3f07
```

## Attraper ce qui compte

```ts
import {
  APIConnectionError, AuthenticationError, PharmAssistantError, QuotaExceededError,
} from "pharmassistant";

try {
  const reponse = await client.ask("Amoxicilline et allaitement ?");
} catch (erreur) {
  if (erreur instanceof QuotaExceededError) {
    afficher(erreur.code === "monthly_limit_reached"
      ? "Plafond du mois atteint, retour le 1er." : "Plafond du jour atteint, retour à minuit.");
  } else if (erreur instanceof AuthenticationError) {
    alerterLAdministrateur("Clé PharmAssistant invalide ou révoquée");
  } else if (erreur instanceof APIConnectionError) {
    afficher("PharmAssistant est injoignable, réessayez dans un instant.");
  } else if (erreur instanceof PharmAssistantError) {
    console.error(String(erreur));
  } else {
    throw erreur;
  }
}
```

## Les codes

| Code | HTTP | Classe | Sens | Décompté |
|---|---|---|---|---|
| `missing_api_key` | 401 | `AuthenticationError` | aucune clé envoyée | non |
| `invalid_api_key` | 401 | `AuthenticationError` | clé inconnue ou mal formée | non |
| `revoked_api_key` | 401 | `AuthenticationError` | clé révoquée | non |
| `expired_api_key` | 401 | `AuthenticationError` | clé périmée | non |
| `pharmacy_not_found` | 403 | `PermissionDeniedError` | pharmacie liée introuvable | non |
| `pharmacy_suspended` | 403 | `PermissionDeniedError` | pharmacie liée suspendue | non |
| `scope_denied` | 403 | `PermissionDeniedError` | portée manquante (`ask:detailed` pour le mode Détaillé) | non |
| `conversation_not_found` | 404 | `ConversationNotFoundError` | conversation inconnue, supprimée ou purgée | non |
| `not_found` | 404 | `NotFoundError` | adresse inconnue de l'API | non |
| `invalid_request` | 422 | `InvalidRequestError` | requête refusée, motif dans `details` | non |
| `rate_limited` | 429 | `RateLimitError` | anti-rafale, réessayé seul | non |
| `daily_limit_reached` | 429 | `QuotaExceededError` | plafond journalier | non |
| `monthly_limit_reached` | 429 | `QuotaExceededError` | plafond mensuel | non |
| `detailed_limit_reached` | 429 | `QuotaExceededError` | sous-plafond du mode Détaillé | non |
| `internal_error` | 500 | `ServerError` | erreur interne, réessayée seule | non |
| `generation_failed` | 502 | `ServerError` | rédaction en échec, réessayée seule | non |
| `empty_response` | 502 | `ServerError` | réponse vide, réessayée seule | non |
| `connection_error` | | `APIConnectionError` | serveur injoignable | non |
| `timeout` | | `APITimeoutError` | délai dépassé | peut-être |
| `stream_interrupted` | | `APIConnectionError` | flux coupé avant la fin | peut-être |

Le détail de chaque code, avec sa conduite à tenir, est exporté : `CODES["scope_denied"].aide`. Un code inconnu de cette version du paquet est classé par son statut HTTP.

## Ce qui est décompté

La facturation compte des requêtes, pas des jetons. Une requête refusée ou en échec côté serveur (401, 403, 404, 422, 429, 500, 502, événement `error` du flux) n'est jamais décomptée. Seul cas douteux : une réponse perdue en route (délai dépassé, flux coupé), que le serveur a pu achever.

## Nouveaux essais automatiques

Le client réessaie seul, `maxRetries` fois (2 par défaut), quand rien ne peut avoir été décompté :

| Situation | Attente |
|---|---|
| connexion impossible (réseau, DNS) | croissante : 0,5 s, 1 s, 2 s… plafonnée à 8 s, avec un peu d'aléa |
| `rate_limited` | l'en-tête `Retry-After`, 60 s au plus |
| 500, 502, 503, 504 | croissante |
| connexion coupée sur une lecture (`me`, `conversations.list`…) | croissante |

Jamais réessayé seul : un plafond atteint, un refus 4xx, une question dont la réponse a été coupée (elle a pu être décomptée), un délai dépassé, un flux commencé.

```ts
const prudent = new PharmAssistant({ maxRetries: 0 });          // aucun nouvel essai
await client.withOptions({ maxRetries: 5 }).ask("…");           // pour un appel
```

La connexion impossible est reconnue sous Node.js et Bun ; ailleurs, une erreur réseau n'est pas réessayée, par prudence. Chaque nouvel essai est signalé au [journal](configuration.md#journal).

## Suivre son quota

```ts
const reponse = await client.ask("Amoxicilline et allaitement ?");
if (reponse.rateLimit) console.log(`${reponse.rateLimit.remaining} sur ${reponse.rateLimit.limit}`);

const etat = await client.me();
console.log(etat.dailyRemaining, etat.monthlyRemaining);
console.log(`${etat.daily_detailed_used} / ${etat.daily_detailed_limit ?? "sans sous-plafond"}`);
```

Le plafond journalier revient à minuit et le mensuel au 1er du mois, heure de Paris. Une clé sans plafond n'envoie pas d'en-tête : `rateLimit` vaut alors `null`.
