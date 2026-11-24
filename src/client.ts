import { Conversation, type ConversationOptions, type ConversationDefaults, type Poseur } from "./conversation.js";
import { APIConnectionError, ConfigurationError } from "./errors.js";
import {
  type AskOptions, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT, type Journal, attendre, codeDErreur, corpsAsk,
  dansUnNavigateur, delaiDeReessai, erreurDeReponse, erreurReseau, journalParDefaut, natureReseau,
  resoudreCle, resoudreUrl, userAgent,
} from "./internal/base.js";
import { Echeance, combiner } from "./internal/echeance.js";
import {
  Answer, type AskResponse, type ConversationDeleted, type ConversationDetail, type ConversationSummary,
  type Health, KeyInfo, type KeyInfoResponse, rateLimitDe,
} from "./models.js";
import { AnswerStream, type Ouverture } from "./stream.js";

export interface ClientOptions {
  /** Clé pa_… ; défaut : PHARMASSISTANT_API_KEY. */
  apiKey?: string;
  /** Défaut : PHARMASSISTANT_API_URL, sinon https://api.pharmassistant.fr. */
  baseUrl?: string;
  /** Délai en millisecondes (défaut 300 000) ; en flux, délai d'inactivité. */
  timeout?: number;
  /** @deprecated Nom du fichier unique ; utilisez timeout. */
  timeoutMs?: number;
  /** Nouveaux essais quand rien n'a pu être décompté (défaut 2 ; 0 pour aucun). */
  maxRetries?: number;
  /** En-têtes ajoutés à chaque requête. */
  defaultHeaders?: Record<string, string>;
  /** fetch fourni (proxy, tests) ; défaut : le fetch global. */
  fetch?: typeof fetch;
  /** Journal des requêtes et des nouveaux essais ; défaut : PHARMASSISTANT_LOG. */
  logger?: Journal;
  /** Autorise l'usage dans un navigateur : la clé y serait lisible par tous. */
  dangerouslyAllowBrowser?: boolean;
}

interface Requete {
  body?: unknown;
  params?: Record<string, string | number>;
  signal?: AbortSignal | undefined;
  timeout?: number | undefined;
  auth?: boolean;
  flux?: boolean;
}

/** Conversations gardées par le serveur ; appelable comme list() pour le fichier unique. */
export interface Conversations {
  (limit?: number): Promise<ConversationSummary[]>;
  /** La plus récemment active d'abord. */
  list(limit?: number): Promise<ConversationSummary[]>;
  /** Titre, dates et tous les tours. */
  retrieve(conversationId: string): Promise<ConversationDetail>;
  /** Suppression immédiate et définitive. */
  delete(conversationId: string): Promise<ConversationDeleted>;
}

/**
 * Client de l'API PharmAssistant.
 *
 *     import { PharmAssistant } from "pharmassistant";
 *
 *     const client = new PharmAssistant();          // clé : PHARMASSISTANT_API_KEY
 *     const reponse = await client.ask("Amoxicilline et allaitement ?");
 *     console.log(reponse.answer);
 *
 * Côté serveur seulement : Node.js 20+, Deno, Bun, Cloudflare Workers.
 */
export class PharmAssistant implements Poseur {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly conversations: Conversations;
  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetcher: typeof fetch;
  private readonly logger: Journal;
  /** Remplaçable dans les tests. */
  protected attendre: (ms: number, signal?: AbortSignal) => Promise<void> = attendre;

