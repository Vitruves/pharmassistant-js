# Environnements

Le client n'utilise que des API web standard (`fetch`, `Response`, `ReadableStream`, `AbortController`, `TextDecoder`) : il tourne partout où elles existent, côté serveur.

| Environnement | Import | Remarques |
|---|---|---|
| Node.js 20 et plus | `import` ou `require` | rien à faire |
| Deno | `import { PharmAssistant } from "npm:pharmassistant";` | `--allow-net=api.pharmassistant.fr`, et `--allow-env` pour lire la clé dans l'environnement |
| Bun | `import` ou `require` | rien à faire |
| Cloudflare Workers | `import` | clé passée explicitement depuis `env`, voir la [recette](recettes.md#cloudflare-workers) |
| Next.js, Remix, Nuxt, SvelteKit | `import`, côté serveur seulement | route ou action serveur, voir la [recette](recettes.md#relayer-le-flux-avec-nextjs) |

## Jamais dans un navigateur

La clé donne accès au quota de votre intégration : dans une page web ou une application mobile, n'importe qui pourrait la lire. Le client refuse donc de s'ouvrir dans un navigateur et lève `ConfigurationError`. L'API n'ouvre d'ailleurs pas de CORS.

La bonne architecture : l'interface appelle votre serveur, votre serveur appelle PharmAssistant avec la clé, et relaie la réponse (en flux si besoin). C'est ce que montrent les [recettes](recettes.md).

`dangerouslyAllowBrowser: true` lève le refus, pour un outil interne qui ne sort jamais d'un poste de confiance. Le nom dit le risque.

## Modules

Le paquet livre les deux formats, avec leurs types :

```ts
import { PharmAssistant } from "pharmassistant";            // ESM
```

```js
const { PharmAssistant } = require("pharmassistant");       // CommonJS
```

Aucun effet de bord à l'import : seul ce que vous utilisez entre dans un bundle.
