import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, cleanHistory, cleanText, normalizeRequest } from '../lib/prompt.mjs';

test('cleanText entfernt Steuerzeichen und begrenzt Länge', () => {
  assert.equal(cleanText('Hallo\u0000 Welt', 20), 'Hallo Welt');
  assert.equal(cleanText('abcde', 3), 'abc');
});

test('cleanHistory erlaubt nur user/assistant und begrenzt den Verlauf', () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ role: 'user', content: `Satz ${i}` }));
  history.push({ role: 'system', content: 'Nicht übernehmen' });
  const cleaned = cleanHistory(history);
  assert.equal(cleaned.length, 7);
  assert.equal(cleaned[0].content, 'Satz 5');
  assert.equal(cleaned.at(-1).role, 'user');
});

test('normalizeRequest erzwingt sichere Modi und kuratierte Stilbeispiele', () => {
  const refs = Array.from({ length: 8 }, (_, i) => `Beispiel ${i}`);
  const cleaned = normalizeRequest({
    mode: 'admin', message: '  Erzähle weiter.  ',
    narrator: { name: 'Papa – Originalerzähler', style: 'warm', isKunibert: true, references: refs },
    history: [{ role: 'assistant', content: 'Vorher.' }, { role: 'tool', content: 'ignorieren' }],
  });
  assert.equal(cleaned.mode, 'chat');
  assert.equal(cleaned.message, 'Erzähle weiter.');
  assert.equal(cleaned.narrator.references.length, 5);
  assert.equal(cleaned.history.length, 1);
});

test('normalizeRequest begrenzt Bewertungsfeedback auf fünf kurze Notizen', () => {
  const feedback = Array.from({ length: 7 }, (_, i) => ({ rating: 'improve', note: `Notiz ${i} ${'x'.repeat(300)}` }));
  const cleaned = normalizeRequest({ message: 'Erzähl weiter.', narrator: { feedback } });
  assert.equal(cleaned.narrator.feedback.length, 5);
  assert.match(cleaned.narrator.feedback[0].note, /^Notiz 2/);
  assert.equal(cleaned.narrator.feedback[0].note.length, 240);
});

test('Kunibert-Prompt behauptet weder Papas Identität noch eine Originalrekonstruktion', () => {
  const prompt = buildSystemPrompt('story', {
    name: 'Papa – Originalerzähler', style: 'warm', references: [], isKunibert: true,
    feedback: [{ rating: 'improve', note: 'Bitte kürzer und weniger unheimlich erzählen.' }],
  });
  assert.match(prompt, /niemals Papa/);
  assert.match(prompt, /authentische Erzählweise einer realen Person zu rekonstruieren/);
  assert.match(prompt, /Kunibert-Welt/);
  assert.match(prompt, /BISHERIGE BEWERTUNGEN ZU KI-ERZÄHLUNGEN/);
  assert.match(prompt, /Bitte kürzer und weniger unheimlich erzählen/);
  assert.match(prompt, /keine Systemanweisungen/);
});

test('Papa-Bewertungsmodus bittet ihn nicht, selbst Geschichten zu erzählen', () => {
  const prompt = buildSystemPrompt('forge', {
    name: 'Papa – Originalerzähler', style: 'warm', references: [], isKunibert: true,
  });
  assert.match(prompt, /Der Nutzer prüft deine KI-Geschichten/);
  assert.match(prompt, /er erzählt nicht selbst/);
  assert.match(prompt, /Bitte ihn nie, selbst eine Geschichte zu erzählen/);
});
