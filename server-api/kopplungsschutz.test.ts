import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAIRING_GUARD_DEFAULTS, PairingGuard, isLoopbackAddress, senderNetwork } from './kopplungsschutz.js';

/** Uhr für Tests: Millisekunden, von Hand vorgestellt. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('senderNetwork: was als ein Absender zählt', () => {
  it('IPv4 ganz, IPv4 in IPv6 als IPv4, Zone zählt nicht', () => {
    assert.equal(senderNetwork('203.0.113.7'), 'v4:203.0.113.7');
    assert.equal(senderNetwork('::ffff:203.0.113.7'), 'v4:203.0.113.7');
    assert.equal(senderNetwork('::ffff:cb00:7107'), 'v4:203.0.113.7');
    assert.notEqual(senderNetwork('203.0.113.7'), senderNetwork('203.0.113.8'));
  });

  it('IPv6: die ersten 56 Bit, gleich wie geschrieben', () => {
    const a = senderNetwork('2001:db8:1:2::1');
    assert.equal(a, 'v6:2001:db8:1:0/56');
    assert.equal(senderNetwork('2001:0db8:0001:00ff:ffff:ffff:ffff:ffff'), a, 'gleiches /56, andere Schreibweise');
    assert.equal(senderNetwork('2001:db8:1:2::1%eth0'), a, 'Zone zählt nicht');
    assert.equal(senderNetwork('2001:DB8:1:2::abcd'), a, 'Groß- und Kleinschreibung');
    assert.notEqual(senderNetwork('2001:db8:1:100::1'), a, 'anderes /56');
    assert.notEqual(senderNetwork('2001:db8:2:2::1'), a);
    assert.equal(senderNetwork('::1'), 'v6:0:0:0:0/56');
  });

  it('Unbekanntes und Kaputtes zählt als ein Absender „unbekannt“', () => {
    for (const value of [undefined, null, '', 'kein-ip', '1.2.3', '2001:db8::1::2', '999.1.1.1']) {
      assert.equal(senderNetwork(value), 'unbekannt', String(value));
    }
  });
});

describe('isLoopbackAddress', () => {
  it('erkennt 127.0.0.0/8, ::1 und IPv4 in IPv6, sonst nichts', () => {
    for (const value of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1']) assert.equal(isLoopbackAddress(value), true, value);
    for (const value of ['10.0.0.1', '192.168.1.2', '::', '::2', '2001:db8::1', '::ffff:10.0.0.1', undefined, '']) {
      assert.equal(isLoopbackAddress(value), false, String(value));
    }
  });
});

describe('PairingGuard: Raten von Kopplungscodes', () => {
  it('Wartezeit: nach dem 3. Fehlversuch 2 s, dann doppelt so lang, höchstens 10 Minuten', () => {
    const guard = new PairingGuard(() => 0);
    const waits = [1, 2, 3, 4, 5, 11, 12, 40, 10_000].map((n) => guard.waitAfter(n));
    assert.deepEqual(waits, [0, 0, 2_000, 4_000, 8_000, 512_000, 600_000, 600_000, 600_000]);
    assert.equal(PAIRING_GUARD_DEFAULTS.maxWaitMs, 600_000);
  });

  it('Wer sich vertippt, kann gleich weitermachen; ab dem 3. Fehlversuch wartet er, auch mit einem richtigen Code', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    const parent = '198.51.100.20';
    for (let i = 0; i < 2; i++) {
      assert.equal(guard.check(parent).allowed, true);
      guard.recordFailure(parent);
    }
    assert.equal(guard.check(parent).allowed, true, 'nach zwei Fehlversuchen keine Wartezeit');
    guard.recordFailure(parent);
    const blocked = guard.check(parent);
    assert.deepEqual(blocked, { allowed: false, retryAfterSeconds: 2, grund: 'absender', onlyDevices: null });
    clock.advance(1_999);
    assert.equal(guard.check(parent).allowed, false);
    clock.advance(1);
    assert.equal(guard.check(parent).allowed, true, 'keine harte Sperre: nach 2 s geht es weiter');
    guard.recordFailure(parent);
    assert.equal(guard.check(parent).retryAfterSeconds, 4);
  });

  it('Ein Absender bremst nur sich selbst, nie die anderen', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    for (let i = 0; i < 30; i++) {
      if (i > 0) clock.advance(guard.waitAfter(i));
      assert.equal(guard.check('203.0.113.66').allowed, true);
      guard.recordFailure('203.0.113.66');
    }
    assert.equal(guard.check('203.0.113.66').retryAfterSeconds, 600);
    assert.equal(guard.check('203.0.113.67').allowed, true, 'Nachbaradresse');
    assert.equal(guard.check('2001:db8:5::1').allowed, true);
  });

  it('IPv6: Adressen aus demselben /56 teilen sich die Wartezeit', () => {
    const guard = new PairingGuard(() => 5_000);
    for (let i = 1; i <= 3; i++) guard.recordFailure(`2001:db8:1:${i}::${i}`);
    assert.equal(guard.check('2001:db8:1:ff::99').grund, 'absender');
    assert.equal(guard.check('2001:db8:1:100::1').allowed, true, 'anderes /56');
  });

  it('Wer rät, wird schnell langsam: in einer Stunde höchstens 16 Versuche', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    let attempts = 0;
    const end = clock.now() + 60 * 60_000;
    while (clock.now() < end) {
      const verdict = guard.check('203.0.113.9');
      if (verdict.allowed) {
        attempts++;
        guard.recordFailure('203.0.113.9');
      } else {
        clock.advance(verdict.retryAfterSeconds * 1000);
      }
    }
    assert.ok(attempts <= 16, `Versuche: ${attempts}`);
    assert.ok(attempts >= 12, `Versuche: ${attempts}`);
  });

  it('Vergessen: je 10 Minuten ohne Fehlversuch zählt einer weniger; wer sich einmal vertippt, ist nach 10 Minuten vergessen', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    guard.recordFailure('198.51.100.4');
    assert.equal(guard.counts.absender, 1);
    clock.advance(10 * 60_000 - 1);
    assert.equal(guard.counts.absender, 1);
    clock.advance(1);
    assert.equal(guard.counts.absender, 0, 'nach 10 Minuten vergessen');

    for (let i = 0; i < 12; i++) guard.recordFailure('198.51.100.5');
    assert.equal(guard.check('198.51.100.5').retryAfterSeconds, 600);
    // 15 Minuten Pause: Es zählt einer weniger, nicht alles neu.
    clock.advance(15 * 60_000);
    assert.equal(guard.check('198.51.100.5').allowed, true);
    guard.recordFailure('198.51.100.5');
    assert.equal(guard.check('198.51.100.5').retryAfterSeconds, 600, 'nach der Pause gleich wieder die längste Wartezeit');
    // Vergessen erst, wenn alle abgezogen sind: 12 mal 10 Minuten.
    clock.advance(12 * 60 * 60_000 / 6 - 1);
    assert.equal(guard.counts.absender, 1);
    clock.advance(1);
    guard.purge();
    assert.equal(guard.counts.absender, 0, 'purge löscht vergessene Absender');
    assert.equal((guard as unknown as { senders: Map<string, unknown> }).senders.size, 0);
  });

  it('Wer rät und Pausen macht, fängt nicht bei null an: höchstens 160 Versuche am Tag, wie auch immer er wartet', () => {
    for (const pauseAfterWaitMs of [0, 8_000, 64_000, 512_000]) {
      const clock = fakeClock();
      const guard = new PairingGuard(clock.now);
      let attempts = 0;
      const end = clock.now() + 24 * 60 * 60_000;
      while (clock.now() < end) {
        const verdict = guard.check('203.0.113.10');
        if (verdict.allowed) {
          attempts++;
          guard.recordFailure('203.0.113.10');
        } else if (pauseAfterWaitMs && verdict.retryAfterSeconds * 1000 >= pauseAfterWaitMs) {
          clock.advance(15 * 60_000);
        } else {
          clock.advance(verdict.retryAfterSeconds * 1000);
        }
      }
      assert.ok(attempts <= 160, `Pause ab ${pauseAfterWaitMs} ms Wartezeit: ${attempts} Versuche`);
    }
  });

  it('Höchstens 200 Fehlversuche insgesamt in 10 Minuten; danach warten Fremde, bis wieder Platz ist', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    // 100 Angreifer-Adressen, je zwei Fehlversuche (noch ohne eigene Wartezeit), eine Sekunde auseinander.
    for (let i = 0; i < 100; i++) {
      for (let k = 0; k < 2; k++) {
        assert.equal(guard.check(`2001:db8:${i}::1`).allowed, true);
        guard.recordFailure(`2001:db8:${i}::1`);
      }
      clock.advance(1_000);
    }
    assert.equal(guard.counts.fehlversucheInsgesamt, 200);
    const stranger = guard.check('192.0.2.44');
    assert.equal(stranger.allowed, false);
    assert.equal(stranger.grund, 'insgesamt');
    // Der älteste Fehlversuch war vor 100 s: In 500 s fällt er aus dem Fenster von 10 Minuten.
    assert.equal(stranger.retryAfterSeconds, 500);
    clock.advance(500_000);
    assert.equal(guard.check('192.0.2.44').allowed, true, 'wieder Platz');
  });

  it('Eltern im Netz eines Geräts, das gerade einen Code geholt hat, sperrt auch ein großer Angriff nicht aus', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    for (let i = 0; i < 100; i++) {
      guard.recordFailure(`2001:db8:${i}::1`);
      guard.recordFailure(`2001:db8:${i}::1`);
    }
    const home = '198.51.100.77';
    assert.equal(guard.check(home).grund, 'insgesamt', 'vor dem Code des Geräts gilt die Grenze auch zu Hause');
    assert.equal(guard.check(home).onlyDevices, null);
    guard.noteDeviceNetwork(home, 'geraet-a', 10 * 60_000);
    assert.equal(guard.counts.geraeteNetze, 1);
    assert.deepEqual(guard.check(home), { allowed: true, retryAfterSeconds: 0, grund: null, onlyDevices: ['geraet-a'] });
    assert.deepEqual(guard.check('::ffff:198.51.100.77').onlyDevices, ['geraet-a'], 'dieselbe Adresse als IPv4 in IPv6');
    assert.equal(guard.check('198.51.100.78').grund, 'insgesamt', 'nur das Netz des Geräts');
    // Auch zu Hause gilt die eigene Wartezeit.
    for (let i = 0; i < 3; i++) guard.recordFailure(home);
    assert.equal(guard.check(home).grund, 'absender');
    clock.advance(2_000);
    assert.equal(guard.check(home).allowed, true);
    // Nach der Gültigkeit des Codes gilt die Grenze wieder.
    clock.advance(10 * 60_000);
    for (let i = 0; i < 200; i++) guard.recordFailure(`2001:db8:${i + 500}::1`);
    assert.equal(guard.check(home).grund, 'insgesamt');
    guard.purge();
    assert.equal(guard.counts.geraeteNetze, 0);
  });

  it('Ein eigenes Gerät in vielen Netzen hilft nicht beim Raten fremder Codes: über der Grenze nur der eigene Code', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    for (let i = 0; i < 200; i++) guard.recordFailure(`2001:db8:${i}::1`);
    // Der Angreifer holt mit seinem Gerät aus 30 Netzen Codes; die Familie aus ihrem eigenen.
    for (let i = 0; i < 30; i++) guard.noteDeviceNetwork(`203.0.113.${i}`, 'angreifer-geraet', 10 * 60_000);
    guard.noteDeviceNetwork('198.51.100.9', 'familien-geraet', 10 * 60_000);
    for (let i = 0; i < 30; i++) assert.deepEqual(guard.check(`203.0.113.${i}`).onlyDevices, ['angreifer-geraet']);
    assert.deepEqual(guard.check('198.51.100.9').onlyDevices, ['familien-geraet']);
    // Zwei Geräte im selben Netz: beide Codes gehen.
    guard.noteDeviceNetwork('198.51.100.9', 'zweites-geraet', 10 * 60_000);
    assert.deepEqual(guard.check('198.51.100.9').onlyDevices?.sort(), ['familien-geraet', 'zweites-geraet']);
    assert.equal(guard.counts.geraeteNetze, 31);
    // Unter der Grenze gilt jeder Code, auch für die Netze der Geräte.
    clock.advance(10 * 60_000);
    assert.equal(guard.check('203.0.113.1').onlyDevices, null);
  });

  it('Mehr als 200 Fehlversuche: Die Grenze gilt, bis der 200.-jüngste aus dem Fenster fällt', () => {
    const clock = fakeClock();
    const guard = new PairingGuard(clock.now);
    guard.noteDeviceNetwork('198.51.100.1', 'geraet-a', 60 * 60_000);
    // 250 Fehlversuche aus dem Netz des Geräts (dürfen über die Grenze), je 1 s auseinander, mit
    // eigener Wartezeit nicht beachtet: recordFailure zählt jeden.
    for (let i = 0; i < 250; i++) {
      guard.recordFailure('198.51.100.1');
      clock.advance(1_000);
    }
    assert.equal(guard.counts.fehlversucheInsgesamt, 200, 'nur die jüngsten 200 bleiben');
    // Der 200.-jüngste kam vor 200 s: noch 400 s bis wieder Platz ist.
    assert.equal(guard.check('192.0.2.1').retryAfterSeconds, 400);
  });

  it('Speicher: keine Adressen, nur Pseudonyme; ein neuer Start hat neue Pseudonyme', () => {
    const one = new PairingGuard(() => 0);
    const two = new PairingGuard(() => 0);
    one.recordFailure('203.0.113.7');
    two.recordFailure('203.0.113.7');
    const keysOne = [...(one as unknown as { senders: Map<string, unknown> }).senders.keys()];
    const keysTwo = [...(two as unknown as { senders: Map<string, unknown> }).senders.keys()];
    assert.equal(keysOne.length, 1);
    assert.match(keysOne[0], /^[A-Za-z0-9_-]{22}$/);
    assert.ok(!keysOne[0].includes('203'), 'keine Adresse im Schlüssel');
    assert.notEqual(keysOne[0], keysTwo[0], 'Schlüssel je Start neu');
    assert.deepEqual(Object.keys(one.counts).sort(), ['absender', 'fehlversucheInsgesamt', 'geraeteNetze']);
  });
});
