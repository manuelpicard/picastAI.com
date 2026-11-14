import { usageFromAnthropic, type LlmUsage } from './costs.js';
// Sprachmodell-Anbieter für Antworten und Geschichten (derzeit Anthropic/Claude).
// Beide Aufrufstellen in brain.ts fragen strukturiertes JSON an; die Schicht bleibt
// austauschbar, damit ein anderer zulässiger Anbieter ohne Umbau von brain.ts möglich ist.
import type { KunibertConfig } from './config.js';
import { providerErrorSummary } from './provider-errors.js';

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
  /** Token-Zahlen jedes einzelnen Aufrufs (auch eines wiederholten); nur Zahlen. */
  onUsage?: (usage: LlmUsage) => void;
  /**
   * Streaming (Punkt 71): Anthropic liefert die Antwort Stück für Stück, und diese Funktion bekommt
   * nach jedem Stück den bisher erhaltenen Wert des Felds `streamField` (Standard `text`). Das
   * Ergebnis am Ende ist dasselbe Objekt wie ohne Streaming. Ist schon Text angekommen, wird bei einem
   * Fehler nicht wiederholt (der Aufrufer hat ihn vielleicht schon verwendet).
   */
  onText?: (partial: string) => void;
  streamField?: string;
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
      /** Kopf anthropic-workspace-id (nötig bei Schlüsseln, die an eine Person gebunden sind). */
      workspaceId?: string | null;
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
    let delivered = false;
    const tracked: LlmJsonRequest = request.onText
      ? { ...request, onText: (partial) => { if (partial) delivered = true; request.onText!(partial); } }
      : request;
    try {
      return await this.attempt(tracked, totalMs);
    } catch (error) {
      const left = deadline - Date.now() - retryDelayMs;
      if (!(error instanceof LlmError) || !error.transient || left < MIN_RETRY_MS || delivered) throw error;
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
          ...(this.options.workspaceId ? { 'anthropic-workspace-id': this.options.workspaceId } : {}),
        },
        // Ein Tool-Aufruf liefert das Antwortformat als Objekt,
        // ohne dass JSON aus Fließtext herausgelöst werden muss.
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens ?? 1024,
          // Der Systemtext ist für alle Teile einer Folge gleich: Anthropic hält ihn kurz im
          // Zwischenspeicher (Prompt-Caching). Das spart Kosten und etwas Wartezeit; zu kurze
          // Texte speichert der Dienst einfach nicht, ohne Fehler.
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: request.user }],
          tools: [
            {
              name: request.schemaName,
              description: 'Antwort im vorgegebenen Format abgeben. Rufe dieses Werkzeug genau einmal auf und schreibe sonst nichts.',
              input_schema: request.schema,
            },
          ],
          // Neuere Modelle (z. B. claude-sonnet-5-5) lehnen ein erzwungenes Werkzeug mit HTTP 400 ab
          // ("tool_choice: type tool and any are not supported"). Mit "auto" und der Anweisung in der
          // Werkzeugbeschreibung ruft das Modell das einzige Werkzeug trotzdem auf.
          tool_choice: { type: 'auto' },
          ...(request.onText ? { stream: true } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Nur Status und Fehlercode (z. B. "overloaded_error"), nie der Fließtext der Antwort:
        // Die Meldung landet im Protokoll, und das darf keine Äußerungen enthalten.
        let body = '';
        try {
          body = (await response.text()).slice(0, 65_536);
        } catch {
          body = '';
        }
        // Bekannte Ursache als fester Hinweis (der Fließtext selbst kommt nie ins Protokoll).
        const hint = response.status === 400 && body.includes('anthropic-workspace-id')
          ? ' – Arbeitsbereich fehlt: PICASTAI_ANTHROPIC_WORKSPACE_ID setzen (Console, Arbeitsbereiche, Spalte ID)'
          : '';
        throw new LlmError(
          `Anthropic antwortete mit ${providerErrorSummary(response.status, body)}${hint}`,
          response.status === 429 || response.status >= 500
        );
      }
      if (request.onText) return await readToolStream(response, request.onText, request.streamField ?? 'text', request.onUsage);
      const body = (await response.json()) as { content?: Array<{ type: string; input?: unknown }>; usage?: unknown };
      if (request.onUsage) request.onUsage(usageFromAnthropic(body.usage));
      const block = body.content?.find((item) => item.type === 'tool_use');
      if (!block || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
        throw new LlmError('Anthropic: Antwort enthält kein Tool-Ergebnis', true);
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
    | 'anthropicWorkspaceId'
    | 'llmTimeoutMs'
  >
): LlmProvider | null {
  if (cfg.llmProvider === 'anthropic' && cfg.anthropicApiKey) {
    return new AnthropicProvider({
      apiKey: cfg.anthropicApiKey,
      model: cfg.anthropicModel,
      baseUrl: cfg.anthropicBaseUrl,
      workspaceId: cfg.anthropicWorkspaceId,
      timeoutMs: cfg.llmTimeoutMs,
    });
  }
  return null;
}

