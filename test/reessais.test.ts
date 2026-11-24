import { describe, expect, it } from "vitest";

import { APITimeoutError, QuotaExceededError, RateLimitError, ServerError } from "../src/index.js";
import { RETRY_AFTER_MAX, delaiDeReessai, natureReseau } from "../src/internal/base.js";
import { client, echec, erreur, erreurReseau, reponseAsk, Serveur } from "./outils.js";

describe("politique", () => {
  it("réessaie ce qui ne peut pas avoir été décompté", () => {
    expect(delaiDeReessai(0, 2, "POST", { reseau: "connexion" })).not.toBeNull();
    expect(delaiDeReessai(0, 2, "GET", { reseau: "lecture" })).not.toBeNull();
    for (const status of [500, 502, 503, 504]) expect(delaiDeReessai(0, 2, "POST", { status })).not.toBeNull();
    expect(delaiDeReessai(0, 2, "POST", { status: 429, code: "rate_limited", retryAfter: "7" })).toBe(7000);
  });

  it("ne réessaie jamais le reste", () => {
    expect(delaiDeReessai(0, 2, "POST", { reseau: "lecture" })).toBeNull();
    expect(delaiDeReessai(0, 2, "DELETE", { reseau: "lecture" })).toBeNull();
    expect(delaiDeReessai(0, 2, "POST", { reseau: "autre" })).toBeNull();
    for (const code of ["daily_limit_reached", "monthly_limit_reached", "detailed_limit_reached"]) {
      expect(delaiDeReessai(0, 2, "POST", { status: 429, code })).toBeNull();
    }
    for (const status of [400, 401, 403, 404, 422]) expect(delaiDeReessai(0, 2, "POST", { status })).toBeNull();
    expect(delaiDeReessai(2, 2, "POST", { status: 502 })).toBeNull();
  });

  it("borne les délais", () => {
    expect(delaiDeReessai(0, 2, "POST", { status: 429, code: "rate_limited", retryAfter: "3600" }))
      .toBe(RETRY_AFTER_MAX * 1000);
    for (let t = 0; t < 10; t += 1) expect(delaiDeReessai(t, 99, "POST", { status: 502 })).toBeLessThanOrEqual(8000);
  });

  it("classe les erreurs réseau de Node et de Bun", () => {
    expect(natureReseau(erreurReseau("ECONNREFUSED"))).toBe("connexion");
    expect(natureReseau(erreurReseau("UND_ERR_CONNECT_TIMEOUT"))).toBe("connexion");
    expect(natureReseau(Object.assign(new Error("x"), { code: "ConnectionRefused" }))).toBe("connexion");
    expect(natureReseau(new TypeError("fetch failed", { cause: new AggregateError([
      Object.assign(new Error("a"), { code: "ECONNREFUSED" })]) }))).toBe("connexion");
    expect(natureReseau(erreurReseau("ECONNRESET"))).toBe("lecture");
    expect(natureReseau(new TypeError("inconnu"))).toBe("autre");
  });
});

describe("boucle", () => {
  it("attend Retry-After puis réussit", async () => {
    const serveur = new Serveur(erreur(429, "rate_limited", "Rafale.", { "Retry-After": "4" }), reponseAsk());
    const c = client(serveur);
    expect((await c.ask("Q ?")).status).toBe("ok");
    expect(c.attentes).toEqual([4000]);
    expect(serveur.requetes).toHaveLength(2);
  });

  it("réessaie les 5xx", async () => {
    const serveur = new Serveur(erreur(502, "generation_failed"), erreur(503, "x"), reponseAsk());
    const c = client(serveur);
    await c.ask("Q ?");
    expect(c.attentes).toHaveLength(2);
  });

  it("lève la dernière erreur une fois les essais épuisés", async () => {
    const serveur = new Serveur(erreur(502, "generation_failed"));
    await expect(client(serveur, { maxRetries: 3 }).ask("Q ?")).rejects.toBeInstanceOf(ServerError);
    expect(serveur.requetes).toHaveLength(4);
  });

  it("une rafale épuisée garde retryAfter", async () => {
    const serveur = new Serveur(erreur(429, "rate_limited", "Rafale.", { "Retry-After": "1" }));
    const e = await echec<RateLimitError>(client(serveur, { maxRetries: 1 }).ask("Q ?"));
    expect(e).toBeInstanceOf(RateLimitError);
    expect(e.retryAfter).toBe(1);
  });

  it("ne réessaie jamais un plafond", async () => {
    const serveur = new Serveur(erreur(429, "daily_limit_reached"));
    const c = client(serveur);
    await expect(c.ask("Q ?")).rejects.toBeInstanceOf(QuotaExceededError);
    expect([serveur.requetes.length, c.attentes]).toEqual([1, []]);
  });

  it("réessaie une connexion refusée", async () => {
    const serveur = new Serveur(erreurReseau("ECONNREFUSED"), reponseAsk());
    expect((await client(serveur).ask("Q ?")).id).toBe("req_0001");
  });

  it("ne réessaie jamais une question dont la lecture est coupée", async () => {
    const serveur = new Serveur(erreurReseau("ECONNRESET"), reponseAsk());
    await expect(client(serveur).ask("Q ?")).rejects.toMatchObject({ code: "connection_error" });
    expect(serveur.requetes).toHaveLength(1);
  });

  it("réessaie une lecture coupée sur GET", async () => {
    const serveur = new Serveur(erreurReseau("ECONNRESET"), { id: "key_1" });
    expect((await client(serveur).me()).id).toBe("key_1");
  });

  it("ne réessaie jamais un délai dépassé", async () => {
    const serveur = new Serveur(new DOMException("Délai dépassé.", "TimeoutError"), reponseAsk());
    await expect(client(serveur).ask("Q ?")).rejects.toBeInstanceOf(APITimeoutError);
    expect(serveur.requetes).toHaveLength(1);
  });

  it("maxRetries: 0 n'essaie qu'une fois", async () => {
    const serveur = new Serveur(erreur(502, "generation_failed"));
    await expect(client(serveur, { maxRetries: 0 }).ask("Q ?")).rejects.toBeInstanceOf(ServerError);
    expect(serveur.requetes).toHaveLength(1);
  });
});
