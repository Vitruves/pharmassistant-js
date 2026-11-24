import { APIConnectionError, type PharmAssistantError, erreurDApi } from "./errors.js";
import type { Echeance } from "./internal/echeance.js";
import { erreurReseau } from "./internal/base.js";
import { Answer, type RateLimit, type Reference, rateLimitDe } from "./models.js";

/** Événements du flux, dans l'ordre où ils arrivent. */
export const EVENEMENTS = ["start", "status", "references", "chunk", "done", "error"] as const;

/**
 * Un événement du flux. Un événement error n'est jamais rendu : il lève
 * l'exception typée.
 */
export type StreamEvent =
  | { event: "start"; data: { id: string; object?: string; mode: string; question: string; conversation_id: string | null } }
  | { event: "status"; data: { state: "routing" | "tools_running" | "generating"; tools?: string[] } }
  | { event: "references"; data: { references: Reference[] } }
  | { event: "chunk"; data: { text: string } }
  | { event: "done"; data: Answer };

/** Assemble les lignes SSE en couples (événement, données brutes). */
export class LecteurSSE {
  private evenement: string | null = null;
  private donnees: string[] = [];

  ligne(brute: string): [string, string] | null {
    const ligne = brute.endsWith("\r") ? brute.slice(0, -1) : brute;
    if (!ligne) {
      if (!this.donnees.length && this.evenement === null) return null;
      const sortie: [string, string] = [this.evenement ?? "message", this.donnees.join("\n")];
      this.evenement = null;
      this.donnees = [];
      return sortie;
    }
    if (ligne.startsWith(":")) return null;
    const deuxPoints = ligne.indexOf(":");
    const champ = deuxPoints < 0 ? ligne : ligne.slice(0, deuxPoints);
    let valeur = deuxPoints < 0 ? "" : ligne.slice(deuxPoints + 1);
    if (valeur.startsWith(" ")) valeur = valeur.slice(1);
    if (champ === "event") this.evenement = valeur;
    else if (champ === "data") this.donnees.push(valeur);
    return null;
  }

  fin(): [string, string] | null {
    return this.donnees.length ? this.ligne("") : null;
  }
}

export function decoder(evenement: string, brut: string, requestId: string | null): StreamEvent {
  let donnees: unknown;
  try {
    donnees = brut ? JSON.parse(brut) : {};
  } catch {
    donnees = { raw: brut };
  }
  if (evenement === "error") throw erreurDApi(null, donnees, { requestId });
  if (evenement === "done") return { event: "done", data: new Answer(donnees as Answer) };
  return { event: evenement, data: donnees } as StreamEvent;
}

export interface Ouverture {
  reponse: Response;
  echeance: Echeance;
}

/**
 * Réponse en flux. Itérable avec `for await`, une seule fois ; la requête part
 * à la première lecture.
 *
 *     const flux = client.askStream("Amoxicilline et allaitement ?");
 *     for await (const texte of flux.textStream) process.stdout.write(texte);
 *     const reponse = await flux.finalAnswer();
 */
export class AnswerStream implements AsyncIterable<StreamEvent> {
  private iterateur: AsyncGenerator<StreamEvent> | undefined;
  private readonly abandon = new AbortController();
  private _requestId: string | null = null;
  private _references: Reference[] = [];
  private _answer: Answer | null = null;
  private _rateLimit: RateLimit | null = null;

  constructor(
    private readonly ouvrir: (signal: AbortSignal) => Promise<Ouverture>,
    private readonly onDone?: (reponse: Answer) => void,
  ) {}

  /** Identifiant de requête (req_…), connu dès l'événement start. */
  get requestId(): string | null {
    return this._requestId;
  }

  /** Registre des sources (citations: "inline"), connu avant le premier fragment. */
  get references(): Reference[] {
    return this._references;
  }

  /** La réponse complète, une fois l'événement done reçu. */
  get answer(): Answer | null {
    return this._answer;
  }

