/**
 * Délai d'une requête, réarmable : en flux, il mesure l'inactivité, pas la durée
 * totale. L'annulation de l'appelant est relayée telle quelle.
 */
export class Echeance {
  readonly controleur = new AbortController();
  private minuteur: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly ms: number, signal?: AbortSignal) {
    if (signal) {
      if (signal.aborted) this.controleur.abort(signal.reason);
      else signal.addEventListener("abort", () => this.controleur.abort(signal.reason), { once: true });
    }
    this.armer();
  }

  get signal(): AbortSignal {
    return this.controleur.signal;
  }

  armer(): void {
    clearTimeout(this.minuteur);
    if (this.controleur.signal.aborted) return;
    this.minuteur = setTimeout(
      () => this.controleur.abort(new DOMException("Délai dépassé.", "TimeoutError")), this.ms);
  }

  arreter(): void {
    clearTimeout(this.minuteur);
  }
}

/** Signal qui s'abandonne dès que l'un des signaux donnés s'abandonne. */
export function combiner(...signaux: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const presents = signaux.filter((s): s is AbortSignal => s !== undefined);
  if (presents.length <= 1) return presents[0];
  const controleur = new AbortController();
  for (const signal of presents) {
    if (signal.aborted) {
      controleur.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controleur.abort(signal.reason), { once: true });
  }
  return controleur.signal;
}
