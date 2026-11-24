import { describe, expect, it } from "vitest";

import {
  APIConnectionError, APIStatusError, APITimeoutError, AuthenticationError, CODES, ConversationNotFoundError,
  InvalidRequestError, NotFoundError, PermissionDeniedError, PharmAssistantError, QuotaExceededError,
  RateLimitError, ServerError,
} from "../src/index.js";
import { classeDe, erreurDApi } from "../src/errors.js";
import { client, echec, erreur, erreurReseau, json, reponseAsk, Serveur } from "./outils.js";

const ATTENDU: Record<string, unknown> = {
  missing_api_key: AuthenticationError, invalid_api_key: AuthenticationError,
  revoked_api_key: AuthenticationError, expired_api_key: AuthenticationError,
  pharmacy_not_found: PermissionDeniedError, pharmacy_suspended: PermissionDeniedError,
  scope_denied: PermissionDeniedError, conversation_not_found: ConversationNotFoundError,
  not_found: NotFoundError, invalid_request: InvalidRequestError, rate_limited: RateLimitError,
  daily_limit_reached: QuotaExceededError, monthly_limit_reached: QuotaExceededError,
  detailed_limit_reached: QuotaExceededError, internal_error: ServerError,
  generation_failed: ServerError, empty_response: ServerError,
};

describe("correspondance des codes", () => {
  it("chaque code d'API a sa classe, avec ou sans statut", () => {
    for (const [code, classe] of Object.entries(ATTENDU)) {
      expect(classeDe(CODES[code]!.status, code)).toBe(classe);
      expect(classeDe(null, code)).toBe(classe);
    }
  });

  it("chaque code a un sens et une aide, sans tiret de ponctuation", () => {
    for (const info of Object.values(CODES)) {
      expect(info.sens.trim() && info.aide.trim()).toBeTruthy();
      expect(info.sens + info.aide).not.toMatch(/—| – /);
    }
  });

  it("un code inconnu est classé par son statut", () => {
    expect(classeDe(401, "nouveau")).toBe(AuthenticationError);
    expect(classeDe(429, "nouveau")).toBe(RateLimitError);
    expect(classeDe(503, null)).toBe(ServerError);
    expect(classeDe(418, null)).toBe(APIStatusError);
  });

  it("une réponse sans enveloppe garde son texte", () => {
    const e = erreurDApi(502, null, { brut: "<html>Bad gateway</html>" });
    expect(e).toBeInstanceOf(ServerError);
    expect(e.code).toBe("http_502");
    expect(e.message).toContain("Bad gateway");
  });
});

describe("erreurs levées", () => {
  it("portent statut, code, aide et identifiant de requête", async () => {
    const serveur = new Serveur(erreur(401, "invalid_api_key", "Clé d'API inconnue."));
    const e = await echec<AuthenticationError>(client(serveur).ask("Q ?"));
    expect(e).toBeInstanceOf(AuthenticationError);
    expect(e).toBeInstanceOf(PharmAssistantError);
    expect([e.status, e.code, e.requestId, e.name]).toEqual([401, "invalid_api_key", "req_err", "AuthenticationError"]);
    expect(String(e)).toMatch(/^AuthenticationError \[401\] invalid_api_key: Clé d'API inconnue\.\nAide : .+\nRequête : req_err$/);
  });

  it("un plafond dit quand il revient et n'est pas réessayé", async () => {
    const serveur = new Serveur(erreur(429, "daily_limit_reached", "Plafond.", { "X-RateLimit-Reset": "1795993200" }));
    const e = await echec<QuotaExceededError>(client(serveur).ask("Q ?"));
    expect(e).toBeInstanceOf(QuotaExceededError);
    expect(e.resetAt).toEqual(new Date(1795993200 * 1000));
    expect(serveur.requetes).toHaveLength(1);
  });

  it("une validation refusée détaille le champ", async () => {
    const serveur = new Serveur(json({ error: { code: "invalid_request", message: "Corps invalide.",
      details: [{ loc: ["body", "question"], msg: "trop longue" }] } }, 422));
    const e = await echec<InvalidRequestError>(client(serveur).ask("Q ?"));
    expect(e).toBeInstanceOf(InvalidRequestError);
    expect((e.details as Array<{ msg: string }>)[0]!.msg).toBe("trop longue");
  });

  it("une connexion impossible devient APIConnectionError", async () => {
    const serveur = new Serveur(erreurReseau("ECONNREFUSED"));
    const e = await echec<APIConnectionError>(client(serveur, { maxRetries: 0 }).ask("Q ?"));
    expect(e).toBeInstanceOf(APIConnectionError);
    expect(e.code).toBe("connection_error");
    expect(e.message).toContain("ECONNREFUSED");
  });

  it("un délai dépassé devient APITimeoutError", async () => {
    const serveur = new Serveur(new DOMException("Délai dépassé.", "TimeoutError"));
    await expect(client(serveur).ask("Q ?")).rejects.toBeInstanceOf(APITimeoutError);
  });

  it("une annulation de l'appelant reste une AbortError", async () => {
    const controleur = new AbortController();
    const serveur = new Serveur(async (_requete, signal) => {
      controleur.abort();
      await new Promise((_, rejeter) => {
        if (signal.aborted) rejeter(signal.reason);
        signal.addEventListener("abort", () => rejeter(signal.reason));
      });
      return json(reponseAsk());
    });
    await expect(client(serveur).ask("Q ?", { signal: controleur.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("une réponse illisible pointe vers un proxy", async () => {
    const serveur = new Serveur(new Response("<html>portail captif</html>", { status: 200 }));
    const e = await echec<APIConnectionError>(client(serveur).ask("Q ?"));
    expect(e).toBeInstanceOf(APIConnectionError);
    expect(e.code).toBe("invalid_response");
  });
});
