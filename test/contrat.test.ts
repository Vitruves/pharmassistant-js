// Paquet confronté au schéma OpenAPI de l'API en service. Réseau : seulement avec
// PHARMASSISTANT_CONTRAT=1 (npm run contrat, workflow hebdomadaire contrat.yml).
import { describe, expect, it } from "vitest";

import type {
  AskResponse, Clarification, ConversationDeleted, ConversationDetail, ConversationMessage,
  ConversationSummary, Health, KeyInfoResponse, KeyPoint, Passage, RecordLine, Reference, SourceRef, Usage,
} from "../src/index.js";
import { CHAMPS_ASK, CITATIONS, MODES } from "../src/internal/base.js";
import { EVENEMENTS } from "../src/stream.js";

// Champs que le paquet n'expose pas exprès, même tant que le serveur les accepte.
const RETIRES = new Set(["instructions", "stream"]);

type Exhaustif<T, L extends readonly (keyof T)[]> = Exclude<keyof T, L[number]> extends never ? L : never;
const champs = <T>() => <const L extends readonly (keyof T)[]>(liste: Exhaustif<T, L>): readonly string[] =>
  liste as readonly string[];

const REPONSES: Record<string, readonly string[]> = {
  AskResponse: champs<AskResponse>()(["id", "object", "created_at", "status", "mode", "question", "title",
    "answer", "key_points", "patient_advice", "associated_sale", "clarification", "suggestions", "tools_used",
    "sources", "citations", "references", "passages", "conversation_id", "usage"]),
  KeyInfoResponse: champs<KeyInfoResponse>()(["id", "name", "key_hint", "pharmacy_slug", "daily_limit",
    "monthly_limit", "daily_detailed_limit", "limits_locked", "scopes", "active", "expires_at", "created_at",
    "last_used_at", "daily_requests_used", "daily_detailed_used", "month_requests_used"]),
  ConversationSummary: champs<ConversationSummary>()(["id", "title", "message_count", "created_at", "updated_at"]),
  ConversationMessage: champs<ConversationMessage>()(["role", "content", "created_at"]),
  ConversationDetailResponse: champs<ConversationDetail>()(["id", "object", "title", "created_at", "updated_at", "messages"]),
  ConversationDeletedResponse: champs<ConversationDeleted>()(["id", "object", "deleted"]),
  HealthResponse: champs<Health>()(["status", "service", "version"]),
  SourceRef: champs<SourceRef>()(["title", "url"]),
  Reference: champs<Reference>()(["n", "tool", "title", "url", "empty", "query"]),
  RecordLine: champs<RecordLine>()(["label", "value", "cited"]),
  Passage: champs<Passage>()(["index", "n", "quote", "before", "after", "record", "record_title"]),
  Clarification: champs<Clarification>()(["word", "corrections", "message"]),
  KeyPoint: champs<KeyPoint>()(["polarity", "text"]),
  Usage: champs<Usage>()(["elapsed_ms", "daily_requests_used", "daily_requests_limit"]),
};

const ROUTES = ["/v1/health", "/v1/me", "/v1/ask", "/v1/conversations", "/v1/conversations/{conversation_id}"];

interface Spec {
  info: { description?: string };
  paths: Record<string, unknown>;
  components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
}

describe.runIf(process.env["PHARMASSISTANT_CONTRAT"] === "1")("contrat de l'API en service", async () => {
  const base = (process.env["PHARMASSISTANT_API_URL"] ?? "https://api.pharmassistant.fr").replace(/\/+$/, "");
  const spec = await (await fetch(`${base}/openapi.json`)).json() as Spec;
  const proprietes = (nom: string) => spec.components.schemas[nom]?.properties ?? {};

  it("chaque champ de requête est une option", () => {
    const options = new Set<string>(Object.values(CHAMPS_ASK));
    for (const champ of Object.keys(proprietes("AskRequest"))) {
      if (champ !== "question" && !RETIRES.has(champ)) expect(options, champ).toContain(champ);
    }
  });

  it("les valeurs permises sont les mêmes", () => {
    const requete = proprietes("AskRequest");
    expect(new Set(requete["mode"]?.enum)).toEqual(new Set(MODES));
    expect(new Set(requete["citations"]?.enum)).toEqual(new Set(CITATIONS));
    expect(new Set(proprietes("AskResponse")["status"]?.enum)).toEqual(new Set(["ok", "clarification_needed"]));
  });

  it("chaque champ de réponse est typé", () => {
    for (const [schema, liste] of Object.entries(REPONSES)) {
      for (const champ of Object.keys(proprietes(schema))) expect(liste, `${schema}.${champ}`).toContain(champ);
    }
  });

  it("les routes et les événements du flux", () => {
    expect(new Set(Object.keys(spec.paths))).toEqual(new Set(ROUTES));
    for (const evenement of EVENEMENTS) expect(spec.info.description ?? "").toContain(`\`${evenement}\``);
  });
});
