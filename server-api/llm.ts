// Sprachmodell-Anbieter für Antworten und Geschichten (derzeit Anthropic/Claude).
// Beide Aufrufstellen in brain.ts fragen strukturiertes JSON an; die Schicht bleibt
// austauschbar, damit ein anderer zulässiger Anbieter ohne Umbau von brain.ts möglich ist.
import type { KunibertConfig } from './config.js';
import { summarizeErrorResponse } from './provider-errors.js';

/** Schema in Standard-JSON-Schema-Schreibweise (Kleinbuchstaben-Typen). */
export interface JsonSchema {
  type: 'object' | 'string' | 'boolean' | 'number' | 'integer' | 'array';
  description?: string;
  enum?: string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

export interface LlmJsonRequest {
  system: string;
  user: string;
  /** Name des erzwungenen Antwortformats (bei Anthropic der Tool-Name). */
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
  /** Obergrenze für diesen Aufruf aus dem Zeitbudget der Anfrage; die eigene Grenze des Anbieters gilt zusätzlich. */
  timeoutMs?: number;
}

export interface LlmProvider {
  readonly name: 'anthropic';
  readonly model: string;
  generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>>;
}

export class LlmError extends Error {
  /** transient: vorübergehender Fehler, bei dem ein zweiter Versuch sinnvoll ist. */
  constructor(message: string, public readonly transient = false) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Weniger Restzeit als das lohnt für einen zweiten Versuch nicht. */
const MIN_RETRY_MS = 3_000;

/** Parst eine Modellantwort, die ein JSON-Objekt sein muss (auch in Codeblöcken). */
export function parseJsonObject(text: string | undefined | null, source: string): Record<string, unknown> {
  const raw = (text || '').trim();
  if (!raw) throw new LlmError(`${source}: leere Antwort`);
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new LlmError(`${source}: Antwort ist kein gültiges JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LlmError(`${source}: Antwort ist kein JSON-Objekt`);
  }
  return parsed as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Anthropic (Claude) über die Messages-API, ohne zusätzliche Abhängigkeit
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      timeoutMs?: number;
      /** Pause vor dem zweiten Versuch (Standard 700 ms; Tests setzen 0). */
      retryDelayMs?: number;
      fetchImpl?: typeof fetch;
    }
  ) {
    this.model = options.model;
    this.baseUrl = (options.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  }

  /**
   * Ein Aufruf mit höchstens einer Wiederholung bei vorübergehenden Fehlern (überlastet,
   * Rate-Limit, 5xx, Netzwerk). Ohne Wiederholung fiele eine Geschichte bei einem kurzen
   * Aussetzer sofort auf den festen Ersatztext zurück. Beide Versuche teilen sich eine Frist;
   * nach einer Zeitüberschreitung wird nicht wiederholt.
   */
  async generateJson(request: LlmJsonRequest): Promise<Record<string, unknown>> {
    const totalMs = Math.min(request.timeoutMs ?? Infinity, this.options.timeoutMs ?? 30_000);
    const deadline = Date.now() + totalMs;
    const retryDelayMs = this.options.retryDelayMs ?? 700;
    try {
      return await this.attempt(request, totalMs);
    } catch (error) {
      const left = deadline - Date.now() - retryDelayMs;
      if (!(error instanceof LlmError) || !error.transient || left < MIN_RETRY_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return this.attempt(request, left);
    }
  }

  private async attempt(request: LlmJsonRequest, timeoutMs: number): Promise<Record<string, unknown>> {
    const fetchFn = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        // Ein erzwungener Tool-Aufruf liefert das Antwortformat als Objekt,
        // ohne dass JSON aus Fließtext herausgelöst werden muss.
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens ?? 1024,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          tools: [
            {
              name: request.schemaName,
              description: 'Antwort im vorgegebenen Format abgeben.',
              input_schema: request.schema,
            },
          ],
          tool_choice: { type: 'tool', name: request.schemaName },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Nur Status und Fehlercode (z. B. "overloaded_error"), nie der Fließtext der Antwort:
        // Die Meldung landet im Protokoll, und das darf keine Äußerungen enthalten.
        throw new LlmError(
          `Anthropic antwortete mit ${await summarizeErrorResponse(response)}`,
          response.status === 429 || response.status >= 500
        );
      }
      const body = (await response.json()) as { content?: Array<{ type: string; input?: unknown }> };
      const block = body.content?.find((item) => item.type === 'tool_use');
      if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
        throw new LlmError('Anthropic: Antwort enthält kein Tool-Ergebnis');
      }
      return block.input as Record<string, unknown>;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if ((error as Error)?.name === 'AbortError') throw new LlmError('Anthropic: Zeitüberschreitung');
      throw new LlmError(`Anthropic: Netzwerkfehler: ${(error as Error)?.message || 'unbekannt'}`, true);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------

/** Liefert den konfigurierten Anbieter oder null (dann greifen die festen Fallback-Texte). */
export function createLlmProvider(
  cfg: Pick<
    KunibertConfig,
    | 'llmProvider'
    | 'anthropicApiKey'
    | 'anthropicModel'
    | 'anthropicBaseUrl'
    | 'llmTimeoutMs'
  >
): LlmProvider | null {
  if (cfg.llmProvider === 'anthropic' && cfg.anthropicApiKey) {
    return new AnthropicProvider({
      apiKey: cfg.anthropicApiKey,
      model: cfg.anthropicModel,
      baseUrl: cfg.anthropicBaseUrl,
      timeoutMs: cfg.llmTimeoutMs,
    });
  }
  return null;
}
