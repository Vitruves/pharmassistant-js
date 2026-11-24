/** Fiche d'un code d'erreur : statut HTTP, sens, conduite à tenir. */
export interface CodeErreur {
  readonly status: number | null;
  readonly sens: string;
  readonly aide: string;
  /** true : la requête a pu être décomptée. */
  readonly decompte: boolean;
}

export interface ErrorInit {
  code?: string | null;
  status?: number | null;
  requestId?: string | null;
  details?: unknown;
  aide?: string | null;
  headers?: Record<string, string>;
}

/**
 * Erreur du client PharmAssistant. Toutes les erreurs en héritent.
 *
 * `code` est le code machine stable, `aide` dit quoi faire, `requestId` est à
 * joindre à toute demande de support.
 */
export class PharmAssistantError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly details: unknown;
  readonly aide: string | null;
  readonly headers: Readonly<Record<string, string>>;

  constructor(message: string, init: ErrorInit = {}) {
    super(message);
    this.name = new.target.name;
    this.code = init.code ?? null;
    this.status = init.status ?? null;
    this.requestId = init.requestId ?? null;
    this.details = init.details;
    this.headers = init.headers ?? {};
    this.aide = init.aide !== undefined ? init.aide : (CODES[this.code ?? ""]?.aide ?? null);
  }

  override toString(): string {
    let tete = this.code ? `${this.code}: ${this.message}` : this.message;
    if (this.status) tete = `[${this.status}] ${tete}`;
    const lignes = [`${this.name} ${tete}`];
    if (this.aide) lignes.push(`Aide : ${this.aide}`);
    if (this.requestId) lignes.push(`Requête : ${this.requestId}`);
    return lignes.join("\n");
  }
}

/** Client mal configuré : clé absente ou mal formée, URL invalide, navigateur. */
export class ConfigurationError extends PharmAssistantError {}

/** Le serveur n'a pas pu être joint, ou la réponse a été coupée. */
export class APIConnectionError extends PharmAssistantError {}

/** Délai dépassé. */
export class APITimeoutError extends APIConnectionError {}

/** L'API a répondu par une erreur (statut HTTP ou événement error du flux). */
export class APIStatusError extends PharmAssistantError {}

/** 401 : clé absente, inconnue, révoquée ou expirée. */
export class AuthenticationError extends APIStatusError {}

/** 403 : portée manquante, pharmacie liée introuvable ou suspendue. */
export class PermissionDeniedError extends APIStatusError {}

/** 404 : ressource inconnue pour cette clé. */
export class NotFoundError extends APIStatusError {}

/** 404 : conversation inconnue, supprimée ou purgée (90 jours d'inactivité). */
export class ConversationNotFoundError extends NotFoundError {}

/** 422 : corps refusé ; `details` donne le motif champ par champ. */
export class InvalidRequestError extends APIStatusError {}

/** 429 rate_limited : rafale. `retryAfter` (secondes) dit quand réessayer. */
export class RateLimitError extends APIStatusError {
  get retryAfter(): number | null {
    const valeur = Number(this.headers["retry-after"]);
    return this.headers["retry-after"] !== undefined && Number.isFinite(valeur)
      ? Math.max(0, valeur) : null;
  }
}

/**
 * 429 : plafond journalier, mensuel ou Détaillé atteint. `resetAt` : prochaine
 * remise à zéro du compteur journalier ; le plafond mensuel revient le 1er.
 */
export class QuotaExceededError extends APIStatusError {
  get resetAt(): Date | null {
    const brut = this.headers["x-ratelimit-reset"];
    return brut && /^\d+$/.test(brut.trim()) ? new Date(Number(brut) * 1000) : null;
  }
}

/** 5xx : échec côté serveur. La requête n'est pas décomptée. */
export class ServerError extends APIStatusError {}

const A_REESSAYER = "Réessayez ; la requête n'est pas décomptée. Si l'erreur persiste, écrivez à "
  + "contact@pharmassistant.fr avec l'identifiant de requête.";

