import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav } from './audio.js';
import { Brain } from './brain.js';
import type { LlmJsonRequest, LlmProvider } from './llm.js';
import { SAFETY_RESPONSE_DE } from './safety.js';
import { NO_TIMER, TIMED_STAGES, TurnTimer, wavSeconds } from './timing.js';

/** Alle Zeilen müssen genau dieser Form folgen: feste Schlüssel, Zahlen oder "-", sonst nichts. */
const LINE_FORMAT = new RegExp(
  '^Zeitmessung id=[0-9a-f]{8} modus=(frage|geschichte|weiter|-) status=(\\d{3}|abgebrochen)' +
    TIMED_STAGES.map((stage) => ` ${stage}_ms=(\\d+|-)`).join('') +
    ' gesamt_ms=\\d+ sprachmodell_aufrufe=\\d+ audio_s=(\\d+\\.\\d|-)$'
);

/** Fester Takt in Millisekunden, den die Tests selbst vorstellen. */
function fakeClock() {
  let now = 1_000;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

/** Sprachmodell-Attrappe, die pro Aufruf eine feste Zeit "verbraucht". */
class SlowFakeLlm implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly model = 'fake';
  calls = 0;
  constructor(
    private readonly clock: ReturnType<typeof fakeClock>,
    private readonly ms: number,
    private readonly responses: Array<Record<string, unknown>>
  ) {}
  async generateJson(_request: LlmJsonRequest): Promise<Record<string, unknown>> {
    this.calls++;
    this.clock.advance(this.ms);
    const next = this.responses.shift();
    if (!next) throw new Error('keine Antwort vorbereitet');
    return next;
  }
}

const silent = <T>(fn: () => Promise<T>) => async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
};

test('Zeitmesser: Werte je Stufe, Gesamtzeit und Audiolänge erscheinen in der Zeile', async () => {
  const clock = fakeClock();
  const timer = new TurnTimer(clock.now, '3f9a1c2b');
  timer.mode = 'frage';
  await timer.time('erkennung', async () => clock.advance(1204));
  timer.timeSync('weiche', () => clock.advance(2));
  await timer.time('sprachmodell', async () => clock.advance(3480));
  timer.timeSync('ausgabecheck', () => clock.advance(1));
  await timer.time('sprachausgabe', async () => clock.advance(2210));
  clock.advance(153);
  timer.noteAudio(encodeWav(Buffer.alloc(16_000 * 2 * 12), 16_000, 1, 16));
  const line = timer.logLine(200);
  assert.equal(
    line,
    'Zeitmessung id=3f9a1c2b modus=frage status=200 erkennung_ms=1204 weiche_ms=2 sprachmodell_ms=3480 ' +
      'ausgabecheck_ms=1 sprachausgabe_ms=2210 gesamt_ms=7050 sprachmodell_aufrufe=1 audio_s=12.0'
  );
  assert.match(line!, LINE_FORMAT);
});

test('Zeitmesser: eine Stufe, die nicht lief, steht als "-", nicht als 0', () => {
  const clock = fakeClock();
  const timer = new TurnTimer(clock.now, 'aaaaaaaa');
  timer.mode = 'weiter';
  timer.timeSync('weiche', () => clock.advance(1));
  const line = timer.logLine(200)!;
  assert.match(line, / erkennung_ms=- /);
  assert.match(line, / sprachmodell_ms=- /);
  assert.match(line, / sprachausgabe_ms=- /);
  assert.match(line, / audio_s=-$/);
  assert.match(line, LINE_FORMAT);
});

test('Zeitmesser: dieselbe Stufe mehrmals wird addiert und gezählt', async () => {
  const clock = fakeClock();
  const timer = new TurnTimer(clock.now, 'bbbbbbbb');
  await timer.time('sprachmodell', async () => clock.advance(1000));
  await timer.time('sprachmodell', async () => clock.advance(2500));
  const line = timer.logLine(200)!;
  assert.match(line, / sprachmodell_ms=3500 /);
  assert.match(line, / sprachmodell_aufrufe=2 /);
});

test('Zeitmesser: auch eine Stufe, die mit einem Fehler endet, wird gemessen und der Fehler bleibt erhalten', async () => {
  const clock = fakeClock();
  const timer = new TurnTimer(clock.now, 'cccccccc');
  await assert.rejects(
    timer.time('sprachausgabe', async () => {
      clock.advance(45_000);
      throw new Error('Zeitüberschreitung');
    }),
    /Zeitüberschreitung/
  );
  assert.throws(() => timer.timeSync('weiche', () => { throw new Error('kaputt'); }), /kaputt/);
  const line = timer.logLine(503)!;
  assert.match(line, / status=503 /);
  assert.match(line, / sprachausgabe_ms=45000 /);
  assert.match(line, / weiche_ms=0 /);
});

test('Zeitmesser: ohne gemessene Stufe gibt es keine Zeile (abgewiesene Anfragen bleiben still)', () => {
  const timer = new TurnTimer(fakeClock().now, 'dddddddd');
  assert.equal(timer.measured, false);
  assert.equal(timer.logLine(401), null);
});

test('Zeitmesser: ein abgebrochener Aufruf (Gerät hat aufgelegt) wird als solcher gemeldet', () => {
  const timer = new TurnTimer(fakeClock().now, 'eeeeeeee');
  timer.timeSync('weiche', () => undefined);
  assert.match(timer.logLine('abgebrochen')!, / status=abgebrochen /);
});