  constructor(apiKeyOrOptions?: string | ClientOptions, options: ClientOptions = {}) {
    const opts: ClientOptions = typeof apiKeyOrOptions === "string"
      ? { ...options, apiKey: apiKeyOrOptions } : { ...apiKeyOrOptions, ...options };
    if (dansUnNavigateur() && !opts.dangerouslyAllowBrowser) {
      throw new ConfigurationError("Client utilisé dans un navigateur : la clé d'API y serait lisible par tous.", {
        aide: "Appelez PharmAssistant depuis votre serveur, et faites-y passer les questions de "
          + "l'interface. L'API n'ouvre d'ailleurs pas de CORS.",
      });
    }
    this.apiKey = resoudreCle(opts.apiKey);
    this.baseUrl = resoudreUrl(opts.baseUrl);
    this.timeout = opts.timeout ?? opts.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!(this.timeout > 0)) throw new TypeError("timeout doit être un nombre de millisecondes positif.");
    if (!(Number.isInteger(this.maxRetries) && this.maxRetries >= 0)) {
      throw new TypeError("maxRetries doit être un entier positif ou nul.");
    }
    this.defaultHeaders = { ...opts.defaultHeaders };
    const fetcher = opts.fetch ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      throw new ConfigurationError("fetch est absent de cet environnement.", {
        aide: "Passez Node.js 20 ou plus récent, ou fournissez fetch dans les options.",
      });
    }
    this.fetcher = fetcher;
    this.logger = opts.logger ?? journalParDefaut();
    this.conversations = this.ressourceConversations();
  }

  /** Copie du client avec d'autres réglages. */
  withOptions(options: Omit<ClientOptions, "apiKey">): PharmAssistant {
    const copie = new PharmAssistant({
      apiKey: this.apiKey, baseUrl: this.baseUrl, timeout: this.timeout, maxRetries: this.maxRetries,
      defaultHeaders: this.defaultHeaders, fetch: this.fetcher, logger: this.logger,
      dangerouslyAllowBrowser: true, ...options,
    });
    copie.attendre = this.attendre;
    return copie;
  }

  /**
   * Pose une question et rend la réponse complète.
   *
   * Une réponse peut demander une précision : `reponse.needsClarification`,
   * puis `client.ask(reponse.correctedQuestion(reponse.clarification.corrections[0]))`.
   */
  async ask(question: string, options: AskOptions = {}): Promise<Answer> {
    const corps = corpsAsk(question, options);
    const reponse = await this.envoyer("POST", "/v1/ask", { body: corps, signal: options.signal, timeout: options.timeout });
    return new Answer(await this.lireJson<AskResponse>(reponse.reponse, reponse.echeance), rateLimitDe(reponse.reponse.headers));
  }

  /**
   * Pose une question et rend la réponse en flux. La requête part à la première
   * lecture ; un refus (clé, quota) est levé à ce moment.
   *
   *     const flux = client.askStream("Amoxicilline et allaitement ?");
   *     for await (const texte of flux.textStream) process.stdout.write(texte);
   *     const reponse = await flux.finalAnswer();
   */
  askStream(question: string, options: AskOptions = {}): AnswerStream {
    return this.askStreamAvecSuivi(question, options);
  }

  /** @internal */
  askStreamAvecSuivi(question: string, options: AskOptions, onDone?: (r: Answer) => void): AnswerStream {
    const corps = corpsAsk(question, options, true);
    return new AnswerStream(async (abandon): Promise<Ouverture> => {
      const signal = combiner(options.signal, abandon);
      return this.envoyer("POST", "/v1/ask", { body: corps, signal, timeout: options.timeout, flux: true });
    }, onDone);
  }

  /** État de la clé : plafonds, portées, consommation du jour et du mois. */
  async me(options: { signal?: AbortSignal } = {}): Promise<KeyInfo> {
    const { reponse, echeance } = await this.envoyer("GET", "/v1/me", { signal: options.signal });
    return new KeyInfo(await this.lireJson<KeyInfoResponse>(reponse, echeance));
  }

  /** Disponibilité du service (sans authentification). */
  async health(options: { signal?: AbortSignal } = {}): Promise<Health> {
    const { reponse, echeance } = await this.envoyer("GET", "/v1/health", { signal: options.signal, auth: false });
    return this.lireJson<Health>(reponse, echeance);
  }

  /**
   * Ouvre une conversation : chaque ask() poursuit la précédente. Défaut :
   * historique chez vous ; store: true pour une conversation gardée par le serveur.
   */
  startConversation(options: ConversationOptions = {}): Conversation {
    return new Conversation(this, options);
  }

  /** Reprend une conversation gardée par le serveur, par son id conv_…. */
  resumeConversation(conversationId: string, defaults: ConversationDefaults = {}): Conversation {
    return new Conversation(this, { ...defaults, store: true }, conversationId);
  }

  /** Alias de conversations.retrieve(). */
  conversation(conversationId: string): Promise<ConversationDetail> {
    return this.conversations.retrieve(conversationId);
  }

  /** Alias de conversations.delete(). */
  deleteConversation(conversationId: string): Promise<ConversationDeleted> {
    return this.conversations.delete(conversationId);
  }

  /** @internal */
  supprimer(conversationId: string): Promise<ConversationDeleted> {
    return this.conversations.delete(conversationId);
  }

  private ressourceConversations(): Conversations {
    const list = async (limit = 50): Promise<ConversationSummary[]> => {
      const { reponse, echeance } = await this.envoyer("GET", "/v1/conversations", { params: { limit } });
      return (await this.lireJson<{ data: ConversationSummary[] }>(reponse, echeance)).data ?? [];
    };
    const chemin = (id: string) => `/v1/conversations/${encodeURIComponent(id)}`;
    return Object.assign((limit?: number) => list(limit), {
      list,
      retrieve: async (id: string) => {
        const { reponse, echeance } = await this.envoyer("GET", chemin(id));
        return this.lireJson<ConversationDetail>(reponse, echeance);
      },
      delete: async (id: string) => {
        const { reponse, echeance } = await this.envoyer("DELETE", chemin(id));
        return this.lireJson<ConversationDeleted>(reponse, echeance);
      },
    });
  }

  private entetes(requete: Requete): Record<string, string> {
    const entetes: Record<string, string> = {
      "User-Agent": userAgent(),
      Accept: requete.flux ? "text/event-stream" : "application/json",
      ...this.defaultHeaders,
    };
    if (requete.body !== undefined) entetes["Content-Type"] = "application/json";
    if (requete.auth !== false) entetes["X-API-Key"] = this.apiKey;
    return entetes;
  }

  private async envoyer(methode: string, chemin: string, requete: Requete = {}): Promise<Ouverture> {
    let url = this.baseUrl + chemin;
    if (requete.params) {
      url += `?${new URLSearchParams(Object.entries(requete.params).map(([k, v]) => [k, String(v)]))}`;
    }
    const init = { method: methode, headers: this.entetes(requete),
      body: requete.body !== undefined ? JSON.stringify(requete.body) : null };
    for (let tentative = 0; ; tentative += 1) {
      const echeance = new Echeance(requete.timeout ?? this.timeout, requete.signal);
      const debut = Date.now();
      let reponse: Response;
      try {
        reponse = await this.fetcher(url, { ...init, signal: echeance.signal });
      } catch (erreur) {
        echeance.arreter();
        if ((erreur as { name?: string } | null)?.name === "AbortError") throw erreur;
        const reseau = natureReseau(erreur);
        const delai = (erreur as { name?: string } | null)?.name === "TimeoutError"
          ? null : delaiDeReessai(tentative, this.maxRetries, methode, { reseau });
        if (delai === null) throw erreurReseau(erreur);
        this.journalReessai(methode, chemin, tentative, delai, reseau === "connexion" ? "connexion impossible" : "lecture coupée");
        await this.attendre(delai, requete.signal);
        continue;
      }
      if (reponse.status >= 400) {
        const code = await codeDErreur(reponse);
        const delai = delaiDeReessai(tentative, this.maxRetries, methode, {
          status: reponse.status, code, retryAfter: reponse.headers.get("retry-after"),
        });
        if (delai !== null) {
          echeance.arreter();
          await reponse.body?.cancel().catch(() => undefined);
          this.journalReessai(methode, chemin, tentative, delai, code ?? `HTTP ${reponse.status}`);
          await this.attendre(delai, requete.signal);
          continue;
        }
        echeance.arreter();
        throw await erreurDeReponse(reponse);
      }
      this.logger.debug(`${methode} ${chemin} → ${reponse.status} en ${((Date.now() - debut) / 1000).toFixed(2).replace(".", ",")} s (${reponse.headers.get("x-request-id") ?? "sans id"})`);
      return { reponse, echeance };
    }
  }

  private async lireJson<T>(reponse: Response, echeance: Echeance): Promise<T> {
    let brut: string;
    try {
      brut = await reponse.text();
    } catch (erreur) {
      if ((erreur as { name?: string } | null)?.name === "AbortError") throw erreur;
      throw erreurReseau(erreur, reponse.headers.get("x-request-id"));
    } finally {
      echeance.arreter();
    }
    try {
      return JSON.parse(brut) as T;
    } catch {
      throw new APIConnectionError(
        `Réponse illisible (HTTP ${reponse.status}, ${reponse.headers.get("content-type") ?? "sans type"}).`, {
          code: "invalid_response", requestId: reponse.headers.get("x-request-id"),
          aide: "Vérifiez baseUrl : un proxy ou un portail captif répond peut-être à la place de l'API.",
        });
    }
  }

  private journalReessai(methode: string, chemin: string, tentative: number, delai: number, motif: string): void {
    this.logger.warn(`${methode} ${chemin} : ${motif}, nouvel essai ${tentative + 1}/${this.maxRetries} `
      + `dans ${(delai / 1000).toFixed(1).replace(".", ",")} s`);
  }
}
