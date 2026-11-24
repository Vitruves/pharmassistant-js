// Types du contrat : clés en anglais, contenus en français.

export type Mode = "standard" | "detailed";
export type Citations = "list" | "inline";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Puce à polarité : positive = recommandé, negative = à éviter. */
export interface KeyPoint {
  polarity: "positive" | "negative";
  text: string;
}

/** Référence d'une base interrogée (citations: "list"). */
export interface SourceRef {
  title: string;
  /** null pour une base locale sans adresse publique. */
  url: string | null;
}

/** Source numérotée du registre (citations: "inline") : [S3] ↔ n = 3. */
export interface Reference {
  n: number;
  /** Base interrogée, même clé que tools_used et sources. */
  tool: string;
  title: string;
  url: string | null;
  /** true : la base a été interrogée et n'a rien rendu. */
  empty: boolean;
  /** Ce qui a été cherché, pour une source empty. */
  query: string | null;
}

/** Ligne « libellé : valeur » d'une fiche de données. */
export interface RecordLine {
  label: string;
  value: string;
  /** true : la ligne porte un mot de la phrase citée. */
  cited: boolean;
}

/**
 * Extrait de source qui porte la phrase d'un repère (citations: "inline").
 * Prose (quote, before, after) ou fiche de données (record).
 */
export interface Passage {
  /** Rang du repère dans answer, 0 pour le premier. */
  index: number;
  n: number;
  quote: string | null;
  before: string | null;
  after: string | null;
  record: RecordLine[] | null;
  record_title: string | null;
}

/** Mot ambigu qui bloque le routage, et ses corrections proposées. */
export interface Clarification {
  word: string;
  corrections: string[];
  message: string;
}

export interface Usage {
  elapsed_ms: number;
  daily_requests_used: number;
  /** null : clé sans plafond journalier. */
  daily_requests_limit: number | null;
}

/** JSON de POST /v1/ask (objet pharmassistant.answer). */
export interface AskResponse {
  id: string;
  object: "pharmassistant.answer";
  created_at: string;
  status: "ok" | "clarification_needed";
  mode: Mode;
  question: string;
  title: string | null;
  answer: string | null;
  key_points: KeyPoint[];
  patient_advice: string | null;
  associated_sale: string | null;
  clarification: Clarification | null;
  suggestions: string[];
  tools_used: string[];
  sources: Record<string, SourceRef[]>;
  citations: Citations;
  references: Reference[];
  passages: Passage[];
  conversation_id: string | null;
  usage: Usage;
}

export interface KeyInfoResponse {
  id: string;
  name: string;
  key_hint: string;
  pharmacy_slug: string | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  daily_detailed_limit: number | null;
  limits_locked: boolean;
  /** null : toutes les portées. */
  scopes: string[] | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  daily_requests_used: number;
  daily_detailed_used: number;
  month_requests_used: number;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  message_count: number;
  created_at: string | null;
  /** Dernière activité ; purge après 90 jours sans activité. */
  updated_at: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
}

export interface ConversationDetail {
  id: string;
  object: "pharmassistant.conversation";
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  messages: ConversationMessage[];
}

export interface ConversationDeleted {
  id: string;
  object: "pharmassistant.conversation";
  deleted: true;
}

export interface Health {
  status: "ok";
  service: string;
  version: string;
}

/** En-têtes X-RateLimit-* : plafond journalier, restant, remise à zéro. */
export interface RateLimit {
  limit: number;
  remaining: number;
  resetAt: Date | null;
}

/** Un repère [Sn] de la réponse, avec sa référence et son extrait. */
export interface Citation {
  /** 0 pour le premier repère du texte. */
  rank: number;
  n: number;
  reference: Reference | null;
  passage: Passage | null;
  /** Position du repère dans answer. */
  start: number;
  end: number;
}

export function rateLimitDe(headers: Headers): RateLimit | null {
  const limite = Number(headers.get("x-ratelimit-limit") ?? Number.NaN);
  const restant = Number(headers.get("x-ratelimit-remaining") ?? Number.NaN);
  if (!Number.isInteger(limite) || !Number.isInteger(restant)) return null;
  const reset = headers.get("x-ratelimit-reset")?.trim() ?? "";
  return { limit: limite, remaining: restant, resetAt: /^\d+$/.test(reset) ? new Date(Number(reset) * 1000) : null };
}

const REPERE = /\[S(\d+)\]/g;
const REPERES_COLLES = /(?:\[S\d+\])+/g;

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{Mn}/gu, "");
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * La question reformulée avec `correction` à la place du mot ambigu. Même règle
 * que le chat : première occurrence sans égard à la casse, sinon mot à mot sans
 * égard aux accents, sinon correction ajoutée entre parenthèses.
 */
export function correctedQuestion(word: string, question: string, correction: string): string {
  if (!question.trim()) return correction;
  if (word) {
    const exact = new RegExp(echapper(word), "i");
    if (exact.test(question)) return question.replace(exact, () => correction);
  }
  const cible = sansAccents(word).toLowerCase();
  const morceaux = question.split(/(\s+)/);
  const i = morceaux.findIndex(
    (m) => cible !== "" && sansAccents(m).toLowerCase().replace(/[^a-zç]/g, "") === cible);
  if (i >= 0) {
    morceaux[i] = correction;
    return morceaux.join("");
  }
  return `${question} (${correction})`;
}

