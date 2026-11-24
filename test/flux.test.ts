import { describe, expect, it } from "vitest";

import { APIConnectionError, APITimeoutError, Answer, QuotaExceededError, ServerError } from "../src/index.js";
import { LecteurSSE } from "../src/stream.js";
import {
  client, corpsSSE, echec, erreur, fluxComplet, reponseAsk, reponseSSE, Serveur, sse,
} from "./outils.js";

function lire(texte: string): Array<[string, string]> {
  const lecteur = new LecteurSSE();
  const sortie: Array<[string, string]> = [];
  for (const ligne of texte.split("\n")) {
    const brut = lecteur.ligne(ligne);
    if (brut) sortie.push(brut);
  }
  const reste = lecteur.fin();
  if (reste) sortie.push(reste);
  return sortie;
}

describe("lecteur SSE", () => {
  it("suit le protocole", () => {
    expect(lire(": commentaire\n\nevent: chunk\r\ndata: {\"a\":1}\n\ndata: ligne1\ndata:ligne2\n\nevent: done\ndata: {}"))
      .toEqual([["chunk", "{\"a\":1}"], ["message", "ligne1\nligne2"], ["done", "{}"]]);
  });
});

describe("flux", () => {
  it("rend les événements puis la réponse complète", async () => {
    const serveur = new Serveur(fluxComplet());
    const flux = client(serveur).askStream("Q ?");
    const evenements = [];
    for await (const evt of flux) evenements.push(evt);
    expect(evenements.map((e) => e.event)).toEqual(["start", "status", "chunk", "chunk", "done"]);
    expect(flux.answer).toBeInstanceOf(Answer);
    expect(flux.requestId).toBe("req_0001");
    expect((await serveur.corps()).stream).toBe(true);
    expect(serveur.requetes[0]!.headers.get("accept")).toBe("text/event-stream");
  });

  it("se déballe en { event, data } comme le fichier unique", async () => {
    let reponse: unknown = null;
    for await (const { event, data } of client(new Serveur(fluxComplet())).askStream("Q ?")) {
      if (event === "done") reponse = data;
    }
    expect((reponse as Answer).answer).toBe(reponseAsk().answer);
  });

  it("textStream puis finalAnswer", async () => {
    const flux = client(new Serveur(fluxComplet())).askStream("Q ?");
    let texte = "";
    for await (const morceau of flux.textStream) texte += morceau;
    expect(texte).toBe("Compatible.");
    expect((await flux.finalAnswer()).id).toBe("req_0001");
  });

  it("finalAnswer seul", async () => {
    expect((await client(new Serveur(fluxComplet())).askStream("Q ?").finalAnswer()).status).toBe("ok");
  });

  it("résiste à un découpage arbitraire, accents compris", async () => {
    const texte = sse(["start", { id: "req_1" }], ["chunk", { text: "Œil, oreille, éàü ✔" }],
      ["done", reponseAsk()]);
    for (const taille of [1, 2, 3, 5, 64]) {
      const serveur = new Serveur(() => reponseSSE(texte, taille));
      let lu = "";
      const flux = client(serveur).askStream("Q ?");
      for await (const m of flux.textStream) lu += m;
      expect(lu).toBe("Œil, oreille, éàü ✔");
    }
  });

  it("le registre arrive avant le texte", async () => {
    const texte = sse(["start", { id: "req_1" }],
      ["references", { references: [{ n: 1, tool: "t", title: "T", url: null, empty: false, query: null }] }],
      ["chunk", { text: "A.[S1]" }], ["done", reponseAsk({ citations: "inline" })]);
    const flux = client(new Serveur(texte)).askStream("Q ?", { citations: "inline" });
    const iterateur = flux[Symbol.asyncIterator]();
    await iterateur.next();
    const evt = await iterateur.next();
    expect(evt.value?.event).toBe("references");
    expect(flux.references[0]!.title).toBe("T");
    flux.abort();
  });

  it("une erreur en cours de flux lève l'exception typée", async () => {
    const texte = sse(["start", { id: "req_9" }], ["chunk", { text: "A" }],
      ["error", { error: { code: "generation_failed", message: "Échec." } }]);
    const e = await echec<ServerError>(client(new Serveur(texte)).askStream("Q ?").finalAnswer());
    expect(e).toBeInstanceOf(ServerError);
    expect([e.code, e.requestId]).toEqual(["generation_failed", "req_9"]);
  });

  it("un flux tronqué lève stream_interrupted", async () => {
    const texte = sse(["start", { id: "req_9" }], ["chunk", { text: "A" }]);
    await expect(client(new Serveur(texte)).askStream("Q ?").finalAnswer())
      .rejects.toMatchObject({ code: "stream_interrupted", requestId: "req_9" });
  });

  it("un refus de pré-vol est levé à la première lecture", async () => {
    const serveur = new Serveur(erreur(429, "daily_limit_reached"));
    const flux = client(serveur).askStream("Q ?");
    expect(serveur.requetes).toHaveLength(0);
    await expect(flux.finalAnswer()).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("un 5xx de pré-vol est réessayé", async () => {
    const serveur = new Serveur(erreur(502, "generation_failed"), fluxComplet());
    expect((await client(serveur).askStream("Q ?").finalAnswer()).status).toBe("ok");
  });

  it("une coupure réseau en cours de flux garde l'identifiant", async () => {
    const texte = sse(["start", { id: "req_5" }], ["chunk", { text: "A" }]);
    const serveur = new Serveur(() => new Response(corpsSSE(texte, 64, new TypeError("terminated"))));
    const e = await echec<APIConnectionError>(client(serveur).askStream("Q ?").finalAnswer());
    expect(e).toBeInstanceOf(APIConnectionError);
    expect([e.code, e.requestId]).toEqual(["stream_interrupted", "req_5"]);
  });

  it("un flux muet trop longtemps dépasse le délai d'inactivité", async () => {
    const serveur = new Serveur((_requete, signal) => {
      let envoye = false;
      return new Response(new ReadableStream({
        pull(controleur) {
          if (!envoye) {
            envoye = true;
            controleur.enqueue(new TextEncoder().encode(sse(["start", { id: "req_7" }])));
            return;
          }
          return new Promise((_, rejeter) => signal.addEventListener("abort", () => {
            controleur.error(signal.reason);
            rejeter(signal.reason);
          }));
        },
      }));
    });
    const e = await client(serveur, { timeout: 30 }).askStream("Q ?").finalAnswer().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(APITimeoutError);
  });

  it("abort() arrête le flux", async () => {
    const flux = client(new Serveur(() => reponseSSE(fluxComplet(), 4))).askStream("Q ?");
    const evenements: string[] = [];
    const lecture = (async () => {
      for await (const evt of flux) {
        evenements.push(evt.event);
        if (evt.event === "status") flux.abort();
      }
    })();
    await expect(lecture).rejects.toMatchObject({ name: "AbortError" });
    expect(evenements).toEqual(["start", "status"]);
    expect(flux.answer).toBeNull();
  });
});