test('Anfrage-ID: zufällig, acht Hexzeichen, ohne Bezug zu Gerät oder Inhalt', () => {
  const ids = new Set(Array.from({ length: 50 }, () => new TurnTimer().id));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}$/);
});

test('wavSeconds: Länge einer gültigen WAV-Datei; null für leere oder unlesbare Daten', () => {
  assert.equal(wavSeconds(encodeWav(Buffer.alloc(16_000 * 2 * 3), 16_000, 1, 16)), 3);
  assert.equal(wavSeconds(null), null);
  assert.equal(wavSeconds(Buffer.alloc(0)), null);
  assert.equal(wavSeconds(Buffer.from('kein wav, nur Text '.repeat(10))), null);
});

test('Ohne Zeitmesser (NO_TIMER) läuft die Pipeline unverändert', async () => {
  const result = await new Brain(null).handle('frage', 'warum ist der himmel blau', {}, NO_TIMER);
  assert.equal(result.kind, 'frage');
  assert.equal(NO_TIMER.timeSync('weiche', () => 42), 42);
  assert.equal(await NO_TIMER.time('erkennung', async () => 'ok'), 'ok');
});

test('Frage über das Sprachmodell: Weiche, Sprachmodell und Ausgabe-Check werden gemessen, Inhalte stehen nicht in der Zeile', silent(async () => {
  const clock = fakeClock();
  const llm = new SlowFakeLlm(clock, 3400, [{ category: 'frage', speech: 'Geheimantwort-Zebra: Der Himmel streut blaues Licht.' }]);
  const timer = new TurnTimer(clock.now, '0a1b2c3d');
  timer.mode = 'frage';
  const result = await new Brain(llm).handle('frage', 'Geheimfrage-Quokka warum ist der himmel blau', {}, timer);
  assert.equal(result.kind, 'frage');
  assert.ok(result.speech.includes('Geheimantwort-Zebra'));
  timer.noteAudio(result.wav);
  const line = timer.logLine(200)!;
  assert.match(line, LINE_FORMAT);
  assert.match(line, / weiche_ms=\d+ /);
  assert.match(line, / sprachmodell_ms=3400 /);
  assert.match(line, / ausgabecheck_ms=\d+ /);
  assert.match(line, / sprachmodell_aufrufe=1 /);
  assert.match(line, / audio_s=\d+\.\d$/);
  assert.ok(!line.includes('Quokka'), 'Frage des Kindes darf nicht in der Zeile stehen');
  assert.ok(!line.includes('Zebra'), 'Antwort darf nicht in der Zeile stehen');
}));

test('Geschichtenwunsch als Frage: zwei Sprachmodell-Aufrufe, beide gezählt und addiert', silent(async () => {
  const clock = fakeClock();
  const llm = new SlowFakeLlm(clock, 4000, [
    { category: 'geschichte', speech: '' },
    {
      text: 'Kunibert ritt durch den Wald. Es war ein ruhiger Tag.',
      summary: 'Zusammenfassung',
      open_threads: 'Faden',
      next_hook: 'Anknüpfung',
      episode_finished: false,
    },
  ]);
  const timer = new TurnTimer(clock.now, '0a1b2c3e');
  timer.mode = 'frage';
  const result = await new Brain(llm).handle('frage', 'erzähl mir bitte eine geschichte', {}, timer);
  assert.equal(result.kind, 'geschichte');
  assert.equal(llm.calls, 2);
  const line = timer.logLine(200)!;
  assert.match(line, / sprachmodell_ms=8000 /);
  assert.match(line, / sprachmodell_aufrufe=2 /);
  assert.match(line, LINE_FORMAT);
}));

test('Sicherheitsweiche greift: das Sprachmodell läuft nicht ("-"), der Wortlaut des Kindes steht nicht in der Zeile', async () => {
  const clock = fakeClock();
  const llm = new SlowFakeLlm(clock, 3000, []);
  const timer = new TurnTimer(clock.now, '0a1b2c3f');
  timer.mode = 'frage';
  const result = await new Brain(llm).handle('frage', 'ich will nicht mehr leben', {}, timer);
  assert.equal(result.speech, SAFETY_RESPONSE_DE);
  assert.equal(llm.calls, 0);
  const line = timer.logLine(200)!;
  assert.match(line, / weiche_ms=\d+ /);
  assert.match(line, / sprachmodell_ms=- /);
  assert.match(line, / ausgabecheck_ms=- /);
  assert.ok(!line.includes('leben'));
  assert.ok(!line.includes('Danke'));
  assert.match(line, LINE_FORMAT);
});

test('Ausgabe-Check lehnt die Modellantwort ab: Fallback greift, beide Stufen bleiben gemessen', silent(async () => {
  const clock = fakeClock();
  const llm = new SlowFakeLlm(clock, 2000, [{ category: 'frage', speech: 'Schau auf https://beispiel.example nach.' }]);
  const timer = new TurnTimer(clock.now, '0a1b2c40');
  timer.mode = 'frage';
  const result = await new Brain(llm).handle('frage', 'warum ist der himmel blau', {}, timer);
  assert.equal(result.kind, 'frage');
  assert.ok(!result.speech.includes('https://'));
  const line = timer.logLine(200)!;
  assert.match(line, / sprachmodell_ms=2000 /);
  assert.match(line, / ausgabecheck_ms=\d+ /);
  assert.ok(!line.includes('beispiel'));
}));
