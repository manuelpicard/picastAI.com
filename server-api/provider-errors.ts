// Fehlerantworten fremder Dienste (Sprachmodell, Spracherkennung, Sprachausgabe), so gekürzt,
// dass sie gefahrlos in Fehlermeldungen und ins Protokoll dürfen.
//
// Warum: Der Fließtext einer Fehlerantwort kann den gesendeten Text enthalten. Ein Beispiel
// sind Prüffehler von FastAPI-Diensten wie Speaches (HTTP 422): Pydantic gibt den
// beanstandeten Eingabewert im Feld "input" zurück, also unter Umständen den ganzen
// Antworttext für das Kind. Protokolle dürfen aber nie Äußerungen oder Antworttexte
// enthalten (CLAUDE.md). Übrig bleiben deshalb nur der HTTP-Status und, wenn vorhanden,
// ein maschinenlesbarer Fehlercode wie "overloaded_error" (Anthropic), "INVALID_ARGUMENT"
// (Google) oder "string_too_long" (FastAPI).

/** Ein Fehlercode ist ein einzelnes Wort aus Buchstaben, Ziffern, _ . - (kein Satz, kein Text). */
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function asCode(value: unknown): string | null {
  return typeof value === 'string' && CODE_PATTERN.test(value) ? value : null;
}

/** Sucht in bekannten Feldern nach einem Fehlercode; Freitext-Felder werden nie gelesen. */
export function extractErrorCode(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const error = root.error && typeof root.error === 'object' ? (root.error as Record<string, unknown>) : null;
  const detail = Array.isArray(root.detail) && root.detail[0] && typeof root.detail[0] === 'object'
    ? (root.detail[0] as Record<string, unknown>)
    : null;
  const candidates: unknown[] = [
    error?.type, // Anthropic: {"type":"error","error":{"type":"overloaded_error",...}}
    error?.status, // Google: {"error":{"code":400,"status":"INVALID_ARGUMENT",...}}
    error?.code,
    detail?.type, // FastAPI/Pydantic: {"detail":[{"type":"string_too_long",...,"input":"..."}]}
    root.code,
    root.type === 'error' ? null : root.type,
  ];
  for (const candidate of candidates) {
    const code = asCode(candidate);
    if (code) return code;
  }
  return null;
}

/** "HTTP 422 (string_too_long)" oder "HTTP 503": nie der Fließtext der Antwort. */
export function providerErrorSummary(status: number, body: string): string {
  const code = extractErrorCode(body);
  return code ? `HTTP ${status} (${code})` : `HTTP ${status}`;
}

/** Liest den Body einer Fehlerantwort (höchstens 64 KB) und gibt nur die gekürzte Fassung zurück. */
export async function summarizeErrorResponse(response: Response): Promise<string> {
  let body = '';
  try {
    body = (await response.text()).slice(0, 65_536);
  } catch {
    body = '';
  }
  return providerErrorSummary(response.status, body);
}
