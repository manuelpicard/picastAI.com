import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AZURE_EU_REGIONS,
  azureEndpoint,
  azureOutputFormat,
  buildAzureSsml,
  escapeXml,
  isValidAzureRegion,
  isValidAzureVoiceName,
  isValidProsodyValue,
  pickAzureSampleRate,
  usableAzureSettings,
} from './azure-speech.js';

test('Region: nur Kurznamen in Kleinbuchstaben, damit kein fremder Rechnername entsteht', () => {
  assert.equal(isValidAzureRegion('germanywestcentral'), true);
  assert.equal(isValidAzureRegion('westeurope'), true);
  for (const bad of ['', 'ab', 'West Europe', 'westeurope.evil.example', 'westeurope/', 'WestEurope', 'a'.repeat(60), 'we@x']) {
    assert.equal(isValidAzureRegion(bad), false, bad);
  }
  assert.equal(azureEndpoint('germanywestcentral'), 'https://germanywestcentral.tts.speech.microsoft.com/cognitiveservices/v1');
  assert.ok(AZURE_EU_REGIONS.has('westeurope'));
  assert.equal(AZURE_EU_REGIONS.has('eastus'), false);
});

test('Stimmenname: Buchstaben, Ziffern, Bindestrich, Unterstrich und Doppelpunkt', () => {
  assert.equal(isValidAzureVoiceName('de-DE-ConradNeural'), true);
  assert.equal(isValidAzureVoiceName('de-de-Florian:DragonHDLatestNeural'), true);
  for (const bad of ['', 'ab', 'de-DE"><x', 'de DE', 'de-DE-Conrad\nNeural', "x'y", 'a'.repeat(100)]) {
    assert.equal(isValidAzureVoiceName(bad), false, JSON.stringify(bad));
  }
});

test('Tonlage und Tempo: Stichwörter, Prozent, Halbtöne, Hertz, Zahlen; sonst abgelehnt', () => {
  for (const good of ['low', 'x-slow', 'default', '-10%', '+5%', '5%', '-2st', '+20Hz', '0.9', '1', '-12.5%']) {
    assert.equal(isValidProsodyValue(good), true, good);
  }
  for (const bad of ['', 'tief', '-10 %', '10%%', '"><x/>', '1e3', '--5%', '12345%', '5.123%', '-5 Hz']) {
    assert.equal(isValidProsodyValue(bad), false, bad);
  }
});

test('SSML: Text wird maskiert und kann keine eigenen Elemente einschleusen', () => {
  const evil = 'Hallo </voice><voice name="x">Böse</voice> & "Anführungszeichen" \'x\'';
  const ssml = buildAzureSsml(evil, { voice: 'de-DE-ConradNeural', pitch: '', rate: '' });
  assert.equal((ssml.match(/<voice /g) ?? []).length, 1);
  assert.equal((ssml.match(/<\/voice>/g) ?? []).length, 1);
  assert.ok(ssml.includes('&lt;/voice&gt;&lt;voice name=&quot;x&quot;&gt;'));
  assert.ok(ssml.includes('&amp;'));
  assert.ok(ssml.includes('&apos;x&apos;'));
});

test('SSML: ohne Tonlage und Tempo kein prosody-Element, mit beiden beide Attribute', () => {
  const plain = buildAzureSsml('Hallo', { voice: 'de-DE-ConradNeural', pitch: '', rate: '' });
  assert.equal(plain, '<speak version="1.0" xml:lang="de-DE"><voice name="de-DE-ConradNeural">Hallo</voice></speak>');
  const both = buildAzureSsml('Hallo', { voice: 'v-x-Y', pitch: '-10%', rate: 'slow' });
  assert.ok(both.includes('<prosody pitch="-10%" rate="slow">Hallo</prosody>'));
  const pitchOnly = buildAzureSsml('Hallo', { voice: 'v-x-Y', pitch: 'low', rate: '' });
  assert.ok(pitchOnly.includes('<prosody pitch="low">'));
  assert.equal(pitchOnly.includes('rate='), false);
});

test('Ungültige XML-Zeichen werden entfernt, normale Umlaute und Zeilenumbrüche bleiben', () => {
  assert.equal(escapeXml('Grüße\nvom Ritter\u0000\u0008\u001F'), 'Grüße\nvom Ritter');
});

test('Abtastrate: Azure-Raten direkt, sonst 24 kHz zum Umrechnen; Formatname', () => {
  assert.equal(pickAzureSampleRate(16000), 16000);
  assert.equal(pickAzureSampleRate(24000), 24000);
  assert.equal(pickAzureSampleRate(22050), 24000);
  assert.equal(azureOutputFormat(16000), 'raw-16khz-16bit-mono-pcm');
  assert.equal(azureOutputFormat(8000), 'raw-8khz-16bit-mono-pcm');
  assert.equal(azureOutputFormat(48000), 'raw-48khz-16bit-mono-pcm');
});

test('Einstellungen: ohne Region, Schlüssel oder gültige Stimme aus; ungültige Tonlage wird verworfen', () => {
  const ok = { azureTtsRegion: 'germanywestcentral', azureTtsKey: 'k', azureTtsVoice: 'de-DE-ConradNeural', azureTtsPitch: '-10%', azureTtsRate: 'slow' };
  assert.deepEqual(usableAzureSettings(ok), { region: 'germanywestcentral', key: 'k', voice: 'de-DE-ConradNeural', pitch: '-10%', rate: 'slow' });
  assert.equal(usableAzureSettings({ ...ok, azureTtsRegion: '' }), null);
  assert.equal(usableAzureSettings({ ...ok, azureTtsRegion: 'bad.host' }), null);
  assert.equal(usableAzureSettings({ ...ok, azureTtsKey: null }), null);
  assert.equal(usableAzureSettings({ ...ok, azureTtsVoice: '' }), null);
  assert.equal(usableAzureSettings({ ...ok, azureTtsVoice: 'x"y' }), null);
  const lenient = usableAzureSettings({ ...ok, azureTtsPitch: 'tief', azureTtsRate: '' });
  assert.equal(lenient?.pitch, '');
  assert.equal(lenient?.rate, '');
});
