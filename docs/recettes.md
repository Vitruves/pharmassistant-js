# Recettes

Des intégrations complètes, à adapter. Chacune suppose la clé dans `PHARMASSISTANT_API_KEY`, sauf le Worker.

## Express

Un client pour toute l'application. Les erreurs de PharmAssistant deviennent des réponses propres pour vos utilisateurs, sans jamais leur exposer un problème de clé.

```ts
import express from "express";
import { APIConnectionError, PharmAssistant, PharmAssistantError, QuotaExceededError } from "pharmassistant";

const app = express();
app.use(express.json());
const client = new PharmAssistant();

app.post("/question", async (req, res, next) => {
  try {
    const reponse = await client.ask(req.body.question, { mode: req.body.detaille ? "detailed" : "standard" });
    res.json(reponse);
  } catch (erreur) {
    next(erreur);
  }
});

app.use((erreur: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!(erreur instanceof PharmAssistantError)) return next(erreur);
  const [statut, message] = erreur instanceof QuotaExceededError
    ? [429, "Plafond de questions atteint pour aujourd'hui."]
    : erreur instanceof APIConnectionError
      ? [503, "Service momentanément injoignable."]
      : [502, "La question n'a pas pu aboutir."];
  res.status(statut).json({ erreur: message, requete: erreur.requestId });
});

app.listen(3000);
```

### Relayer le flux depuis Express

```ts
app.post("/question/flux", async (req, res, next) => {
  const flux = client.askStream(req.body.question);
  req.on("close", () => flux.abort());
  try {
    for await (const texte of flux.textStream) {
      if (!res.headersSent) res.type("text/plain; charset=utf-8");
      res.write(texte);
    }
    res.end();
  } catch (erreur) {
    if (res.headersSent) res.end();
    else next(erreur);
  }
});
```

Un refus de pré-vol (quota, clé) arrive avant le premier fragment : il passe par le gestionnaire d'erreurs ci-dessus. `flux.abort()` libère la connexion si l'utilisateur ferme la page.

## Relayer le flux avec Next.js

Une route de l'App Router, exécutée côté serveur, qui transmet le texte au navigateur au fur et à mesure.

```ts
// app/api/question/route.ts
import { PharmAssistant } from "pharmassistant";

const client = new PharmAssistant();

export async function POST(requete: Request) {
  const { question } = await requete.json();
  const flux = client.askStream(question, { signal: requete.signal });
  const encodeur = new TextEncoder();

  return new Response(new ReadableStream({
    async start(controleur) {
      try {
        for await (const texte of flux.textStream) controleur.enqueue(encodeur.encode(texte));
        controleur.close();
      } catch (erreur) {
        controleur.error(erreur);
      }
    },
  }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

Côté navigateur, lisez la réponse avec `response.body.getReader()` ; la clé ne quitte jamais le serveur.

## Cloudflare Workers

Pas d'environnement global dans un Worker : la clé se passe depuis `env`, déclarée comme secret (`wrangler secret put PHARMASSISTANT_API_KEY`).

```ts
import { PharmAssistant } from "pharmassistant";

interface Env {
  PHARMASSISTANT_API_KEY: string;
}

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const client = new PharmAssistant({ apiKey: env.PHARMASSISTANT_API_KEY });
    const { question } = await requete.json<{ question: string }>();
    const reponse = await client.ask(question);
    return Response.json(reponse);
  },
};
```

## Traiter une liste de questions

Une question par ligne dans `questions.txt`, une réponse JSON par ligne dans `reponses.jsonl`. Le traitement reprend où il s'était arrêté, garde trois questions en vol, et s'interrompt proprement au plafond.

```ts
import { appendFile, readFile } from "node:fs/promises";
import { PharmAssistant, PharmAssistantError, QuotaExceededError } from "pharmassistant";

const client = new PharmAssistant();
const faites = new Set(
  (await readFile("reponses.jsonl", "utf8").catch(() => ""))
    .split("\n").filter(Boolean).map((ligne) => JSON.parse(ligne).question as string));
const aFaire = (await readFile("questions.txt", "utf8"))
  .split("\n").map((q) => q.trim()).filter((q) => q && !faites.has(q));

