import { PharmAssistant, type ClientOptions } from "../src/index.js";

export const CLE = "pa_test_0123456789";
export const URL_API = "https://api.test";

export function reponseAsk(champs: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "req_0001", object: "pharmassistant.answer", created_at: "2026-11-24T10:42:07+01:00",
    status: "ok", mode: "standard", question: "Amoxicilline et allaitement ?",
    title: "Amoxicilline et allaitement", answer: "Compatible.[S1] Surveiller le nourrisson.[S1][S2]",
    key_points: [{ polarity: "positive", text: "Compatible" }, { polarity: "negative", text: "Pas de surdosage" }],
    patient_advice: "Vous pouvez allaiter.", associated_sale: "Probiotique ?", clarification: null,
    suggestions: ["Et pendant la grossesse ?"], tools_used: ["lecrat_search"],
    sources: {
      lecrat_search: [{ title: "CRAT : amoxicilline", url: "https://crat/a" }],
      lactmed_search: [{ title: "CRAT : amoxicilline", url: "https://crat/a" }, { title: "LactMed", url: null }],
    },
    citations: "list",
    references: [
      { n: 1, tool: "lecrat_search", title: "CRAT", url: "https://crat/a", empty: false, query: null },
      { n: 2, tool: "lactmed_search", title: "", url: null, empty: true, query: "amoxicillin" },
    ],
    passages: [
      { index: 0, n: 1, quote: "passe peu dans le lait", before: "", after: "", record: null, record_title: null },
      { index: 2, n: 2, quote: null, before: null, after: null,
        record: [{ label: "Dose", value: "faible", cited: true }], record_title: "Fiche" },
    ],
    conversation_id: null,
    usage: { elapsed_ms: 4200, daily_requests_used: 12, daily_requests_limit: 100 },
    ...champs,
  };
}

export function clarification(champs: Record<string, unknown> = {}): Record<string, unknown> {
  return reponseAsk({
    status: "clarification_needed", answer: null, title: null, question: "Collyre pour l'oeille ?",
    clarification: { word: "oeille", corrections: ["œil", "oreille"], message: "Vouliez-vous dire :" },
    ...champs,
  });
}

export function json(corps: unknown, status = 200, entetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), {
    status, headers: { "content-type": "application/json", "x-request-id": "req_0001", ...entetes },
  });
}

export function erreur(status: number, code: string, message = "Refus.", entetes: Record<string, string> = {}): Response {
  return json({ error: { code, message } }, status, { "x-request-id": "req_err", ...entetes });
}

export function sse(...evenements: Array<[string, unknown]>): string {
  return evenements.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}

export function fluxComplet(reponse: Record<string, unknown> = reponseAsk()): string {
  return sse(["start", { id: "req_0001", object: "pharmassistant.answer.stream" }],
    ["status", { state: "routing" }], ["chunk", { text: "Compa" }], ["chunk", { text: "tible." }],
    ["done", reponse]);
}

/** Corps SSE découpé en morceaux d'octets arbitraires, coupure finale possible. */
export function corpsSSE(texte: string, taille = 7, coupure?: Error): ReadableStream<Uint8Array> {
  const octets = new TextEncoder().encode(texte);
  let i = 0;
  return new ReadableStream({
    pull(controleur) {
      if (i < octets.length) {
        controleur.enqueue(octets.slice(i, i + taille));
        i += taille;
      } else if (coupure) {
        controleur.error(coupure);
      } else {
        controleur.close();
      }
    },
  });
}

export function reponseSSE(texte: string, taille = 7, entetes: Record<string, string> = {}): Response {
  return new Response(corpsSSE(texte, taille), { headers: { "content-type": "text/event-stream", ...entetes } });
}

type Suivante = Response | Error | Record<string, unknown> | string
  | ((requete: Request, signal: AbortSignal) => Response | Promise<Response>);

/** Faux serveur : rejoue des réponses dans l'ordre (la dernière se répète). */
export class Serveur {
  readonly requetes: Request[] = [];
  private readonly suivantes: Suivante[];

  constructor(...suivantes: Suivante[]) {
    this.suivantes = suivantes;
  }

  readonly fetch = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requete = new Request(entree, init);
    this.requetes.push(requete.clone());
    const suivante = this.suivantes.length > 1 ? this.suivantes.shift()! : this.suivantes[0]!;
    if (suivante instanceof Error) throw suivante;
    if (typeof suivante === "function") return suivante(requete, init?.signal ?? requete.signal);
    if (suivante instanceof Response) return suivante.clone();
    if (typeof suivante === "string") return reponseSSE(suivante);
    return json(suivante);
  };

  async corps(i = -1): Promise<Record<string, unknown>> {
    const requete = this.requetes.at(i);
    const texte = requete ? await requete.clone().text() : "";
    return texte ? JSON.parse(texte) as Record<string, unknown> : {};
  }
}

export interface ClientDeTest extends PharmAssistant {
  attentes: number[];
}

export function client(serveur: Serveur, options: ClientOptions = {}): ClientDeTest {
  const c = new PharmAssistant(CLE, { baseUrl: URL_API, fetch: serveur.fetch, ...options }) as ClientDeTest;
  c.attentes = [];
  (c as unknown as { attendre: (ms: number) => Promise<void> }).attendre = async (ms) => {
    c.attentes.push(ms);
  };
  return c;
}

export function erreurReseau(code: string): TypeError {
  return new TypeError("fetch failed", { cause: Object.assign(new Error(code), { code }) });
}

/** L'erreur que rejette la promesse ; échoue si elle se résout. */
export async function echec<T = Error>(promesse: Promise<unknown>): Promise<T> {
  try {
    await promesse;
  } catch (erreur) {
    return erreur as T;
  }
  throw new Error("La promesse s'est résolue au lieu d'échouer.");
}
