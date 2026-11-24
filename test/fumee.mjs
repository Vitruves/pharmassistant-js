// Le paquet construit, tel qu'un utilisateur l'importe : node, bun, deno.
import { PharmAssistant, QuotaExceededError, VERSION } from "../dist/index.js";

const reponse = { id: "req_1", status: "ok", question: "Q ?", answer: "Réponse.[S1]", citations: "inline",
  references: [{ n: 1, tool: "t", title: "Source", url: null, empty: false, query: null }], passages: [],
  usage: { elapsed_ms: 1, daily_requests_used: 1, daily_requests_limit: 10 } };
const flux = `event: start\ndata: {"id":"req_2"}\n\nevent: chunk\ndata: {"text":"Répo"}\n\n`
  + `event: chunk\ndata: {"text":"nse."}\n\nevent: done\ndata: ${JSON.stringify(reponse)}\n\n`;
const vus = [];
const faux = async (url, init) => {
  vus.push(init.headers["User-Agent"]);
  const corps = JSON.parse(init.body);
  if (corps.question === "plafond") {
    return new Response(JSON.stringify({ error: { code: "daily_limit_reached", message: "Plafond." } }), { status: 429 });
  }
  return corps.stream ? new Response(flux) : new Response(JSON.stringify(reponse));
};

const client = new PharmAssistant("pa_fumee_0123456789", { fetch: faux, maxRetries: 0 });
const r = await client.ask("Q ?");
if (r.answerWithoutMarkers() !== "Réponse." || [...r.iterCitations()][0].reference.title !== "Source") throw new Error("ask");
let texte = "";
const s = client.askStream("Q ?");
for await (const morceau of s.textStream) texte += morceau;
if (texte !== "Réponse." || (await s.finalAnswer()).id !== "req_1") throw new Error("flux");
try {
  await client.ask("plafond");
  throw new Error("plafond non levé");
} catch (e) {
  if (!(e instanceof QuotaExceededError) || !e.aide) throw e;
}
if (!vus[0].startsWith(`pharmassistant-js/${VERSION} (`)) throw new Error(`User-Agent : ${vus[0]}`);
console.log(`fumée ESM correcte : ${vus[0]}`);
