// Kosten eines Sprachmodell-Aufrufs aus den Token-Zahlen, die Anthropic mit jeder Antwort meldet.
// Ins Protokoll kommen nur diese Zahlen, nie Texte (CLAUDE.md).

/** Token-Zahlen eines Aufrufs (Feld `usage` der Messages-API). */
export interface LlmUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const ZERO_USAGE: LlmUsage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

/** Preise in US-Dollar je Million Token. */
export interface LlmPrices {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Listenpreise laut https://platform.claude.com/docs/en/about-claude/pricing (abgerufen 14.11.2026).
 * Cache schreiben = 5-Minuten-Cache (so setzt llm.ts cache_control). Haiku: Stufe bis 100 000 Token
 * Eingabe (unsere Anfragen sind weit kleiner). Andere Modelle: Preise über PICASTAI_LLM_PRICES setzen.
 */
export const LIST_PRICES: Record<'sonnet' | 'haiku' | 'opus', LlmPrices> = {
  sonnet: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  haiku: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  opus: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};

/**
 * Preise für ein Modell. `override` hat das Format "Eingabe,Ausgabe,CacheSchreiben,CacheLesen"
 * (Dollar je Million Token, zum Beispiel "2,10,2.5,0.1"). Ohne gültige Angabe gilt die Liste nach
 * dem Modellnamen; unbekannte Modelle ergeben null (dann keine Kosten, nur Token im Protokoll).
 */
export function pricesFor(model: string, override = ''): LlmPrices | null {
  const parts = override.split(',').map((value) => Number(value.trim()));
  if (parts.length === 4 && parts.every((value) => Number.isFinite(value) && value >= 0) && override.trim()) {
    return { input: parts[0], output: parts[1], cacheWrite: parts[2], cacheRead: parts[3] };
  }
  const name = model.toLowerCase();
  if (name.includes('sonnet')) return LIST_PRICES.sonnet;
  if (name.includes('haiku')) return LIST_PRICES.haiku;
  if (name.includes('opus')) return LIST_PRICES.opus;
  return null;
}

/** Kosten in US-Dollar. */
export function costUsd(usage: LlmUsage, prices: LlmPrices): number {
  return (
    usage.input * prices.input +
    usage.output * prices.output +
    usage.cacheWrite * prices.cacheWrite +
    usage.cacheRead * prices.cacheRead
  ) / 1_000_000;
}

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return { input: a.input + b.input, output: a.output + b.output, cacheWrite: a.cacheWrite + b.cacheWrite, cacheRead: a.cacheRead + b.cacheRead };
}

/** Liest `usage` aus einer Antwort von Anthropic; fehlende oder kaputte Werte zählen als 0. */
export function usageFromAnthropic(raw: unknown): LlmUsage {
  const usage = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
  };
}

/** Dollarbetrag fürs Protokoll, sechs Nachkommastellen (ein Millionstel Dollar). */
export function formatUsd(usd: number): string {
  return (Number.isFinite(usd) && usd > 0 ? usd : 0).toFixed(6);
}
