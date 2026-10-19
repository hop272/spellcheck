// Tests for traditional spell checking
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { traditionalSpellCheck } from '../src/spellcheck/traditional.js';

describe('traditionalSpellCheck', () => {
  it('detects misspelled words', async () => {
    const result = await traditionalSpellCheck('This is a tset');
    assert.strictEqual(result.errors.length, 1);
    assert.strictEqual(result.errors[0].word, 'tset');
    assert.strictEqual(result.errors[0].type, 'spelling');
    assert.strictEqual(result.errors[0].source, 'traditional');
  });

  it('returns suggestions for misspelled words', async () => {
    const result = await traditionalSpellCheck('This is a tset');
    assert.ok(result.errors[0].suggestions.length > 0);
    assert.ok(result.errors[0].suggestions.includes('test'));
  });

  it('ignores correct words', async () => {
    const result = await traditionalSpellCheck('This is correct');
    assert.strictEqual(result.errors.length, 0);
  });

  it('skips ALL CAPS words (likely acronyms)', async () => {
    const result = await traditionalSpellCheck('The GTM strategy and API calls');
    const words = result.errors.map(e => e.word);
    assert.ok(!words.includes('GTM'));
    assert.ok(!words.includes('API'));
  });

  it('skips camelCase words (likely code/brands)', async () => {
    const result = await traditionalSpellCheck('Using JavaScript and TypeScript');
    const words = result.errors.map(e => e.word);
    assert.ok(!words.includes('JavaScript'));
    assert.ok(!words.includes('TypeScript'));
  });

  it('respects custom terminology', async () => {
    const result = await traditionalSpellCheck('Using Kubernetes and gtm', ['kubernetes', 'gtm']);
    const words = result.errors.map(e => e.word);
    assert.ok(!words.includes('gtm'));
  });

  it('returns stats', async () => {
    const result = await traditionalSpellCheck('This is a tset with som errors');
    assert.ok(result.stats.totalWords > 0);
    assert.ok(result.stats.errorCount > 0);
    assert.strictEqual(result.stats.errorCount, result.errors.length);
  });

  it('handles empty input', async () => {
    const result = await traditionalSpellCheck('');
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.stats.totalWords, 0);
  });
});
