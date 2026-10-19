// Tests for functional programming utilities
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { pipe, partition, unique, Result } from '../src/utils/fp.js';

describe('fp utilities', () => {
  describe('pipe', () => {
    it('composes functions left to right', () => {
      const add1 = x => x + 1;
      const double = x => x * 2;
      const result = pipe(add1, double)(5);
      assert.strictEqual(result, 12); // (5 + 1) * 2
    });

    it('works with single function', () => {
      const add1 = x => x + 1;
      const result = pipe(add1)(5);
      assert.strictEqual(result, 6);
    });
  });

  describe('partition', () => {
    it('splits array by predicate', () => {
      const isEven = x => x % 2 === 0;
      const [evens, odds] = partition(isEven, [1, 2, 3, 4, 5]);
      assert.deepStrictEqual(evens, [2, 4]);
      assert.deepStrictEqual(odds, [1, 3, 5]);
    });

    it('handles empty array', () => {
      const [pass, fail] = partition(x => x, []);
      assert.deepStrictEqual(pass, []);
      assert.deepStrictEqual(fail, []);
    });

    it('is curried', () => {
      const partitionByEven = partition(x => x % 2 === 0);
      const [evens, odds] = partitionByEven([1, 2, 3]);
      assert.deepStrictEqual(evens, [2]);
      assert.deepStrictEqual(odds, [1, 3]);
    });
  });

  describe('unique', () => {
    it('removes duplicates', () => {
      const result = unique([1, 2, 2, 3, 3, 3]);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });

    it('preserves order', () => {
      const result = unique([3, 1, 2, 1, 3]);
      assert.deepStrictEqual(result, [3, 1, 2]);
    });

    it('handles strings', () => {
      const result = unique(['a', 'b', 'a', 'c']);
      assert.deepStrictEqual(result, ['a', 'b', 'c']);
    });
  });

  describe('Result', () => {
    it('creates ok result', () => {
      const result = Result.ok(42);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, 42);
    });

    it('creates err result', () => {
      const result = Result.err('something went wrong');
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error, 'something went wrong');
    });
  });
});
