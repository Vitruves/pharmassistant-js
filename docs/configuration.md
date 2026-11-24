# Configuration

## Le constructeur

```ts
import { PharmAssistant } from "pharmassistant";

const client = new PharmAssistant({
  apiKey: undefined,              // défaut : PHARMASSISTANT_API_KEY
  baseUrl: undefined,             // défaut : PHARMASSISTANT_API_URL, sinon https://api.pharmassistant.fr
  timeout: 300_000,               // millisecondes ; en flux, délai d'inactivité
  maxRetries: 2,                  // voir erreurs.md
  defaultHeaders: {},             // en-têtes ajoutés à chaque requête
  fetch: undefined,               // fetch fourni : proxy, tests
  logger: undefined,              // journal ; défaut : PHARMASSISTANT_LOG
  dangerouslyAllowBrowser: false, // voir environnements.md
});
```

La clé peut aussi se passer en premier argument : `new PharmAssistant("pa_…", { timeout: 600_000 })`.

## Variables d'environnement

| Variable | Effet |
|---|---|
| `PHARMASSISTANT_API_KEY` | clé, quand `apiKey` n'est pas donnée |
| `PHARMASSISTANT_API_URL` | autre adresse d'API |
| `PHARMASSISTANT_LOG` | `debug` ou `warning` : journal sur la sortie d'erreur, sans rien configurer |

Sous Deno, la lecture demande `--allow-env` ; sans elle, passez `apiKey` explicitement. Sous Cloudflare Workers, il n'y a pas d'environnement global : passez `apiKey: env.PHARMASSISTANT_API_KEY` (voir la [recette](recettes.md#cloudflare-workers)).

## Délais

Une réponse standard prend quelques secondes ; le mode Détaillé peut dépasser deux minutes. Le délai par défaut, 300 s, couvre les deux. Pour un appel :

```ts
const reponse = await client.ask("…", { mode: "detailed", timeout: 600_000 });
```

Le délai couvre toute la requête, corps de la réponse compris. En [flux](flux.md), il mesure l'inactivité : il se réarme à chaque fragment reçu. Un délai dépassé lève `APITimeoutError` ; la question n'est pas réessayée seule, car elle a pu être décomptée.

## Annuler

Toutes les méthodes réseau acceptent un `AbortSignal` :

```ts
const controleur = new AbortController();
const promesse = client.ask("…", { signal: controleur.signal });
controleur.abort();
await promesse.catch((erreur) => console.log(erreur.name));    // "AbortError"
```

Une annulation rejette l'`AbortError` standard, jamais une `PharmAssistantError`, et interrompt aussi l'attente d'un nouvel essai.

## Variantes d'un client

`withOptions` rend une copie réglée autrement, avec la même clé :

```ts
const lent = client.withOptions({ timeout: 900_000, maxRetries: 0 });
await lent.ask("…", { mode: "detailed" });
```

## fetch fourni

Le client accepte tout `fetch` conforme : pour passer par un proxy, ajouter de la traçabilité, ou simuler l'API dans vos tests.

```ts
import { ProxyAgent, fetch as undiciFetch } from "undici";

const agent = new ProxyAgent("http://proxy.interne:3128");
const client = new PharmAssistant({
  fetch: (url, init) => undiciFetch(url, { ...init, dispatcher: agent }) as unknown as Promise<Response>,
});
```

Pour les tests, voir la recette [Tester sans réseau](recettes.md#tester-sans-réseau).

## Journal

Muet par défaut. `PHARMASSISTANT_LOG=debug` écrit chaque requête (méthode, route, statut, durée, identifiant de requête) ; `warning`, seulement les [nouveaux essais](erreurs.md#nouveaux-essais-automatiques). Pour votre propre journal :

```ts
const client = new PharmAssistant({
  logger: { debug: (m) => monJournal.debug(m), warn: (m) => monJournal.warn(m) },
});
```

La clé n'apparaît jamais dans le journal, ni le texte des questions.

## En-têtes

Chaque requête porte `User-Agent: pharmassistant-js/<version> (<environnement>)`. Pour identifier votre intégration auprès du support :

```ts
const client = new PharmAssistant({ defaultHeaders: { "X-Integration": "logiciel-officine/4.2" } });
```
