import type { AskOptions } from "./internal/base.js";
import type { Answer, HistoryTurn } from "./models.js";
import type { AnswerStream } from "./stream.js";

export const MAX_HISTORY_TURNS = 12;

/** Options d'une conversation : celles d'ask, sauf ce qu'elle gère elle-même. */
export type ConversationDefaults = Omit<AskOptions, "store" | "conversationId" | "history" | "signal">;

export interface ConversationOptions extends ConversationDefaults {
  /** true : conversation gardée par le serveur ; défaut : historique chez vous. */
  store?: boolean;
  /** Échanges gardés dans l'historique local (défaut 12, comme le serveur). */
  maxHistoryTurns?: number;
}

const RESERVEES = ["store", "history", "conversationId"] as const;

export interface Poseur {
  ask(question: string, options?: AskOptions): Promise<Answer>;
  askStreamAvecSuivi(question: string, options: AskOptions, onDone: (r: Answer) => void): AnswerStream;
  supprimer(conversationId: string): Promise<unknown>;
}

/** Conversation suivie par le client : chaque ask() poursuit la précédente. */
export class Conversation {
  private _id: string | null;
  private _history: HistoryTurn[] = [];
  private _lastAnswer: Answer | null = null;
  private readonly store: boolean;
  private readonly maxHistoryTurns: number;
  private readonly defaults: ConversationDefaults;

  constructor(private readonly client: Poseur, options: ConversationOptions = {}, conversationId: string | null = null) {
    const { store = false, maxHistoryTurns = MAX_HISTORY_TURNS, ...defaults } = options;
    const interdites = RESERVEES.filter((cle) => cle !== "store" && cle in defaults);
    if (interdites.length) throw new TypeError(`${interdites.join(", ")} : géré par la conversation.`);
    if (conversationId && !store) {
      throw new TypeError("Une conversation reprise par son id est gardée par le serveur (store: true).");
    }
    this.store = store;
    this.maxHistoryTurns = maxHistoryTurns;
    this.defaults = defaults;
    this._id = conversationId;
  }

  /** Id conv_… (gardée par le serveur, après le premier tour), sinon null. */
  get id(): string | null {
    return this._id;
  }

  get isStored(): boolean {
    return this.store;
  }

  /** Historique local (copie), pour une conversation non gardée. */
  get history(): HistoryTurn[] {
    return this._history.map((t) => ({ ...t }));
  }

  get lastAnswer(): Answer | null {
    return this._lastAnswer;
  }

  /** Comme client.ask(), dans la suite de la conversation. */
  async ask(question: string, options: Omit<AskOptions, "store" | "conversationId" | "history"> = {}): Promise<Answer> {
    const reponse = await this.client.ask(question, this.options(options));
    this.noter(question, reponse);
    return reponse;
  }

  /** Comme client.askStream() ; la conversation se met à jour à l'événement done. */
  askStream(question: string, options: Omit<AskOptions, "store" | "conversationId" | "history"> = {}): AnswerStream {
    return this.client.askStreamAvecSuivi(question, this.options(options), (r) => this.noter(question, r));
  }

  /** Efface la conversation côté serveur (gardée) et repart à zéro. */
  async delete(): Promise<void> {
    if (this.store && this._id) await this.client.supprimer(this._id);
    this.reset();
  }

  /** Repart à zéro sans rien effacer côté serveur. */
  reset(): void {
    this._id = null;
    this._history = [];
    this._lastAnswer = null;
  }

  private options(options: AskOptions): AskOptions {
    const interdites = RESERVEES.filter((cle) => cle in options);
    if (interdites.length) throw new TypeError(`${interdites.join(", ")} : géré par la conversation.`);
    const sortie: AskOptions = { ...this.defaults, ...options };
    if (this.store) {
      if (this._id) sortie.conversationId = this._id;
      else sortie.store = true;
    } else if (this._history.length) {
      sortie.history = this.history;
    }
    return sortie;
  }

  private noter(question: string, reponse: Answer): void {
    this._lastAnswer = reponse;
    if (this.store) {
      this._id = reponse.conversation_id ?? this._id;
      return;
    }
    const texte = reponse.answer !== null ? reponse.answerWithoutMarkers() : reponse.clarification?.message;
    if (!texte) return;
    this._history.push({ role: "user", content: question }, { role: "assistant", content: texte });
    this._history = this._history.slice(-2 * this.maxHistoryTurns);
  }
}
