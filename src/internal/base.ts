import { APIConnectionError, APITimeoutError, ConfigurationError, PharmAssistantError, erreurDApi } from "../errors.js";
import type { Citations, HistoryTurn, Mode } from "../models.js";
import { VERSION } from "../version.js";

export const DEFAULT_BASE_URL = "https://api.pharmassistant.fr";
export const DEFAULT_TIMEOUT = 300_000;
export const DEFAULT_MAX_RETRIES = 2;
export const KEY_PREFIX = "pa_";
export const RETRY_AFTER_MAX = 60;
const BACKOFF_INITIAL = 500;
const BACKOFF_MAX = 8_000;

export const MODES: readonly Mode[] = ["standard", "detailed"];
export const CITATIONS: readonly Citations[] = ["list", "inline"];

/** Option camelCase → champ du contrat. */
export const CHAMPS_ASK = {
  mode: "mode",
  citations: "citations",
  store: "store",
  conversationId: "conversation_id",
  history: "history",
  suggestions: "suggestions",
  patientAdvice: "patient_advice",
  associatedSale: "associated_sale",
} as const;

export type HistoryInput = ReadonlyArray<HistoryTurn | readonly [HistoryTurn["role"], string]>;

/** Options de ask() et askStream() ; toutes facultatives. */
export interface AskOptions {
  /** "standard" (défaut, rapide) ou "detailed" (analyse exhaustive, portée ask:detailed). */
  mode?: Mode;
  /** "list" (défaut) : sources à part ; "inline" : repères [S1] dans le texte, registre, extraits. */
  citations?: Citations;
  /** true : conversation gardée par le serveur, la réponse porte conversation_id. */
  store?: boolean;
  /** Poursuit une conversation gardée (conv_…). */
  conversationId?: string;
  /** Historique porté par vous ; exclusif de store et conversationId. */
  history?: HistoryInput;
  /** false : sans pistes d'approfondissement. */
  suggestions?: boolean;
  /** false : sans discours patient. */
  patientAdvice?: boolean;
  /** false : sans conseil de vente associée. */
  associatedSale?: boolean;
  /** Annulation par l'appelant. */
  signal?: AbortSignal;
  /** Délai pour cet appel, en millisecondes. */
  timeout?: number;
}

export interface Journal {
  debug(message: string): void;
  warn(message: string): void;
}

type Env = Record<string, string | undefined>;

export function env(nom: string): string | undefined {
  const g = globalThis as { process?: { env?: Env }; Deno?: { env?: { get(n: string): string | undefined } } };
  try {
    return g.process?.env?.[nom] ?? g.Deno?.env?.get(nom);
  } catch {
    return undefined;
  }
}

export function runtime(): string {
  const g = globalThis as {
    Bun?: { version?: string }; Deno?: { version?: { deno?: string } };
    process?: { versions?: { node?: string } }; navigator?: { userAgent?: string };
  };
  if (g.Bun?.version) return `bun ${g.Bun.version}`;
  if (g.Deno?.version?.deno) return `deno ${g.Deno.version.deno}`;
  if (g.process?.versions?.node) return `node ${g.process.versions.node}`;
  return g.navigator?.userAgent?.split(" ")[0] ?? "inconnu";
}

export function userAgent(): string {
  return `pharmassistant-js/${VERSION} (${runtime()})`;
}

export function dansUnNavigateur(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return typeof g.window !== "undefined" && typeof g.document !== "undefined";
}

export function masquer(cle: string): string {
  return cle.length > 10 ? `${cle.slice(0, 7)}…` : "pa_…";
}

export function resoudreCle(apiKey: string | undefined): string {
  const cle = (apiKey ?? env("PHARMASSISTANT_API_KEY") ?? "").trim();
  if (!cle) {
    throw new ConfigurationError("Clé d'API absente.", {
      code: "missing_api_key",
      aide: "Passez apiKey: \"pa_…\" au client ou définissez PHARMASSISTANT_API_KEY. La clé se "
        + "retire sur le portail dont le lien vous a été envoyé par email.",
    });
  }
  if (!cle.startsWith(KEY_PREFIX)) {
    throw new ConfigurationError(`Clé d'API mal formée (${masquer(cle)}) : une clé commence par ${KEY_PREFIX}.`, {
      code: "invalid_api_key",
      aide: "Copiez la clé entière depuis le portail, sans guillemets ni espaces.",
    });
  }
  return cle;
}

