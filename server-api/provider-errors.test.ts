import assert from 'node:assert/strict';
import test from 'node:test';
import { extractErrorCode, providerErrorSummary, summarizeErrorResponse } from './provider-errors.js';

const CHILD_TEXT = 'Kunibert erwachte im Dachzimmer';

test('Anthropic, Google und FastAPI: nur Status und Fehlercode, nie der Fließtext', () => {
  assert.equal(
    providerErrorSummary(529, JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })),
    'HTTP 529 (overloaded_error)'
  );
  assert.equal(
    providerErrorSummary(400, JSON.stringify({ error: { code: 400, message: `Sentence starting with: "${CHILD_TEXT}" is too long.`, status: 'INVALID_ARGUMENT' } })),
    'HTTP 400 (INVALID_ARGUMENT)'
  );
  // Pydantic gibt den beanstandeten Wert im Feld "input" zurück: hier der Antworttext für das Kind.
  const fastApi = JSON.stringify({ detail: [{ type: 'string_too_long', loc: ['body', 'input'], msg: 'zu lang', input: CHILD_TEXT }] });
  assert.equal(providerErrorSummary(422, fastApi), 'HTTP 422 (string_too_long)');
});

test('Freitext, HTML und Felder mit Leerzeichen ergeben nur den Status', () => {
  assert.equal(providerErrorSummary(500, `Fehler bei «${CHILD_TEXT}»`), 'HTTP 500');
  assert.equal(providerErrorSummary(502, '<html><body>Bad Gateway</body></html>'), 'HTTP 502');
  assert.equal(providerErrorSummary(404, JSON.stringify({ detail: `Model '${CHILD_TEXT}' is not installed` })), 'HTTP 404');
  assert.equal(extractErrorCode(JSON.stringify({ error: { type: CHILD_TEXT } })), null, 'ein Satz ist kein Code');
  assert.equal(extractErrorCode(JSON.stringify({ code: 'a'.repeat(80) })), null, 'zu lang für einen Code');
  assert.equal(extractErrorCode(''), null);
  assert.equal(extractErrorCode('null'), null);
  assert.equal(extractErrorCode('[1,2]'), null);
});

test('summarizeErrorResponse liest den Body und gibt nur die Kurzfassung zurück', async () => {
  const response = new Response(JSON.stringify({ error: { type: 'rate_limit_error', message: CHILD_TEXT } }), { status: 429 });
  assert.equal(await summarizeErrorResponse(response), 'HTTP 429 (rate_limit_error)');
});