/** Chaque code d'erreur connu, avec son sens et la conduite à tenir. */
export const CODES: Readonly<Record<string, CodeErreur>> = {
  missing_api_key: {
    status: 401, sens: "Aucune clé d'API n'a été envoyée.", decompte: false,
    aide: "Passez apiKey: \"pa_…\" au client ou définissez PHARMASSISTANT_API_KEY.",
  },
  invalid_api_key: {
    status: 401, sens: "Clé d'API inconnue ou mal formée.", decompte: false,
    aide: "Vérifiez la clé copiée depuis le portail (elle commence par pa_). Une clé perdue "
      + "ne se retrouve pas : régénérez-la depuis le portail.",
  },
  revoked_api_key: {
    status: 401, sens: "La clé a été révoquée.", decompte: false,
    aide: "Générez une nouvelle clé depuis le portail, ou écrivez à contact@pharmassistant.fr.",
  },
  expired_api_key: {
    status: 401, sens: "La clé a dépassé sa date de péremption.", decompte: false,
    aide: "Repoussez la péremption ou générez une nouvelle clé depuis le portail.",
  },
  pharmacy_not_found: {
    status: 403, sens: "La pharmacie liée à la clé est introuvable.", decompte: false,
    aide: "Écrivez à contact@pharmassistant.fr avec l'identifiant de requête.",
  },
  pharmacy_suspended: {
    status: 403, sens: "La pharmacie liée à la clé est suspendue.", decompte: false,
    aide: "Vérifiez l'abonnement de la pharmacie, ou écrivez à contact@pharmassistant.fr.",
  },
  scope_denied: {
    status: 403, decompte: false,
    sens: "La clé n'a pas la portée demandée (ask:detailed pour mode: \"detailed\").",
    aide: "Posez la question en mode standard, ou demandez la portée ask:detailed à "
      + "contact@pharmassistant.fr.",
  },
  conversation_not_found: {
    status: 404, decompte: false,
    sens: "Conversation inconnue pour cette clé : id erroné, supprimée, ou purgée après 90 "
      + "jours d'inactivité.",
    aide: "Ouvrez une nouvelle conversation (store: true). Requête non décomptée.",
  },
  not_found: {
    status: 404, sens: "Adresse inconnue de l'API.", decompte: false,
    aide: "Vérifiez baseUrl (défaut https://api.pharmassistant.fr).",
  },
  invalid_request: {
    status: 422, decompte: false,
    sens: "Requête refusée par la validation (question vide ou trop longue, history mêlé à "
      + "store ou conversationId…).",
    aide: "Lisez error.details : chaque entrée nomme le champ fautif et la règle enfreinte.",
  },
  rate_limited: {
    status: 429, sens: "Trop de requêtes rapprochées sur la clé (anti-rafale par minute).",
    decompte: false,
    aide: "Le client réessaie seul après le délai Retry-After (maxRetries). Espacez les "
      + "requêtes. Requête non décomptée.",
  },
  daily_limit_reached: {
    status: 429, sens: "Plafond journalier de la clé atteint.", decompte: false,
    aide: "Attendez minuit (heure de Paris), ou relevez le plafond depuis le portail s'il "
      + "n'est pas verrouillé. Requête non décomptée.",
  },
  monthly_limit_reached: {
    status: 429, sens: "Plafond mensuel de la clé atteint.", decompte: false,
    aide: "Attendez le 1er du mois (heure de Paris), ou relevez le plafond depuis le portail "
      + "s'il n'est pas verrouillé. Requête non décomptée.",
  },
  detailed_limit_reached: {
    status: 429, sens: "Sous-plafond journalier du mode Détaillé atteint.", decompte: false,
    aide: "Reposez la question en mode standard, ou attendez minuit (heure de Paris). Requête "
      + "non décomptée.",
  },
  internal_error: { status: 500, sens: "Erreur interne du serveur.", aide: A_REESSAYER, decompte: false },
  generation_failed: {
    status: 502, sens: "La rédaction de la réponse a échoué.", aide: A_REESSAYER, decompte: false,
  },
  empty_response: {
    status: 502, sens: "Le moteur n'a produit aucune réponse exploitable.", aide: A_REESSAYER,
    decompte: false,
  },
  connection_error: {
    status: null, sens: "Le serveur n'a pas pu être joint (réseau, DNS, pare-feu, proxy).",
    decompte: false,
    aide: "Vérifiez la connexion et baseUrl. Rien n'a été décompté.",
  },
  timeout: {
    status: null, sens: "Délai dépassé avant la fin de la réponse.", decompte: true,
    aide: "Augmentez timeout (le mode Détaillé peut dépasser deux minutes), ou passez par "
      + "askStream. La requête a pu être décomptée : elle n'est pas réessayée seule.",
  },
  stream_interrupted: {
    status: null, sens: "Le flux s'est arrêté avant l'événement done.", decompte: true,
    aide: "Reposez la question. La requête a pu être décomptée.",
  },
};

type ClasseStatut = new (message: string, init?: ErrorInit) => APIStatusError;

const PAR_CODE: Record<string, ClasseStatut> = {
  conversation_not_found: ConversationNotFoundError,
  rate_limited: RateLimitError,
  daily_limit_reached: QuotaExceededError,
  monthly_limit_reached: QuotaExceededError,
  detailed_limit_reached: QuotaExceededError,
};

const PAR_STATUT: Record<number, ClasseStatut> = {
  401: AuthenticationError,
  403: PermissionDeniedError,
  404: NotFoundError,
  422: InvalidRequestError,
  429: RateLimitError,
};

export function classeDe(status: number | null, code: string | null): ClasseStatut {
  if (code && PAR_CODE[code]) return PAR_CODE[code];
  const statut = status ?? (code ? CODES[code]?.status ?? null : null);
  if (statut === null) return APIStatusError;
  if (PAR_STATUT[statut]) return PAR_STATUT[statut];
  return statut >= 500 ? ServerError : APIStatusError;
}

/** Erreur typée depuis l'enveloppe {"error": {code, message, details}}. */
export function erreurDApi(
  status: number | null,
  corps: unknown,
  options: { headers?: Record<string, string>; requestId?: string | null; brut?: string } = {},
): APIStatusError {
  const enveloppe = (corps && typeof corps === "object" ? (corps as { error?: unknown }).error : null);
  const info = (enveloppe && typeof enveloppe === "object" ? enveloppe : {}) as
    { code?: string; message?: string; details?: unknown };
  const code = info.code ?? (status ? `http_${status}` : "api_error");
  const brut = (options.brut ?? "").trim();
  const message = info.message ?? (brut ? brut.slice(0, 300) : `Réponse HTTP ${status} sans enveloppe d'erreur.`);
  const statut = status ?? CODES[code]?.status ?? null;
  const Classe = classeDe(statut, code);
  return new Classe(message, {
    code, status: statut, requestId: options.requestId ?? null, details: info.details,
    headers: options.headers ?? {},
  });
}