export function resoudreUrl(baseUrl: string | undefined): string {
  const url = (baseUrl ?? env("PHARMASSISTANT_API_URL") ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) {
    throw new ConfigurationError(`URL de base invalide : ${JSON.stringify(url)}.`, {
      aide: "Exemple : https://api.pharmassistant.fr",
    });
  }
  return url;
}

export function journalParDefaut(): Journal {
  const niveau = (env("PHARMASSISTANT_LOG") ?? "").trim().toLowerCase();
  const rien = () => undefined;
  const ecrire = (m: string) => console.error(`[pharmassistant] ${m}`);
  return {
    debug: niveau === "debug" ? ecrire : rien,
    warn: ["debug", "info", "warning", "warn"].includes(niveau) ? ecrire : rien,
  };
}

function normaliserHistorique(history: HistoryInput | undefined): HistoryTurn[] {
  return (history ?? []).map((tour) => {
    const [role, content] = Array.isArray(tour)
      ? tour as readonly [string, string]
      : [(tour as HistoryTurn).role, (tour as HistoryTurn).content];
    if (role !== "user" && role !== "assistant") {
      throw new TypeError(`Rôle d'historique invalide : ${JSON.stringify(role)} (user ou assistant).`);
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new TypeError("Chaque tour d'historique porte un texte non vide.");
    }
    return { role, content };
  });
}

/** Corps de POST /v1/ask ; seuls les champs hors défaut sont envoyés. */
export function corpsAsk(question: string, options: AskOptions = {}, stream = false): Record<string, unknown> {
  if (typeof question !== "string" || !question.trim()) throw new TypeError("La question est vide.");
  const inconnues = Object.keys(options).filter((k) => !(k in CHAMPS_ASK) && k !== "signal" && k !== "timeout");
  if (inconnues.length) throw new TypeError(`Option inconnue : ${inconnues.join(", ")}.`);
  const { mode = "standard", citations = "list" } = options;
  if (!MODES.includes(mode)) throw new TypeError(`mode: ${JSON.stringify(mode)} : attendu standard ou detailed.`);
  if (!CITATIONS.includes(citations)) throw new TypeError(`citations: ${JSON.stringify(citations)} : attendu list ou inline.`);
  const tours = normaliserHistorique(options.history);
  if (tours.length && (options.conversationId || options.store)) {
    throw new TypeError("history est exclusif de conversationId et de store : soit vous portez "
      + "l'historique, soit le serveur garde la conversation.");
  }
  const corps: Record<string, unknown> = { question };
  if (mode !== "standard") corps["mode"] = mode;
  if (tours.length) corps["history"] = tours;
  if (options.conversationId) corps["conversation_id"] = options.conversationId;
  else if (options.store) corps["store"] = true;
  if (options.suggestions === false) corps["suggestions"] = false;
  if (options.patientAdvice === false) corps["patient_advice"] = false;
  if (options.associatedSale === false) corps["associated_sale"] = false;
  if (citations !== "list") corps["citations"] = citations;
  if (stream) corps["stream"] = true;
  return corps;
}

export function delaiBackoff(tentative: number): number {
  return Math.min(BACKOFF_MAX, BACKOFF_INITIAL * 2 ** tentative) * (0.75 + Math.random() * 0.25);
}

const CONNEXION_IMPOSSIBLE = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT", "ConnectionRefused", "FailedToOpenSocket",
]);
const LECTURE_COUPEE = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ConnectionClosed"]);