  get rateLimit(): RateLimit | null {
    return this._rateLimit;
  }

  [Symbol.asyncIterator](): AsyncGenerator<StreamEvent> {
    this.iterateur ??= this.evenements();
    return this.iterateur;
  }

  /** Les seuls fragments de texte, dans l'ordre. */
  get textStream(): AsyncIterable<string> {
    const flux = this;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const evt of flux) {
          if (evt.event === "chunk") yield evt.data.text;
        }
      },
    };
  }

  /** Consomme le reste du flux et rend la réponse complète. */
  async finalAnswer(): Promise<Answer> {
    for await (const _ of this) {
      // consommé pour atteindre done
    }
    if (this._answer === null) throw this.interrompu();
    return this._answer;
  }

  /** Arrête le flux et libère la connexion. */
  abort(): void {
    this.abandon.abort(new DOMException("Flux arrêté par l'appelant.", "AbortError"));
  }

  private interrompu(): APIConnectionError {
    return new APIConnectionError("Le flux s'est arrêté avant l'événement done.", {
      code: "stream_interrupted", requestId: this._requestId,
    });
  }

  private noter(evt: StreamEvent): void {
    if (evt.event === "start") this._requestId = evt.data.id ?? null;
    else if (evt.event === "references") this._references = evt.data.references ?? [];
    else if (evt.event === "done") {
      Object.defineProperty(evt.data, "rateLimit", { value: this._rateLimit, enumerable: false });
      this._answer = evt.data;
      this.onDone?.(evt.data);
    }
  }

  private async *evenements(): AsyncGenerator<StreamEvent> {
    const { reponse, echeance } = await this.ouvrir(this.abandon.signal);
    this._rateLimit = rateLimitDe(reponse.headers);
    const lecteur = reponse.body?.getReader();
    if (!lecteur) throw this.interrompu();
    const sse = new LecteurSSE();
    const texte = new TextDecoder();
    let tampon = "";
    let termine = false;
    try {
      for (;;) {
        let lu: ReadableStreamReadResult<Uint8Array>;
        try {
          lu = await lecteur.read();
        } catch (erreur) {
          throw this.coupure(erreur);
        }
        if (this.abandon.signal.aborted) throw this.abandon.signal.reason;
        echeance.armer();
        tampon += lu.done ? texte.decode() : texte.decode(lu.value, { stream: true });
        const lignes = tampon.split("\n");
        tampon = lu.done ? "" : (lignes.pop() ?? "");
        if (lu.done && lignes.at(-1) === "") lignes.pop();
        for (const ligne of lignes) {
          if (this.abandon.signal.aborted) throw this.abandon.signal.reason;
          const brut = sse.ligne(ligne);
          if (brut === null) continue;
          const evt = decoder(brut[0], brut[1], this._requestId);
          this.noter(evt);
          yield evt;
          if (evt.event === "done") {
            termine = true;
            return;
          }
        }
        if (lu.done) break;
      }
      const reste = sse.fin();
      if (reste !== null) {
        const evt = decoder(reste[0], reste[1], this._requestId);
        this.noter(evt);
        yield evt;
        if (evt.event === "done") {
          termine = true;
          return;
        }
      }
      throw this.interrompu();
    } finally {
      echeance.arreter();
      if (!termine) await lecteur.cancel().catch(() => undefined);
      lecteur.releaseLock();
    }
  }

  private coupure(erreur: unknown): unknown {
    const nom = (erreur as { name?: string } | null)?.name;
    if (nom === "AbortError") return erreur;
    if (nom === "TimeoutError") return erreurReseau(erreur, this._requestId);
    return new APIConnectionError(`Flux coupé : ${erreur instanceof Error ? erreur.message : String(erreur)}.`, {
      code: "stream_interrupted", requestId: this._requestId,
    }) satisfies PharmAssistantError;
  }
}
