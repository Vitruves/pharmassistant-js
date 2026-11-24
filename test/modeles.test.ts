import { describe, expect, it } from "vitest";

import { Answer, KeyInfo, correctedQuestion } from "../src/index.js";
import { rateLimitDe } from "../src/models.js";
import { clarification, reponseAsk } from "./outils.js";

describe("Answer", () => {
  const r = new Answer(reponseAsk() as never);

  it("garde les champs du JSON et se sérialise à l'identique", () => {
    expect(r.title).toBe("Amoxicilline et allaitement");
    expect(r.key_points[0]!.polarity).toBe("positive");
    expect(JSON.parse(JSON.stringify(r))).toEqual(reponseAsk());
    expect(Object.keys(r)).not.toContain("rateLimit");
  });

  it("parcourt les repères avec référence et extrait", () => {
    const citations = [...r.iterCitations()];
    expect(citations.map((c) => [c.rank, c.n])).toEqual([[0, 1], [1, 1], [2, 2]]);
    expect(citations[0]!.passage?.quote).toBe("passe peu dans le lait");
    expect(citations[1]!.passage).toBeNull();
    expect(citations[2]!.passage?.record?.[0]?.cited).toBe(true);
    expect(citations[2]!.reference?.empty).toBe(true);
    expect(r.answer!.slice(citations[0]!.start, citations[0]!.end)).toBe("[S1]");
    expect(r.answerWithoutMarkers()).toBe("Compatible. Surveiller le nourrisson.");
    expect(r.reference(9)).toBeNull();
  });

  it("dédoublonne les sources", () => {
    expect(r.allSources().map((s) => s.title)).toEqual(["CRAT : amoxicilline", "LactMed"]);
  });

  it("supporte les champs absents", () => {
    const vide = new Answer({ id: "req_1", status: "ok" } as never);
    expect([vide.key_points, vide.sources, vide.references]).toEqual([[], {}, []]);
    expect([...vide.iterCitations()]).toEqual([]);
    expect(vide.rateLimit).toBeNull();
  });

  it("signale et corrige une demande de précision", () => {
    const p = new Answer(clarification() as never);
    expect(p.needsClarification).toBe(true);
    expect(p.correctedQuestion("oreille")).toBe("Collyre pour l'oreille ?");
  });
});

describe("correctedQuestion", () => {
  it("suit les trois règles du chat", () => {
    expect(correctedQuestion("oeille", "Collyre pour l'OEILLE ?", "œil")).toBe("Collyre pour l'œil ?");
    expect(correctedQuestion("doliprane", "Dolipràne enfant ?", "Doliprane")).toBe("Doliprane enfant ?");
    expect(correctedQuestion("zzz", "Posologie ?", "paracétamol")).toBe("Posologie ? (paracétamol)");
    expect(correctedQuestion("x", "  ", "paracétamol")).toBe("paracétamol");
  });

  it("ne se laisse pas piéger par les caractères spéciaux", () => {
    expect(correctedQuestion("a+b", "Dose de a+b ?", "c")).toBe("Dose de c ?");
    expect(correctedQuestion("x", "x et x", "$&$1")).toBe("$&$1 et x");
  });
});

describe("KeyInfo et quota", () => {
  it("calcule les restes", () => {
    const k = new KeyInfo({ daily_limit: 10, daily_requests_used: 12, monthly_limit: null, scopes: null } as never);
    expect([k.dailyRemaining, k.monthlyRemaining, k.hasScope("ask:detailed")]).toEqual([0, null, true]);
  });

  it("lit les en-têtes de quota", () => {
    const h = new Headers({ "X-RateLimit-Limit": "100", "x-ratelimit-remaining": "3", "X-RateLimit-Reset": "1795993200" });
    expect(rateLimitDe(h)).toEqual({ limit: 100, remaining: 3, resetAt: new Date(1795993200 * 1000) });
    expect(rateLimitDe(new Headers())).toBeNull();
    expect(rateLimitDe(new Headers({ "X-RateLimit-Limit": "abc", "X-RateLimit-Remaining": "1" }))).toBeNull();
  });
});