function codesDe(erreur: unknown): string[] {
  const codes: string[] = [];
  let courant: unknown = erreur;
  for (let i = 0; i < 4 && courant && typeof courant === "object"; i += 1) {
    const e = courant as { code?: unknown; errors?: unknown[]; cause?: unknown };
    if (typeof e.code === "string") codes.push(e.code);
    for (const sous of e.errors ?? []) {
      const code = (sous as { code?: unknown } | null)?.code;
      if (typeof code === "string") codes.push(code);
    }
    courant = e.cause;
  }
  return codes;
}

export type NatureReseau = "connexion" | "lecture" | "autre";

/** connexion : rien n'est parti ; lecture : coupure en cours de réponse. */
export function natureReseau(erreur: unknown): NatureReseau {
  const codes = codesDe(erreur);
  if (codes.some((c) => CONNEXION_IMPOSSIBLE.has(c))) return "connexion";
  if (codes.some((c) => LECTURE_COUPEE.has(c))) return "lecture";
  return "autre";
}

/**
 * Délai avant le prochain essai (ms), ou null pour ne pas réessayer.
 *
 * Réessayés : connexion impossible (rien n'est parti), rafale (Retry-After),
 * 5xx (jamais décomptés). Jamais une lecture coupée sur POST : la requête a pu
 * être décomptée.
 */
export function delaiDeReessai(
  tentative: number, maxRetries: number, methode: string,
  contexte: { status?: number; code?: string | null; retryAfter?: string | null; reseau?: NatureReseau },
): number | null {
  if (tentative >= maxRetries) return null;
  if (contexte.reseau) {
    if (contexte.reseau === "connexion") return delaiBackoff(tentative);
    if (contexte.reseau === "lecture" && methode === "GET") return delaiBackoff(tentative);
    return null;
  }
  if (contexte.status === 429) {
    if (contexte.code !== "rate_limited") return null;
    const attente = Number(contexte.retryAfter);
    const secondes = contexte.retryAfter != null && Number.isFinite(attente)
      ? attente : delaiBackoff(tentative) / 1000;
    return Math.min(RETRY_AFTER_MAX, Math.max(0, secondes)) * 1000;
  }
  if (contexte.status !== undefined && [500, 502, 503, 504].includes(contexte.status)) {
    return delaiBackoff(tentative);
  }
  return null;
}

export function erreurReseau(erreur: unknown, requestId: string | null = null): PharmAssistantError {
  const nom = (erreur as { name?: string } | null)?.name;
  if (nom === "TimeoutError") {
    return new APITimeoutError("Délai dépassé.", { code: "timeout", requestId });
  }
  const detail = erreur instanceof Error ? erreur.message : String(erreur);
  const codes = codesDe(erreur);
  return new APIConnectionError(
    `Connexion impossible : ${detail}${codes.length ? ` (${codes[0]})` : ""}.`,
    { code: "connection_error", requestId },
  );
}

export function entetes(headers: Headers): Record<string, string> {
  const sortie: Record<string, string> = {};
  headers.forEach((valeur, nom) => {
    sortie[nom.toLowerCase()] = valeur;
  });
  return sortie;
}

export async function erreurDeReponse(reponse: Response): Promise<PharmAssistantError> {
  const brut = await reponse.text().catch(() => "");
  let corps: unknown = null;
  try {
    corps = JSON.parse(brut);
  } catch {
    corps = null;
  }
  return erreurDApi(reponse.status, corps, {
    headers: entetes(reponse.headers), requestId: reponse.headers.get("x-request-id"), brut,
  });
}

export async function codeDErreur(reponse: Response): Promise<string | null> {
  try {
    const corps = await reponse.clone().json() as { error?: { code?: string } };
    return corps.error?.code ?? null;
  } catch {
    return null;
  }
}

export function attendre(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    if (signal?.aborted) {
      rejeter(signal.reason);
      return;
    }
    const minuteur = setTimeout(() => {
      signal?.removeEventListener("abort", surAbandon);
      resoudre();
    }, ms);
    const surAbandon = () => {
      clearTimeout(minuteur);
      rejeter(signal?.reason);
    };
    signal?.addEventListener("abort", surAbandon, { once: true });
  });
}
