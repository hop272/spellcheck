// Tests for AI spell checking utilities
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseAIResponse } from '../src/spellcheck/ai.js';

describe('parseAIResponse', () => {
  it('parses valid JSON with errors array', () => {
    const input = JSON.stringify({
      errors: [
        { word: 'tset', suggestion: 'test', reason: 'typo', type: 'spelling' },
        { word: 'Im', suggestion: "I'm", reason: 'grammar', type: 'grammar' },
      ],
    });

    const result = parseAIResponse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.length, 2);
    assert.strictEqual(result.value[0].word, 'tset');
    assert.strictEqual(result.value[0].suggestion, 'test');
    assert.strictEqual(result.value[0].source, 'ai');
  });

  it('handles empty errors array', () => {
    const input = JSON.stringify({ errors: [] });
    const result = parseAIResponse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.length, 0);
  });

  it('filters out items without word or suggestion', () => {
    const input = JSON.stringify({
      errors: [
        { word: 'valid', suggestion: 'ok' },
        { word: 'missing-suggestion' },
        { suggestion: 'missing-word' },
        {},
      ],
    });

    const result = parseAIResponse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.length, 1);
    assert.strictEqual(result.value[0].word, 'valid');
  });

  it('returns error for invalid JSON', () => {
    const result = parseAIResponse('not valid json');
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('Failed to parse'));
  });

  it('handles direct array format', () => {
    const input = JSON.stringify([
      { word: 'test', suggestion: 'fixed' },
    ]);

    const result = parseAIResponse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.length, 1);
  });

  it('adds default values for missing fields', () => {
    const input = JSON.stringify({
      errors: [{ word: 'test', suggestion: 'fixed' }],
    });

    const result = parseAIResponse(input);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value[0].type, 'spelling');
    assert.strictEqual(result.value[0].reason, 'Potential issue');
    assert.strictEqual(result.value[0].source, 'ai');
    assert.deepStrictEqual(result.value[0].suggestions, ['fixed']);
  });
});