let plafond = false;
async function ouvrier() {
  for (let question = aFaire.shift(); question && !plafond; question = aFaire.shift()) {
    try {
      const reponse = await client.ask(question);
      await appendFile("reponses.jsonl", `${JSON.stringify(reponse)}\n`);
    } catch (erreur) {
      if (erreur instanceof QuotaExceededError) {
        plafond = true;
        console.error("Arrêt :", erreur.aide);
      } else if (erreur instanceof PharmAssistantError) {
        console.error("Échec :", question, erreur.code);
      } else {
        throw erreur;
      }
    }
  }
}

await Promise.all([ouvrier(), ouvrier(), ouvrier()]);
```

Pour plus de prudence, vérifiez d'abord le reste du jour : `(await client.me()).dailyRemaining`.

## Rendre les citations en HTML

Avec `citations: "inline"`, chaque repère `[S1]` devient un exposant cliquable vers sa source, puis le markdown est converti (ici avec le paquet `marked`).

```ts
import { marked } from "marked";
import type { Answer } from "pharmassistant";

const echapper = (texte: string) =>
  texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function avecLiens(reponse: Answer): string {
  const texte = reponse.answer ?? "";
  let sortie = "";
  let curseur = 0;
  for (const c of reponse.iterCitations()) {
    sortie += texte.slice(curseur, c.start);
    const titre = echapper(c.reference?.title || c.reference?.tool || "");
    sortie += c.reference?.url
      ? `<sup><a href="${echapper(c.reference.url)}" title="${titre}">${c.n}</a></sup>`
      : `<sup title="${titre}">${c.n}</sup>`;
    curseur = c.end;
  }
  return marked.parse(sortie + texte.slice(curseur), { async: false });
}
```

Pour montrer l'extrait au survol, `c.passage.quote` (prose) ou `c.passage.record` (fiche) donne le texte de la source : voir [Sources et citations](citations.md#les-extraits).

## Tableau de bord de quota

```ts
const etat = await client.me();

console.log(`Clé ${etat.name} (${etat.key_hint}), ${etat.active ? "active" : "inactive"}`);
for (const [libelle, utilise, plafond] of [
  ["Aujourd'hui", etat.daily_requests_used, etat.daily_limit],
  ["Détaillé", etat.daily_detailed_used, etat.daily_detailed_limit],
  ["Ce mois", etat.month_requests_used, etat.monthly_limit],
] as const) {
  if (plafond === null) console.log(`${libelle} : ${utilise} (sans plafond)`);
  else console.log(`${libelle} : ${utilise} / ${plafond}${utilise >= 0.8 * plafond ? "  ⚠ plus de 80 %" : ""}`);
}
if (!etat.hasScope("ask:detailed")) console.log("Mode Détaillé non autorisé pour cette clé.");
```

Après chaque question, `reponse.rateLimit?.remaining` donne le reste du jour sans appel supplémentaire.

## Tester sans réseau

Fournissez au client un `fetch` factice : vos tests ne consomment rien et ne dépendent pas du réseau.

```ts
import { PharmAssistant } from "pharmassistant";

const fauxFetch: typeof fetch = async (url) => {
  if (String(url).endsWith("/v1/ask")) {
    return Response.json({
      id: "req_test", status: "ok", question: "Q ?", answer: "Réponse factice.",
      usage: { elapsed_ms: 1, daily_requests_used: 1, daily_requests_limit: null },
    });
  }
  return Response.json({ error: { code: "not_found", message: "Inconnu." } }, { status: 404 });
};

const client = new PharmAssistant("pa_test_factice", { fetch: fauxFetch, maxRetries: 0 });
console.assert((await client.ask("Q ?")).answer === "Réponse factice.");
```

Pour simuler une erreur, rendez l'enveloppe de l'API : `Response.json({ error: { code: "daily_limit_reached", message: "…" } }, { status: 429 })` lève `QuotaExceededError`. Pour un flux, rendez un corps `text/event-stream` (`event: chunk\ndata: {"text":"…"}\n\n`, puis `event: done`).
