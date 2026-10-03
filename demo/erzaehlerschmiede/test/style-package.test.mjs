import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStylePackage, mergeStylePackage, parseStylePackage } from '../public/style-package.mjs';

const profile = {
  id: 'papa-og', name: 'Papa OG', kind: 'kunibert', style: 'Warm, ruhig und mündlich.',
  references: ['Freigegebener Anfang', 'Freigegebener Schluss'],
  messages: [{ role: 'user', content: 'Private Unterhaltung' }],
  feedback: [{ rating: 'up', text: 'Private Rückmeldung' }],
};

test('Stilpaket exportiert Beispiele, aber keine Gespräche oder Rückmeldungen', () => {
  const pack = buildStylePackage(profile);
  assert.equal(pack.profile.references.length, 2);
  assert.equal('messages' in pack.profile, false);
  assert.equal('feedback' in pack.profile, false);
  assert.equal('id' in pack.profile, false);
});

test('Import lehnt falsches Format und leere Beispielpakete ab', () => {
  assert.throws(() => parseStylePackage({ format: 'other', version: 1 }), /kein unterstütztes/);
  assert.throws(() => parseStylePackage({ format: 'erzaehlerschmiede-style-package', version: 1, profile: { name: 'Papa OG', kind: 'kunibert', references: [] } }), /keine freigegebenen/);
});

test('Import in vorhandenes Profil ergänzt Beispiele, aber überschreibt den lokalen Stil nicht', () => {
  const local = { profiles: [{ ...profile, references: ['Schon lokal'] }] };
  const incoming = parseStylePackage(buildStylePackage(profile));
  const result = mergeStylePackage(local, incoming);
  assert.equal(result.created, false);
  assert.equal(result.profile.style, 'Warm, ruhig und mündlich.');
  assert.deepEqual(result.profile.references, ['Schon lokal', 'Freigegebener Anfang', 'Freigegebener Schluss']);
  assert.equal(result.profile.messages[0].content, 'Private Unterhaltung');
});

test('Import in neues Profil erzeugt leere Gesprächs- und Feedbacklisten', () => {
  const local = { profiles: [] };
  const incoming = parseStylePackage(buildStylePackage(profile));
  const result = mergeStylePackage(local, incoming, () => 'new-id');
  assert.equal(result.created, true);
  assert.equal(result.profile.id, 'new-id');
  assert.deepEqual(result.profile.messages, []);
  assert.deepEqual(result.profile.feedback, []);
});
