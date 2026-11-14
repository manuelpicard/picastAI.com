import assert from 'node:assert/strict';
import test from 'node:test';
import { addUsage, costUsd, formatUsd, LIST_PRICES, pricesFor, usageFromAnthropic, ZERO_USAGE } from './costs.js';

test('pricesFor: Listenpreis nach Modellname, eigene Preise per Einstellung, unbekannt = null', () => {
  assert.deepEqual(pricesFor('claude-sonnet-5-5'), LIST_PRICES.sonnet);
  assert.deepEqual(pricesFor('claude-haiku-5-5'), LIST_PRICES.haiku);
  assert.deepEqual(pricesFor('claude-opus-5-5'), LIST_PRICES.opus);
  assert.deepEqual(pricesFor('claude-sonnet-5-5', '3,15,3.75,0.3'), { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 });
  assert.deepEqual(pricesFor('claude-sonnet-5-5', 'kaputt'), LIST_PRICES.sonnet);
  assert.equal(pricesFor('irgendwas'), null);
});

test('costUsd: Sonnet 5.5, typischer Geschichtenteil', () => {
  // 3000 Eingabe, 2500 aus dem Cache gelesen, 900 Ausgabe: 0,006 + 0,00025 + 0,009 = 0,01525 $
  const usage = { input: 3000, output: 900, cacheWrite: 0, cacheRead: 2500 };
  assert.equal(formatUsd(costUsd(usage, LIST_PRICES.sonnet)), '0.015250');
  assert.equal(formatUsd(costUsd({ ...ZERO_USAGE, cacheWrite: 1_000_000 }, LIST_PRICES.sonnet)), '2.500000');
});

test('usageFromAnthropic: Felder der Messages-API, Unsinn zählt als 0', () => {
  assert.deepEqual(
    usageFromAnthropic({ input_tokens: 12, output_tokens: 34, cache_creation_input_tokens: 5, cache_read_input_tokens: 6 }),
    { input: 12, output: 34, cacheWrite: 5, cacheRead: 6 }
  );
  assert.deepEqual(usageFromAnthropic(undefined), ZERO_USAGE);
  assert.deepEqual(usageFromAnthropic({ input_tokens: -3, output_tokens: 'x' }), ZERO_USAGE);
  assert.deepEqual(addUsage({ input: 1, output: 2, cacheWrite: 3, cacheRead: 4 }, { input: 1, output: 1, cacheWrite: 1, cacheRead: 1 }), { input: 2, output: 3, cacheWrite: 4, cacheRead: 5 });
});