/**
 * Réponse de POST /v1/ask. Porte les champs du JSON tels quels (`answer`,
 * `patient_advice`…), plus des aides de lecture. `JSON.stringify` rend le JSON
 * d'origine.
 */
export class Answer implements AskResponse {
  declare id: string;
  declare object: "pharmassistant.answer";
  declare created_at: string;
  declare status: "ok" | "clarification_needed";
  declare mode: Mode;
  declare question: string;
  declare title: string | null;
  /** Réponse en markdown, sans marqueur interne ; null sur une demande de précision. */
  declare answer: string | null;
  declare key_points: KeyPoint[];
  /** Discours prêt à tenir au patient (« Au comptoir »). */
  declare patient_advice: string | null;
  declare associated_sale: string | null;
  declare clarification: Clarification | null;
  declare suggestions: string[];
  declare tools_used: string[];
  declare sources: Record<string, SourceRef[]>;
  declare citations: Citations;
  declare references: Reference[];
  declare passages: Passage[];
  declare conversation_id: string | null;
  declare usage: Usage;
  /** En-têtes de quota de la réponse HTTP (hors JSON). */
  declare readonly rateLimit: RateLimit | null;

  constructor(data: Partial<AskResponse>, rateLimit: RateLimit | null = null) {
    Object.assign(this, {
      key_points: [], suggestions: [], tools_used: [], sources: {}, references: [], passages: [],
      citations: "list", clarification: null, conversation_id: null,
    }, data);
    Object.defineProperty(this, "rateLimit", { value: rateLimit, enumerable: false });
  }

  /** Identifiant de requête (req_…), à joindre à toute demande de support. */
  get requestId(): string {
    return this.id;
  }

  get needsClarification(): boolean {
    return this.status === "clarification_needed";
  }

  /** La question reformulée avec une correction proposée (demande de précision). */
  correctedQuestion(correction: string): string {
    return correctedQuestion(this.clarification?.word ?? "", this.question, correction);
  }

  /** La référence numéro n du registre, ou null. */
  reference(n: number): Reference | null {
    return this.references.find((r) => r.n === n) ?? null;
  }

  /** Les repères [Sn] de la réponse, dans l'ordre du texte. */
  *iterCitations(): Generator<Citation> {
    const passages = new Map(this.passages.map((p) => [p.index, p]));
    let rank = 0;
    for (const trouve of (this.answer ?? "").matchAll(REPERE)) {
      const n = Number(trouve[1]);
      const start = trouve.index;
      yield {
        rank, n, reference: this.reference(n), passage: passages.get(rank) ?? null,
        start, end: start + trouve[0].length,
      };
      rank += 1;
    }
  }

  /** La réponse sans ses repères [Sn]. */
  answerWithoutMarkers(): string | null {
    return this.answer === null ? null : this.answer.replace(REPERES_COLLES, "");
  }

  /** Toutes les références, toutes bases confondues, sans doublon. */
  allSources(): SourceRef[] {
    const vues = new Set<string>();
    const sortie: SourceRef[] = [];
    for (const refs of Object.values(this.sources)) {
      for (const ref of refs) {
        const cle = ref.url ?? ref.title;
        if (!vues.has(cle)) {
          vues.add(cle);
          sortie.push(ref);
        }
      }
    }
    return sortie;
  }
}

/** État de la clé (GET /v1/me) : les champs du JSON, plus les restes calculés. */
export class KeyInfo implements KeyInfoResponse {
  declare id: string;
  declare name: string;
  declare key_hint: string;
  declare pharmacy_slug: string | null;
  declare daily_limit: number | null;
  declare monthly_limit: number | null;
  declare daily_detailed_limit: number | null;
  declare limits_locked: boolean;
  declare scopes: string[] | null;
  declare active: boolean;
  declare expires_at: string | null;
  declare created_at: string;
  declare last_used_at: string | null;
  declare daily_requests_used: number;
  declare daily_detailed_used: number;
  declare month_requests_used: number;

  constructor(data: Partial<KeyInfoResponse>) {
    Object.assign(this, { scopes: null, daily_detailed_used: 0, month_requests_used: 0 }, data);
  }

  /** Requêtes restantes aujourd'hui ; null sans plafond journalier. */
  get dailyRemaining(): number | null {
    return this.daily_limit === null || this.daily_limit === undefined
      ? null : Math.max(0, this.daily_limit - this.daily_requests_used);
  }

  /** Requêtes restantes ce mois ; null sans plafond mensuel. */
  get monthlyRemaining(): number | null {
    return this.monthly_limit === null || this.monthly_limit === undefined
      ? null : Math.max(0, this.monthly_limit - this.month_requests_used);
  }

  hasScope(scope: string): boolean {
    return this.scopes === null || this.scopes.includes(scope);
  }
}