/**
 * Liest den bisher angekommenen Wert eines Text-Felds aus unvollständigem JSON, zum Beispiel aus
 * `{"episode_plan":"…","text":"Kunibert erwach` den Text „Kunibert erwach“. Ein angefangenes
 * Escape am Ende wird weggelassen. Gesucht wird nur ein Schlüssel, der nicht selbst in einem
 * String steht (ein `\"text\"` innerhalb des Plans zählt nicht).
 */
export function partialJsonString(json: string, key: string): string {
  let index = 0;
  let inString = false;
  let depth = 0;
  let stringStart = -1;
  while (index < json.length) {
    const char = json[index];
    if (inString) {
      if (char === '\\') { index += 2; continue; }
      if (char === '"') {
        inString = false;
        // Ein Schlüssel auf oberster Ebene, gefolgt von einem Doppelpunkt?
        const name = json.slice(stringStart + 1, index);
        let after = index + 1;
        while (after < json.length && /\s/.test(json[after])) after++;
        if (depth === 1 && name === key && json[after] === ':') {
          after++;
          while (after < json.length && /\s/.test(json[after])) after++;
          if (json[after] !== '"') return '';
          return decodePartialString(json, after + 1);
        }
      }
      index++;
      continue;
    }
    if (char === '"') { inString = true; stringStart = index; }
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
    index++;
  }
  return '';
}

function decodePartialString(json: string, start: number): string {
  let out = '';
  let index = start;
  while (index < json.length) {
    const char = json[index];
    if (char === '"') return out;
    if (char !== '\\') { out += char; index++; continue; }
    const next = json[index + 1];
    if (next === undefined) return out;
    if (next === 'u') {
      const hex = json.slice(index + 2, index + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      index += 6;
      continue;
    }
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
    out += map[next] ?? next;
    index += 2;
  }
  return out;
}

/** Server-Sent Events der Messages-API lesen: Werkzeug-Eingabe zusammensetzen, Text weiterreichen, Token zählen. */
async function readToolStream(
  response: Response,
  onText: (partial: string) => void,
  field: string,
  onUsage?: (usage: LlmUsage) => void
): Promise<Record<string, unknown>> {
  if (!response.body) throw new LlmError('Anthropic: leerer Stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let toolJson = '';
  let toolIndex: number | null = null;
  let lastText = '';
  let usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const handle = (data: string) => {
    let event: Record<string, any>;
    try { event = JSON.parse(data); } catch { return; }
    if (event.type === 'message_start' && event.message?.usage) usage = { ...usage, ...event.message.usage };
    else if (event.type === 'message_delta' && event.usage) usage = { ...usage, ...event.usage };
    else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use' && toolIndex === null) toolIndex = event.index;
    else if (event.type === 'content_block_delta' && event.index === toolIndex && event.delta?.type === 'input_json_delta') {
      toolJson += String(event.delta.partial_json ?? '');
      const text = partialJsonString(toolJson, field);
      if (text !== lastText) { lastText = text; onText(text); }
    } else if (event.type === 'error') {
      // Nur der Fehlercode, nie der Fließtext (CLAUDE.md).
      const code = String(event.error?.type ?? 'unbekannt').replace(/[^a-z_]/gi, '').slice(0, 40);
      throw new LlmError(`Anthropic: Fehler im Stream (${code})`, code === 'overloaded_error' || code === 'api_error');
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('');
      if (data) handle(data);
    }
    if (done) break;
  }
  if (onUsage) onUsage(usageFromAnthropic(usage));
  if (toolIndex === null || !toolJson) throw new LlmError('Anthropic: Antwort enthält kein Tool-Ergebnis', true);
  let input: unknown;
  try { input = JSON.parse(toolJson); } catch { throw new LlmError('Anthropic: Tool-Ergebnis im Stream unvollständig', true); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LlmError('Anthropic: Antwort enthält kein Tool-Ergebnis', true);
  return input as Record<string, unknown>;
}
