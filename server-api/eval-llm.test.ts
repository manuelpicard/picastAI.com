import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assignBlindLabels, countWords, median, seededRandom, summarizeModel, type EvalPrompt, type EvalRow } from './eval-llm.js';

test('countWords und median', () => {
  assert.equal(countWords('  eins   zwei drei '), 3);
  assert.equal(countWords(''), 0);
  assert.equal(median([]), 0);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 3);
});

test('Blind-Labels: deterministisch pro Seed, jedes Modell genau einmal', () => {
  const models = ['a:1', 'b:2', 'c:3'];
  const first = assignBlindLabels(models, seededRandom(7));
  const second = assignBlindLabels(models, seededRandom(7));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), ['A', 'B', 'C']);
  assert.deepEqual(Object.values(first).sort(), models);
});

test('Blind-Labels: verschiedene Prompts mischen unterschiedlich (nicht immer dieselbe Reihenfolge)', () => {
  const models = ['a:1', 'b:2', 'c:3', 'd:4'];
  const random = seededRandom(42);
  const orders = new Set(Array.from({ length: 12 }, () => JSON.stringify(assignBlindLabels(models, random))));
  assert.ok(orders.size > 1);
});

const row = (over: Partial<EvalRow>): EvalRow => ({
  model: 'm',
  promptId: 'p',
  mode: 'frage',
  kind: 'frage',
  fixed: null,
  speech: '',
  ms: 100,
  llmCalls: 1,
  llmFailed: false,
  error: null,
  rejectedByOutputScreen: false,
  storyWords: 0,
  expectFixed: null,
  safetyOk: null,
  ...over,
});

test('summarizeModel zählt Fehler, Ablehnungen, Geschichtenlänge und Sicherheitsfälle', () => {
  const rows = [
    row({ ms: 100 }),
    row({ ms: 300, llmFailed: true }),
    row({ ms: 200, rejectedByOutputScreen: true }),
    row({ storyWords: 200, mode: 'geschichte' }),
    row({ storyWords: 120, mode: 'geschichte' }),
    row({ expectFixed: 'sicherheit', safetyOk: true }),
    row({ expectFixed: 'sicherheit', safetyOk: false }),
    row({ model: 'anderes', ms: 9999, llmFailed: true }),
  ];
  const summary = summarizeModel('m', rows, 170, 230);
  assert.equal(summary.turns, 7);
  assert.equal(summary.llmFailedTurns, 1);
  assert.equal(summary.rejectedByOutputScreen, 1);
  assert.equal(summary.storyTurns, 2);
  assert.equal(summary.avgStoryWords, 160);
  assert.equal(summary.storyInRange, 1);
  assert.equal(summary.safetyOk, 1);
  assert.equal(summary.safetyTotal, 2);
  assert.equal(summary.maxMs, 300);
});

test('Prompt-Datei ist gültig: eindeutige IDs, bekannte Modi, Sicherheitsfälle vorhanden', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const prompts: EvalPrompt[] = JSON.parse(fs.readFileSync(path.join(here, 'eval-prompts.json'), 'utf8'));
  assert.ok(prompts.length >= 25);
  assert.equal(new Set(prompts.map((p) => p.id)).size, prompts.length);
  for (const prompt of prompts) {
    assert.ok(['frage', 'geschichte', 'weiter'].includes(prompt.mode), prompt.id);
    assert.ok(prompt.text.trim().length > 0, prompt.id);
  }
  assert.ok(prompts.filter((p) => p.expectFixed === 'sicherheit').length >= 4);
});
